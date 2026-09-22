"""Completeness Analyzer for INTEGRIS.

Detects standard nulls, empty/whitespace strings, disguised sentinel tokens,
and systematic cross-column missingness patterns.
"""

from typing import Any
import numpy as np
import pandas as pd

from app.models.report import (
    ColumnProfile,
    Evidence,
    Finding,
    FindingCategory,
    Recommendation,
    Severity,
)

# Text sentinel tokens commonly masking missing data
TEXT_SENTINELS = {
    "n/a", "na", "null", "none", "?", "unknown", "-", "--", "missing",
    "nan", "#n/a", "nil", "undefined", "blank", "none/specified"
}

# Numeric sentinel values commonly used as missing value placeholders
NUMERIC_SENTINELS = {-999, -9999, 9999, 99999, 999999, -1}


def analyze_completeness(
    df: pd.DataFrame,
    column_profiles: list[ColumnProfile],
) -> list[Finding]:
    """Inspect dataset for standard missingness, disguised tokens, and co-missingness.
    
    Args:
        df: Ingested tabular dataframe.
        column_profiles: Pre-computed column profiles.
        
    Returns:
        List of explainable forensic findings.
    """
    findings: list[Finding] = []
    total_rows = len(df)
    if total_rows == 0:
        return findings

    col_profile_map = {p.name: p for p in column_profiles}
    missing_indices_by_col: dict[str, set[int]] = {}

    for col in df.columns:
        col_str = str(col)
        series = df[col]
        profile = col_profile_map.get(col_str)
        is_identifier = profile.is_candidate_identifier if profile else False

        # 1. Standard nulls & whitespace detection
        raw_null_mask = series.isna()
        whitespace_mask = pd.Series(False, index=df.index)

        if pd.api.types.is_string_dtype(series) or series.dtype == object:
            str_series = series.astype(str)
            whitespace_mask = str_series.str.strip().eq("") & ~raw_null_mask

        total_missing_mask = raw_null_mask | whitespace_mask
        missing_count = int(total_missing_mask.sum())
        missing_ratio = missing_count / total_rows
        missing_indices = set(df.index[total_missing_mask].tolist())
        missing_indices_by_col[col_str] = missing_indices

        # Check for optional lifecycle columns (e.g. exit_date, termination_date, cancellation_date)
        is_optional_lifecycle = any(tok in col_str.lower() for tok in ["exit", "term", "end_date", "cancel", "dropout", "leave_date", "resign"])

        # Report significant standard missingness
        if missing_count > 0 and missing_ratio >= 0.05:
            # Determine severity
            if is_identifier:
                severity = Severity.CRITICAL if missing_ratio > 0.05 else Severity.HIGH
            elif is_optional_lifecycle:
                # Natural business sparsity for lifecycle milestones
                severity = Severity.INFO if missing_ratio >= 0.50 else Severity.LOW
            elif missing_ratio >= 0.50:
                severity = Severity.HIGH
            elif missing_ratio >= 0.20:
                severity = Severity.MEDIUM
            else:
                severity = Severity.LOW

            evidence_items = [
                Evidence(
                    metric_name="missing_ratio",
                    observed_value=round(missing_ratio, 4),
                    threshold_or_expected=0.05,
                    sample_row_indices=list(missing_indices)[:10],
                    sample_values=["<NULL>" if raw_null_mask.iloc[idx] else "<WHITESPACE>" for idx in list(missing_indices)[:5]],
                    details=f"Column '{col_str}' has {missing_count} missing records out of {total_rows} total ({missing_ratio:.1%}).",
                )
            ]

            rec_action = (
                f"Verify identifier generation pipeline; primary keys must never contain missing values."
                if is_identifier
                else f"Investigate root cause of missing entries in '{col_str}' before training models or running aggregations."
            )

            findings.append(
                Finding(
                    id=f"FND-CMP-MISS-{col_str}",
                    category=FindingCategory.COMPLETENESS,
                    severity=severity,
                    title=f"Significant missingness in '{col_str}' ({missing_ratio:.1%})",
                    description=(
                        f"Column '{col_str}' is missing {missing_count} of {total_rows} records. "
                        f"Pervasive missingness weakens downstream statistical reliability and induces estimation bias."
                    ),
                    affected_columns=[col_str],
                    affected_row_count=missing_count,
                    affected_row_ratio=round(missing_ratio, 4),
                    evidence=evidence_items,
                    recommendations=[
                        Recommendation(
                            finding_id=f"FND-CMP-MISS-{col_str}",
                            action=rec_action,
                            reason="Unmanaged missing data distorts summary statistics and breaks deterministic joins.",
                            priority=severity,
                        )
                    ],
                )
            )

        # 2. Disguised Text Sentinel Detection
        if pd.api.types.is_string_dtype(series) or series.dtype == object:
            non_null_mask = ~total_missing_mask
            clean_strings = series[non_null_mask].astype(str).str.strip().str.lower()
            sentinel_mask = clean_strings.isin(TEXT_SENTINELS)
            sentinel_count = int(sentinel_mask.sum())

            if sentinel_count > 0:
                sentinel_ratio = sentinel_count / total_rows
                sentinel_indices = clean_strings[sentinel_mask].index.tolist()
                matched_tokens = series.loc[sentinel_indices].unique().tolist()[:5]

                severity = Severity.HIGH if sentinel_ratio >= 0.10 else Severity.MEDIUM

                findings.append(
                    Finding(
                        id=f"FND-CMP-SENT-TXT-{col_str}",
                        category=FindingCategory.COMPLETENESS,
                        severity=severity,
                        title=f"Disguised text missing values detected in '{col_str}'",
                        description=(
                            f"Column '{col_str}' contains {sentinel_count} records ({sentinel_ratio:.1%}) with placeholder "
                            f"text tokens like {matched_tokens} masquerading as valid data entries."
                        ),
                        affected_columns=[col_str],
                        affected_row_count=sentinel_count,
                        affected_row_ratio=round(sentinel_ratio, 4),
                        evidence=[
                            Evidence(
                                metric_name="disguised_text_token_count",
                                observed_value=sentinel_count,
                                threshold_or_expected=0,
                                sample_row_indices=sentinel_indices[:10],
                                sample_values=matched_tokens,
                                details=f"Observed placeholder tokens: {', '.join(map(str, matched_tokens))}.",
                            )
                        ],
                        recommendations=[
                            Recommendation(
                                finding_id=f"FND-CMP-SENT-TXT-{col_str}",
                                action=f"Normalize sentinel tokens {matched_tokens} to standard null representations.",
                                reason="Downstream tools will treat disguised strings as genuine categorical categories.",
                                priority=severity,
                            )
                        ],
                    )
                )

        # 3. Disguised Numeric Sentinel Detection
        if pd.api.types.is_numeric_dtype(series):
            valid_nums = series.dropna()
            if len(valid_nums) >= 10:
                for sentinel in NUMERIC_SENTINELS:
                    sentinel_hits = valid_nums[valid_nums == sentinel]
                    hit_count = len(sentinel_hits)
                    if hit_count > 0:
                        # Validate contextual abnormality: is sentinel an extreme outlier vs the rest?
                        other_nums = valid_nums[valid_nums != sentinel]
                        if len(other_nums) >= 5:
                            q25 = other_nums.quantile(0.25)
                            q75 = other_nums.quantile(0.75)
                            iqr = q75 - q25
                            # If sentinel is outside [q25 - 3*iqr, q75 + 3*iqr] or other_nums are strictly non-negative and sentinel is negative
                            is_suspicious = False
                            if sentinel < 0 and (other_nums >= 0).mean() > 0.95:
                                is_suspicious = True
                            elif iqr > 0 and (sentinel < (q25 - 3 * iqr) or sentinel > (q75 + 3 * iqr)):
                                is_suspicious = True

                            if is_suspicious:
                                sentinel_ratio = hit_count / total_rows
                                sentinel_indices = sentinel_hits.index.tolist()
                                severity = Severity.HIGH if sentinel_ratio > 0.05 else Severity.MEDIUM

                                findings.append(
                                    Finding(
                                        id=f"FND-CMP-SENT-NUM-{col_str}-{sentinel}",
                                        category=FindingCategory.COMPLETENESS,
                                        severity=severity,
                                        title=f"Disguised numeric sentinel ({sentinel}) in '{col_str}'",
                                        description=(
                                            f"Column '{col_str}' contains {hit_count} instances of '{sentinel}'. "
                                            f"The remainder of the distribution is strictly within [{other_nums.min()}, {other_nums.max()}], "
                                            f"indicating '{sentinel}' is a sentinel missing value code rather than an organic observation."
                                        ),
                                        affected_columns=[col_str],
                                        affected_row_count=hit_count,
                                        affected_row_ratio=round(sentinel_ratio, 4),
                                        evidence=[
                                            Evidence(
                                                metric_name="numeric_sentinel_outlier",
                                                observed_value=sentinel,
                                                threshold_or_expected=f"Distribution range: [{other_nums.min()}, {other_nums.max()}]",
                                                sample_row_indices=sentinel_indices[:10],
                                                sample_values=[sentinel],
                                                details=f"Sentinel occurs {hit_count} times while 95%+ of column is bounded in [{other_nums.min()}, {other_nums.max()}].",
                                            )
                                        ],
                                        recommendations=[
                                            Recommendation(
                                                finding_id=f"FND-CMP-SENT-NUM-{col_str}-{sentinel}",
                                                action=f"Recode sentinel numeric value {sentinel} to NaN/null prior to statistical modeling.",
                                                reason="Treating sentinels as literal values creates severe arithmetic distortion in means and regressions.",
                                                priority=severity,
                                            )
                                        ],
                                    )
                                )

    # 4. Cross-Column Co-Missingness Patterns
    checked_pairs: set[tuple[str, str]] = set()
    cols_with_missing = [c for c, s in missing_indices_by_col.items() if len(s) >= max(3, int(total_rows * 0.05))]

    for i in range(len(cols_with_missing)):
        for j in range(i + 1, len(cols_with_missing)):
            col_a = cols_with_missing[i]
            col_b = cols_with_missing[j]
            pair_key = (col_a, col_b)
            if pair_key in checked_pairs:
                continue
            checked_pairs.add(pair_key)

            set_a = missing_indices_by_col[col_a]
            set_b = missing_indices_by_col[col_b]
            overlap = set_a.intersection(set_b)
            overlap_count = len(overlap)

            # Jaccard similarity of missingness patterns
            union_len = len(set_a.union(set_b))
            jaccard = overlap_count / union_len if union_len > 0 else 0.0

            if jaccard >= 0.90 and overlap_count >= 5:
                findings.append(
                    Finding(
                        id=f"FND-CMP-COMISS-{col_a}-{col_b}",
                        category=FindingCategory.COMPLETENESS,
                        severity=Severity.MEDIUM,
                        title=f"Systematic co-missingness between '{col_a}' and '{col_b}'",
                        description=(
                            f"Columns '{col_a}' and '{col_b}' share an almost identical pattern of missingness "
                            f"(Jaccard index {jaccard:.2f}, {overlap_count} identical missing rows). "
                            f"This strongly suggests a systemic collection or upstream extraction failure rather than random omission."
                        ),
                        affected_columns=[col_a, col_b],
                        affected_row_count=overlap_count,
                        affected_row_ratio=round(overlap_count / total_rows, 4),
                        evidence=[
                            Evidence(
                                metric_name="missingness_jaccard_similarity",
                                observed_value=round(jaccard, 4),
                                threshold_or_expected=0.90,
                                sample_row_indices=list(overlap)[:10],
                                sample_values=[],
                                details=f"{overlap_count} records are concurrently missing in both columns.",
                            )
                        ],
                        recommendations=[
                            Recommendation(
                                finding_id=f"FND-CMP-COMISS-{col_a}-{col_b}",
                                action=f"Investigate data ingestion pipeline to determine why '{col_a}' and '{col_b}' drop out in lockstep.",
                                reason="Coupled missingness indicates structural failure in data logging.",
                                priority=Severity.MEDIUM,
                            )
                        ],
                    )
                )

    return findings
