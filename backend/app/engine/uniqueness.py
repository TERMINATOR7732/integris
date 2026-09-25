"""Uniqueness Analyzer for INTEGRIS.

Detects exact duplicate rows, candidate primary-key integrity failures,
and composite candidate identifiers.
"""

from typing import Any
import re
import pandas as pd

from app.models.report import (
    ColumnProfile,
    Evidence,
    Finding,
    FindingCategory,
    Recommendation,
    Severity,
)

STRONG_ID_TOKENS = {"id", "uuid", "guid", "pk", "identifier", "ident"}

NON_IDENTIFIER_KEY_MODIFIERS = {
    "foreign", "fk", "sort", "partition", "group", "routing", "cache", "meta",
    "encryption", "public", "private", "secret", "license", "config", "setting",
}

ENTITY_CODE_QUALIFIERS = {
    "product", "customer", "user", "employee", "emp", "record", "account",
    "client", "vendor", "member", "item", "order", "invoice", "transaction",
    "txn", "entity", "person", "patient", "student", "supplier", "merchant",
    "asset", "serial", "tracking", "sku", "unique", "primary", "lookup",
}


def _tokenize_column_name(col_name: str) -> list[str]:
    """Split a column name into lowercase semantic tokens across naming conventions.

    Handles snake_case, kebab-case, spaces, camelCase, and PascalCase.
    """
    step1 = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", col_name.strip())
    step2 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", step1)
    return [tok.lower() for tok in re.split(r"[^a-zA-Z0-9]+", step2) if tok]


def _is_identifier_column(col_name: str) -> bool:
    """Determine whether a column name carries entity identifier semantics."""
    tokens = _tokenize_column_name(col_name)
    if not tokens:
        return False

    token_set = set(tokens)

    if token_set & STRONG_ID_TOKENS:
        return True

    if "key" in token_set and not (token_set & NON_IDENTIFIER_KEY_MODIFIERS):
        return True

    if "code" in token_set and (token_set & ENTITY_CODE_QUALIFIERS):
        return True

    if (token_set & {"no", "num", "number"}) and (token_set & ENTITY_CODE_QUALIFIERS) and "of" not in token_set:
        return True

    return False


