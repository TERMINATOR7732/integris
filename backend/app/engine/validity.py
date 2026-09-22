"""Validity Analyzer for INTEGRIS.

Detects type drift (mixed types in numeric columns), format anomalies
(inconsistent dates/numbers), and categorical casing inconsistencies.
"""

import re
from typing import Any
import pandas as pd

from app.models.report import (
    ColumnProfile,
    Evidence,
    Finding,
    FindingCategory,
    Recommendation,
    Severity,
)

# Common date regex patterns for format inference
DATE_PATTERNS = [
    ("ISO_8601", r"^\d{4}-\d{2}-\d{2}$"),
    ("SLASH_DMY", r"^\d{1,2}/\d{1,2}/\d{4}$"),
    ("SLASH_MDY", r"^\d{1,2}/\d{1,2}/\d{2}$"),
    ("DOT_DMY", r"^\d{1,2}\.\d{1,2}\.\d{4}$"),
]


def _try_parse_numeric(val: Any) -> bool:
    """Return True if scalar value can be converted to float."""
    if pd.isna(val):
        return False
    try:
        float(str(val).strip())
        return True
    except (ValueError, TypeError):
        return False


def analyze_validity(
    df: pd.DataFrame,
    column_profiles: list[ColumnProfile],
) -> list[Finding]:
    """Inspect dataset for type drift, inconsistent formats, and categorical drift.
    
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

    for col in df.columns:
        col_str = str(col)
        series = df[col]
        non_null_series = series.dropna()
        non_null_count = len(non_null_series)
        if non_null_count < 3:
            continue

        # 1. Type Drift in Object Columns (Predominantly Numeric with Contaminated Strings)
        if series.dtype == object or isinstance(series.dtype, pd.StringDtype):
            numeric_mask = non_null_series.apply(_try_parse_numeric)
            numeric_count = int(numeric_mask.sum())
            numeric_ratio = numeric_count / non_null_count

            # If between 60% and 99.9% are numeric, the non-numeric values constitute type drift
            if 0.60 <= numeric_ratio < 1.0:
                drift_mask = ~numeric_mask
                drift_count = int(drift_mask.sum())
                drift_indices = non_null_series[drift_mask].index.tolist()
                sample_corrupted = non_null_series[drift_mask].unique().tolist()[:5]

                findings.append(
                    Finding(
                        id=f"FND-VAL-TYPEDRIFT-{col_str}",
                        category=FindingCategory.VALIDITY,
                        severity=Severity.HIGH,
                        title=f"Type drift detected in '{col_str}' ({numeric_ratio:.1%} numeric, {drift_count} contaminated strings)",
                        description=(
                            f"Column '{col_str}' appears to be a numeric field ({numeric_count} of {non_null_count} valid numbers), "
                            f"but contains {drift_count} non-numeric textual entries like {sample_corrupted}. "
                            f"This forces the entire column to be treated as untyped text, preventing mathematical and statistical computation."
                        ),
                        affected_columns=[col_str],
                        affected_row_count=drift_count,
                        affected_row_ratio=round(drift_count / total_rows, 4),
                        evidence=[
                            Evidence(
                                metric_name="non_numeric_contaminants",
                                observed_value=drift_count,
                                threshold_or_expected=0,
                                sample_row_indices=drift_indices[:10],
                                sample_values=sample_corrupted,
                                details=f"Contaminating non-numeric text values found: {sample_corrupted}.",
                            )
                        ],
                        recommendations=[
                            Recommendation(
                                finding_id=f"FND-VAL-TYPEDRIFT-{col_str}",
                                action=f"Sanitize or extract numeric values from contaminated records in '{col_str}' and cast column to float/int.",
                                reason="Mixed-type columns fail downstream schema validation and break ML pipelines.",
                                priority=Severity.HIGH,
                            )
                        ],
                    )
                )

        # 2. Date Format Inconsistencies
        # Check columns with date in name or sampled date patterns
        col_lower = col_str.lower()
        is_date_named = any(tok in col_lower for tok in ["date", "time", "hire", "exit", "birth", "dob", "created", "updated"])
        if is_date_named and (series.dtype == object or isinstance(series.dtype, pd.StringDtype)):
            str_dates = non_null_series.astype(str).str.strip()
            pattern_counts: dict[str, int] = {}
            for pat_name, pat_regex in DATE_PATTERNS:
                matches = str_dates.str.match(pat_regex)
                count = int(matches.sum())
                if count > 0:
                    pattern_counts[pat_name] = count

            if len(pattern_counts) > 1 or (len(pattern_counts) == 1 and sum(pattern_counts.values()) < non_null_count):
                # Dominant format vs anomalies
                sorted_patterns = sorted(pattern_counts.items(), key=lambda x: x[1], reverse=True)
                dominant_pattern, dominant_count = sorted_patterns[0] if sorted_patterns else ("UNKNOWN", 0)
                anomaly_count = non_null_count - dominant_count

                if anomaly_count > 0 and (anomaly_count / non_null_count) >= 0.02:
                    # Find rows not matching dominant pattern
                    if sorted_patterns:
                        _, dom_regex = next(p for p in DATE_PATTERNS if p[0] == dominant_pattern)
                        non_matching = str_dates[~str_dates.str.match(dom_regex)]
                    else:
                        non_matching = str_dates

                    sample_deviant = non_matching.unique().tolist()[:5]
                    deviant_indices = non_matching.index.tolist()[:10]

                    findings.append(
                        Finding(
                            id=f"FND-VAL-DATE-FORMAT-{col_str}",
                            category=FindingCategory.VALIDITY,
                            severity=Severity.MEDIUM,
                            title=f"Inconsistent date formats in '{col_str}' (dominant: {dominant_pattern})",
                            description=(
                                f"Column '{col_str}' exhibits mixed date formatting. While {dominant_count} entries follow {dominant_pattern}, "
                                f"{anomaly_count} entries exhibit competing formats or unparseable text (e.g. {sample_deviant})."
                            ),
                            affected_columns=[col_str],
                            affected_row_count=anomaly_count,
                            affected_row_ratio=round(anomaly_count / total_rows, 4),
                            evidence=[
                                Evidence(
                                    metric_name="format_breakdown",
                                    observed_value=pattern_counts,
                                    threshold_or_expected=f"100% {dominant_pattern}",
                                    sample_row_indices=deviant_indices,
                                    sample_values=sample_deviant,
                                    details=f"Deviant values include: {sample_deviant}.",
                                )
                            ],
                            recommendations=[
                                Recommendation(
                                    finding_id=f"FND-VAL-DATE-FORMAT-{col_str}",
                                    action=f"Standardize all date entries in '{col_str}' to ISO 8601 (YYYY-MM-DD).",
                                    reason="Inconsistent date parsing causes silent timezone and day/month swapping errors.",
                                    priority=Severity.MEDIUM,
                                )
                            ],
                        )
                    )

        # 3. Categorical Casing and Variation Inconsistency
        if series.dtype == object or isinstance(series.dtype, pd.StringDtype):
            unique_raw = non_null_series.unique()
            if 1 < len(unique_raw) <= 50:  # Categorical scope
                # Group by normalized representation
                canonical_groups: dict[str, set[str]] = {}
                for val in unique_raw:
                    val_str = str(val).strip()
                    norm_key = val_str.lower()
                    canonical_groups.setdefault(norm_key, set()).add(val_str)

                # Identify groups with casing drift
                casing_anomalies: list[tuple[str, list[str]]] = []
                for norm_key, variants in canonical_groups.items():
                    if len(variants) > 1:
                        casing_anomalies.append((norm_key, sorted(list(variants))))

                if casing_anomalies:
                    total_affected_rows = 0
                    all_variants_flat = []
                    affected_indices = []
                    for _, variants in casing_anomalies:
                        all_variants_flat.extend(variants)
                        mask = non_null_series.isin(variants)
                        total_affected_rows += int(mask.sum())
                        affected_indices.extend(non_null_series[mask].index.tolist())

                    findings.append(
                        Finding(
                            id=f"FND-VAL-CAT-CASING-{col_str}",
                            category=FindingCategory.VALIDITY,
                            severity=Severity.MEDIUM,
                            title=f"Categorical casing drift in '{col_str}'",
                            description=(
                                f"Column '{col_str}' contains identical semantic categories represented with conflicting casing styles: "
                                f"{[v for _, v in casing_anomalies]}. This will fragment SQL GROUP BY queries and feature encoding."
                            ),
                            affected_columns=[col_str],
                            affected_row_count=total_affected_rows,
                            affected_row_ratio=round(total_affected_rows / total_rows, 4),
                            evidence=[
                                Evidence(
                                    metric_name="conflicting_category_variants",
                                    observed_value=[v for _, v in casing_anomalies],
                                    threshold_or_expected="Uniform casing per categorical entity",
                                    sample_row_indices=affected_indices[:10],
                                    sample_values=all_variants_flat[:8],
                                    details="Inconsistent casing causes duplicate category buckets in downstream analytics.",
                                )
                            ],
                            recommendations=[
                                Recommendation(
                                    finding_id=f"FND-VAL-CAT-CASING-{col_str}",
                                    action=f"Normalize column '{col_str}' using consistent title or upper casing.",
                                    reason="Casing variations create artificial cardinality expansion in one-hot encoders.",
                                    priority=Severity.MEDIUM,
                                )
                            ],
                        )
                    )

    return findings
