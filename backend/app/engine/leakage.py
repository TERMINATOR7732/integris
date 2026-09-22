"""Data Leakage Indicator Analyzer for INTEGRIS.

Detects statistical proxies, extreme target associations, near-duplicate target
encodings, and feature-target causality anomalies.
"""

from typing import Any
import numpy as np
import pandas as pd
from scipy import stats

from app.models.report import (
    ColumnProfile,
    Evidence,
    Finding,
    FindingCategory,
    Recommendation,
    Severity,
)


def analyze_leakage(
    df: pd.DataFrame,
    column_profiles: list[ColumnProfile],
    target_column: str | None = None,
) -> list[Finding]:
    """Inspect dataset for potential target leakage indicators.
    
    Args:
        df: Ingested tabular dataframe.
        column_profiles: Pre-computed column profiles.
        target_column: User-specified target feature name (optional).
        
    Returns:
        List of explainable forensic findings.
    """
    findings: list[Finding] = []
    total_rows = len(df)

    if not target_column or target_column not in df.columns or total_rows < 5:
        # If no target specified or too few rows, gracefully skip
        return findings

    target_series = df[target_column]
    is_target_numeric = pd.api.types.is_numeric_dtype(target_series)
    col_profile_map = {p.name: p for p in column_profiles}

    for col in df.columns:
        col_str = str(col)
        if col_str == target_column:
            continue

        series = df[col]
        profile = col_profile_map.get(col_str)
        is_id = profile.is_candidate_identifier if profile else False

        # 1. Exact or Near-Duplicate Target Proxy (Categorical or Object)
        valid_both = df[[col, target_column]].dropna()
        if len(valid_both) >= 10:
            match_rate = float((valid_both[col].astype(str).str.strip().str.lower() == valid_both[target_column].astype(str).str.strip().str.lower()).mean())
            if match_rate >= 0.95:
                findings.append(
                    Finding(
                        id=f"FND-LKG-PROXY-{col_str}",
                        category=FindingCategory.DATA_LEAKAGE,
                        severity=Severity.CRITICAL,
                        title=f"Potential target leakage indicator: Near-identical target proxy in '{col_str}' ({match_rate:.1%} identity)",
                        description=(
                            f"Column '{col_str}' matches target column '{target_column}' in {match_rate:.1%} of observed records. "
                            f"Features that duplicate or directly mirror the prediction target create artificial near-perfect "
                            f"evaluation metrics in development but produce catastrophic generalization failure in production."
                        ),
                        affected_columns=[col_str, target_column],
                        affected_row_count=int(match_rate * len(valid_both)),
                        affected_row_ratio=round(match_rate, 4),
                        evidence=[
                            Evidence(
                                metric_name="target_identity_ratio",
                                observed_value=round(match_rate, 4),
                                threshold_or_expected="< 0.90",
                                sample_row_indices=valid_both.index[:10].tolist(),
                                sample_values=[{"feature": str(valid_both[col].iloc[i]), "target": str(valid_both[target_column].iloc[i])} for i in range(min(5, len(valid_both)))],
                                details="Extreme value alignment indicates feature was likely derived from or recorded concurrently with the target.",
                            )
                        ],
                        recommendations=[
                            Recommendation(
                                finding_id=f"FND-LKG-PROXY-{col_str}",
                                action=f"Exclude '{col_str}' from model feature sets unless its operational availability at inference time is guaranteed.",
                                reason="Target proxies induce severe training-serving skew.",
                                priority=Severity.CRITICAL,
                            )
                        ],
                    )
                )
                continue

        # 2. Extreme Numeric Correlation (Pearson & Spearman)
        if is_target_numeric and pd.api.types.is_numeric_dtype(series):
            valid_num = df[[col, target_column]].dropna()
            if len(valid_num) >= 10:
                try:
                    r_pearson, _ = stats.pearsonr(valid_num[col], valid_num[target_column])
                    r_spearman, _ = stats.spearmanr(valid_num[col], valid_num[target_column])
                    max_corr = max(abs(r_pearson), abs(r_spearman))

                    if max_corr >= 0.95 and not is_id:
                        severity = Severity.CRITICAL if max_corr >= 0.98 else Severity.HIGH
                        findings.append(
                            Finding(
                                id=f"FND-LKG-CORR-{col_str}",
                                category=FindingCategory.DATA_LEAKAGE,
                                severity=severity,
                                title=f"Potential target leakage indicator: Extreme correlation with target in '{col_str}' (r = {max_corr:.3f})",
                                description=(
                                    f"Column '{col_str}' exhibits an extraordinarily high statistical association with target "
                                    f"'{target_column}' (Pearson: {r_pearson:.3f}, Spearman: {r_spearman:.3f}). "
                                    f"While strong signals exist naturally, near-perfect linear relationships often indicate "
                                    f"reverse causality or post-outcome feature capture."
                                ),
                                affected_columns=[col_str, target_column],
                                affected_row_count=len(valid_num),
                                affected_row_ratio=round(len(valid_num) / total_rows, 4),
                                evidence=[
                                    Evidence(
                                        metric_name="maximum_correlation_coefficient",
                                        observed_value=round(float(max_corr), 4),
                                        threshold_or_expected="< 0.95",
                                        sample_row_indices=[],
                                        sample_values=[],
                                        details=f"Pearson r={r_pearson:.4f}, Spearman r={r_spearman:.4f}.",
                                    )
                                ],
                                recommendations=[
                                    Recommendation(
                                        finding_id=f"FND-LKG-CORR-{col_str}",
                                        action=f"Verify timestamp provenance of '{col_str}' to ensure it is collected strictly prior to '{target_column}'.",
                                        reason="Predicting with post-outcome signals results in useless predictive models.",
                                        priority=severity,
                                    )
                                ],
                            )
                        )
                except Exception:
                    pass

        # 3. Deterministic Categorical Association (Cramér's V)
        if not is_target_numeric and not pd.api.types.is_numeric_dtype(series) and not is_id:
            valid_cat = df[[col, target_column]].dropna()
            if len(valid_cat) >= 15:
                try:
                    crosstab = pd.crosstab(valid_cat[col], valid_cat[target_column])
                    if crosstab.shape[0] > 1 and crosstab.shape[1] > 1:
                        cramer_v = float(stats.contingency.association(crosstab.values, method="cramer"))
                        if cramer_v >= 0.95:
                            findings.append(
                                Finding(
                                    id=f"FND-LKG-CRAMER-{col_str}",
                                    category=FindingCategory.DATA_LEAKAGE,
                                    severity=Severity.HIGH,
                                    title=f"Potential target leakage indicator: Deterministic association with target in '{col_str}' (Cramér's V: {cramer_v:.3f})",
                                    description=(
                                        f"Column '{col_str}' has near-deterministic categorical association with target '{target_column}' "
                                        f"(Cramér's V = {cramer_v:.3f}). This indicates the feature almost perfectly partitions the target classes."
                                    ),
                                    affected_columns=[col_str, target_column],
                                    affected_row_count=len(valid_cat),
                                    affected_row_ratio=round(len(valid_cat) / total_rows, 4),
                                    evidence=[
                                        Evidence(
                                            metric_name="cramers_v_association",
                                            observed_value=round(cramer_v, 4),
                                            threshold_or_expected="< 0.90",
                                            sample_row_indices=valid_cat.index[:10].tolist(),
                                            sample_values=[],
                                            details=f"Crosstab shape {crosstab.shape}, Cramér's V={cramer_v:.4f}.",
                                        )
                                    ],
                                    recommendations=[
                                        Recommendation(
                                            finding_id=f"FND-LKG-CRAMER-{col_str}",
                                            action=f"Inspect whether categories in '{col_str}' encode outcome information.",
                                            reason="High categorical mutual information often flags leaked post-decision data.",
                                            priority=Severity.HIGH,
                                        )
                                    ],
                                )
                            )
                except Exception:
                    pass

    return findings