def analyze_uniqueness(
    df: pd.DataFrame,
    column_profiles: list[ColumnProfile],
) -> list[Finding]:
    """Inspect dataset for duplicate records, identifier collisions, and composite keys.
    
    Args:
        df: Ingested tabular dataframe.
        column_profiles: Pre-computed column profiles.
        
    Returns:
        List of explainable forensic findings.
    """
    findings: list[Finding] = []
    total_rows = len(df)
    if total_rows <= 1:
        return findings

    # 1. Exact Duplicate Rows
    exact_dup_mask = df.duplicated(keep=False)
    dup_rows_count = int(df.duplicated(keep="first").sum())

    if dup_rows_count > 0:
        dup_ratio = dup_rows_count / total_rows
        affected_indices = df.index[exact_dup_mask].tolist()

        if dup_ratio >= 0.10:
            severity = Severity.CRITICAL
        elif dup_ratio >= 0.02:
            severity = Severity.HIGH
        else:
            severity = Severity.MEDIUM

        sample_rows_preview = []
        for idx in affected_indices[:3]:
            row_dict = {str(k): str(v)[:40] for k, v in df.iloc[idx].to_dict().items()}
            sample_rows_preview.append(row_dict)

        findings.append(
            Finding(
                id="FND-UNQ-EXACT-DUPS",
                category=FindingCategory.UNIQUENESS,
                severity=severity,
                title=f"Exact duplicate records detected ({dup_rows_count} rows, {dup_ratio:.1%})",
                description=(
                    f"The dataset contains {dup_rows_count} redundant duplicate records across all columns. "
                    f"Duplication skews aggregate statistics, produces false variance deflation, and risks double-counting in business reports."
                ),
                affected_columns=list(df.columns.astype(str)),
                affected_row_count=dup_rows_count,
                affected_row_ratio=round(dup_ratio, 4),
                evidence=[
                    Evidence(
                        metric_name="exact_duplicate_rows",
                        observed_value=dup_rows_count,
                        threshold_or_expected=0,
                        sample_row_indices=affected_indices[:10],
                        sample_values=sample_rows_preview,
                        details=f"{dup_rows_count} excess rows are completely identical to prior records.",
                    )
                ],
                recommendations=[
                    Recommendation(
                        finding_id="FND-UNQ-EXACT-DUPS",
                        action="Deduplicate records using primary keys or business timestamps before downstream consumption.",
                        reason="Duplicate records inflate sample sizes and compromise statistical independence assumptions.",
                        priority=severity,
                    )
                ],
            )
        )

    # 2. Candidate Primary-Key Collisions & Nulls
    col_profile_map = {p.name: p for p in column_profiles}

    for col in df.columns:
        col_str = str(col)
        profile = col_profile_map.get(col_str)

        is_named_id = _is_identifier_column(col_str)
        is_candidate = (
            profile.is_candidate_identifier
            if (profile and (is_named_id or profile.unique_count == total_rows))
            else False
        )

        if is_named_id or is_candidate:
            series = df[col]
            null_count = int(series.isna().sum())
            non_null_series = series.dropna()
            non_null_count = len(non_null_series)

            # Check key collisions (duplicates within candidate ID)
            if non_null_count > 0:
                id_dup_mask = non_null_series.duplicated(keep=False)
                collision_count = int(non_null_series.duplicated(keep="first").sum())

                if collision_count > 0:
                    collision_ratio = collision_count / total_rows
                    collision_indices = non_null_series[id_dup_mask].index.tolist()
                    colliding_values = non_null_series[id_dup_mask].unique().tolist()[:5]

                    findings.append(
                        Finding(
                            id=f"FND-UNQ-PK-COLLISION-{col_str}",
                            category=FindingCategory.UNIQUENESS,
                            severity=Severity.CRITICAL,
                            title=f"Primary key collision in candidate identifier '{col_str}'",
                            description=(
                                f"Column '{col_str}' appears to be an entity identifier but contains {collision_count} colliding "
                                f"records ({collision_ratio:.1%}). Repeating values like {colliding_values} destroy entity uniqueness."
                            ),
                            affected_columns=[col_str],
                            affected_row_count=collision_count,
                            affected_row_ratio=round(collision_ratio, 4),
                            evidence=[
                                Evidence(
                                    metric_name="identifier_collision_count",
                                    observed_value=collision_count,
                                    threshold_or_expected=0,
                                    sample_row_indices=collision_indices[:10],
                                    sample_values=colliding_values,
                                    details=f"Conflicting identical keys detected in multiple separate records: {colliding_values}.",
                                )
                            ],
                            recommendations=[
                                Recommendation(
                                    finding_id=f"FND-UNQ-PK-COLLISION-{col_str}",
                                    action=f"Resolve identifier collision in '{col_str}' before attempting database joins or entity mapping.",
                                    reason="Non-unique identifiers cause exponential cartesian explosions during relational joins.",
                                    priority=Severity.CRITICAL,
                                )
                            ],
                        )
                    )

            # Check nulls in candidate ID
            if null_count > 0 and is_named_id:
                null_ratio = null_count / total_rows
                findings.append(
                    Finding(
                        id=f"FND-UNQ-PK-NULL-{col_str}",
                        category=FindingCategory.UNIQUENESS,
                        severity=Severity.CRITICAL if null_ratio > 0.05 else Severity.HIGH,
                        title=f"Null entries present in candidate identifier '{col_str}'",
                        description=(
                            f"Candidate identifier column '{col_str}' contains {null_count} null entries ({null_ratio:.1%}). "
                            f"Entity identifiers must be strictly non-nullable."
                        ),
                        affected_columns=[col_str],
                        affected_row_count=null_count,
                        affected_row_ratio=round(null_ratio, 4),
                        evidence=[
                            Evidence(
                                metric_name="identifier_null_count",
                                observed_value=null_count,
                                threshold_or_expected=0,
                                sample_row_indices=df.index[series.isna()].tolist()[:10],
                                sample_values=["<NULL>"],
                                details=f"{null_count} records lack an entity identifier.",
                            )
                        ],
                        recommendations=[
                            Recommendation(
                                finding_id=f"FND-UNQ-PK-NULL-{col_str}",
                                action=f"Impute or assign unique keys to orphaned records in '{col_str}'.",
                                reason="Null identifiers lead to untrackable records and join failures.",
                                priority=Severity.HIGH,
                            )
                        ],
                    )
                )

    # 3. Composite Uniqueness Diagnostic (INFO signal if found)
    # If no single column is 100% unique, search for small 2-column composite key
    has_single_unique = any(p.unique_count == total_rows for p in column_profiles if p.null_count == 0)
    if not has_single_unique and len(df.columns) >= 2 and total_rows >= 10:
        candidate_cols = [c for c in df.columns if 5 < df[c].nunique() < total_rows and df[c].isna().sum() == 0]
        for i in range(min(5, len(candidate_cols))):
            for j in range(i + 1, min(6, len(candidate_cols))):
                col_a = candidate_cols[i]
                col_b = candidate_cols[j]
                if df[[col_a, col_b]].drop_duplicates().shape[0] == total_rows:
                    findings.append(
                        Finding(
                            id=f"FND-UNQ-COMPOSITE-{col_a}-{col_b}",
                            category=FindingCategory.UNIQUENESS,
                            severity=Severity.INFO,
                            title=f"Candidate composite key identified: ('{col_a}', '{col_b}')",
                            description=(
                                f"While no single column uniquely identifies every row, the combination of "
                                f"('{col_a}', '{col_b}') exhibits 100% uniqueness across all {total_rows} records."
                            ),
                            affected_columns=[str(col_a), str(col_b)],
                            affected_row_count=0,
                            affected_row_ratio=0.0,
                            evidence=[
                                Evidence(
                                    metric_name="composite_cardinality",
                                    observed_value=total_rows,
                                    threshold_or_expected=total_rows,
                                    sample_row_indices=[],
                                    sample_values=[],
                                    details="Composite pair achieves 100% distinct record identification.",
                                )
                            ],
                            recommendations=[
                                Recommendation(
                                    finding_id=f"FND-UNQ-COMPOSITE-{col_a}-{col_b}",
                                    action=f"Consider using ('{col_a}', '{col_b}') as the composite natural key for deduplication.",
                                    reason="Provides deterministic record addressability.",
                                    priority=Severity.INFO,
                                )
                            ],
                        )
                    )
                    break
            if any(f.id.startswith("FND-UNQ-COMPOSITE") for f in findings):
                break

    return findings
