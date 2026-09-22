"""Distribution & Forensic Statistics Analyzer for INTEGRIS.

Detects statistical outliers, extreme concentration, distributional asymmetry,
and evaluates Benford's Law conformity for eligible numeric domains.
"""

import math
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
    SemanticType,
    Severity,
)

# Theoretical Benford's Law probabilities for digits 1 through 9
BENFORD_EXPECTED = {
    d: math.log10(1 + 1 / d) for d in range(1, 10)
}


def _extract_leading_digit(val: Any) -> int | None:
    """Extract the first non-zero digit of a positive numeric value."""
    try:
        f = float(val)
        if f <= 0 or math.isnan(f) or math.isinf(f):
            return None
        # Convert to string and find first digit [1-9]
        s = f"{f:.10e}".split("e")[0].replace(".", "").lstrip("0")
        if s and s[0].isdigit():
            d = int(s[0])
            if 1 <= d <= 9:
                return d
    except Exception:
        pass
    return None


def analyze_distribution(
    df: pd.DataFrame,
    column_profiles: list[ColumnProfile],
) -> list[Finding]:
    """Perform statistical outlier analysis, skewness tests, and Benford conformity checks.
    
    Args:
        df: Ingested tabular dataframe.
        column_profiles: Pre-computed column profiles.
        
    Returns:
        List of explainable forensic findings.
    """
    findings: list[Finding] = []
    total_rows = len(df)
    if total_rows < 5:
        return findings

    col_profile_map = {p.name: p for p in column_profiles}

    for col in df.columns:
        col_str = str(col)
        series = df[col]
        profile = col_profile_map.get(col_str)
        if not pd.api.types.is_numeric_dtype(series):
            continue

        clean_series = series.dropna()
        n = len(clean_series)
        if n < 8:
            continue

        # Convert to float array for numerical stability
        vals = clean_series.to_numpy(dtype=float)
        unique_vals = np.unique(vals)
        if len(unique_vals) <= 2:
            continue

        # 1. Extreme Outlier Detection (Tukey 3x IQR & Modified Z-Score)
        q25 = float(np.percentile(vals, 25))
        q75 = float(np.percentile(vals, 75))
        iqr = q75 - q25
        median = float(np.median(vals))
        mad = float(np.median(np.abs(vals - median)))

        extreme_upper_bound = q75 + (3.0 * iqr) if iqr > 0 else median + (5.0 * mad if mad > 0 else 1.0)
        extreme_lower_bound = q25 - (3.0 * iqr) if iqr > 0 else median - (5.0 * mad if mad > 0 else 1.0)

        # Identify extreme outlier mask
        extreme_mask = (vals > extreme_upper_bound) | (vals < extreme_lower_bound)
        extreme_count = int(np.sum(extreme_mask))

        if extreme_count > 0 and ((extreme_count / n) <= 0.10 or extreme_count <= 2):
            # Significant isolated extreme outliers
            outlier_indices = clean_series.index[extreme_mask].tolist()
            outlier_values = [round(float(v), 4) for v in vals[extreme_mask][:5]]
            max_val = float(np.max(vals))
            min_val = float(np.min(vals))

            # Gauge extremity: is the max value > 10x the median or IQR?
            distance_ratio = (max_val - q75) / iqr if iqr > 0 else 0
            severity = Severity.HIGH if distance_ratio > 10.0 else Severity.MEDIUM

            findings.append(
                Finding(
                    id=f"FND-DST-OUTLIER-{col_str}",
                    category=FindingCategory.DISTRIBUTION,
                    severity=severity,
                    title=f"Severe statistical outliers in '{col_str}' ({extreme_count} extreme records)",
                    description=(
                        f"Column '{col_str}' contains {extreme_count} observation(s) beyond 3×IQR "
                        f"threshold [{extreme_lower_bound:.2f}, {extreme_upper_bound:.2f}]. "
                        f"Values like {outlier_values} lie at an extreme distance from the bulk distribution (median: {median:.2f})."
                    ),
                    affected_columns=[col_str],
                    affected_row_count=extreme_count,
                    affected_row_ratio=round(extreme_count / total_rows, 4),
                    evidence=[
                        Evidence(
                            metric_name="tukey_3x_iqr_violation",
                            observed_value=outlier_values,
                            threshold_or_expected=f"[{extreme_lower_bound:.2f}, {extreme_upper_bound:.2f}]",
                            sample_row_indices=outlier_indices[:10],
                            sample_values=outlier_values,
                            details=f"Q25={q25:.2f}, Q75={q75:.2f}, IQR={iqr:.2f}, Median={median:.2f}.",
                        )
                    ],
                    recommendations=[
                        Recommendation(
                            finding_id=f"FND-DST-OUTLIER-{col_str}",
                            action=f"Verify provenance of extreme records in '{col_str}'; consider winsorization or robust scaling.",
                            reason="Extreme outliers exert disproportionate leverage on linear models and variance estimators.",
                            priority=severity,
                        )
                    ],
                )
            )

        # 2. Distribution Shape: Extreme Skewness / Kurtosis
        try:
            skew_val = float(stats.skew(vals))
            kurt_val = float(stats.kurtosis(vals))
            if abs(skew_val) > 4.0 and extreme_count == 0:
                findings.append(
                    Finding(
                        id=f"FND-DST-SKEW-{col_str}",
                        category=FindingCategory.DISTRIBUTION,
                        severity=Severity.LOW,
                        title=f"Substantial distributional asymmetry in '{col_str}' (skewness: {skew_val:.2f})",
                        description=(
                            f"Column '{col_str}' has high skewness ({skew_val:.2f}) and kurtosis ({kurt_val:.2f}), "
                            f"indicating a heavily asymmetric or heavy-tailed distribution."
                        ),
                        affected_columns=[col_str],
                        affected_row_count=0,
                        affected_row_ratio=0.0,
                        evidence=[
                            Evidence(
                                metric_name="fisher_pearson_skewness",
                                observed_value=round(skew_val, 3),
                                threshold_or_expected="[-2.0, 2.0] for symmetric distributions",
                                sample_row_indices=[],
                                sample_values=[],
                                details=f"Kurtosis={kurt_val:.2f}.",
                            )
                        ],
                        recommendations=[
                            Recommendation(
                                finding_id=f"FND-DST-SKEW-{col_str}",
                                action=f"Apply non-linear log or Yeo-Johnson transformations if using parametric estimators.",
                                reason="Heavy skewness violates ordinary least squares normality assumptions.",
                                priority=Severity.LOW,
                            )
                        ],
                    )
                )
        except Exception:
            pass

        # 3. Benford's Law Conformity Analysis (Investigative Signal)
        # Suitability criteria:
        # - Strictly positive numbers
        # - Sufficient sample size (>= 50)
        # - Span at least 2 orders of magnitude (max / min >= 50)
        # - Not an artificial ID, counter, or percentage
        is_id = profile.is_candidate_identifier if profile else False
        col_lower = col_str.lower()
        is_financial = any(k in col_lower for k in ["salary", "revenue", "amount", "cost", "price", "sales", "transaction", "payment", "expense", "balance"])
        span_ratio = float(np.max(vals) / (np.min(vals) + 1e-9))
        if (n >= 40 and np.all(vals > 0) and not is_id and is_financial and span_ratio >= 50):
            leading_digits = [_extract_leading_digit(v) for v in vals]
            valid_digits = [d for d in leading_digits if d is not None]

            if len(valid_digits) >= 40:
                digit_counts = {d: 0 for d in range(1, 10)}
                for d in valid_digits:
                    digit_counts[d] += 1
                total_digits = len(valid_digits)
                observed_probs = {d: digit_counts[d] / total_digits for d in range(1, 10)}

                # Mean Absolute Deviation (MAD) against theoretical Benford
                mad_benford = float(np.mean([abs(observed_probs[d] - BENFORD_EXPECTED[d]) for d in range(1, 10)]))

                # Conformity threshold: MAD > 0.025 indicates substantial non-conformity on eligible data
                if mad_benford > 0.025:
                    findings.append(
                        Finding(
                            id=f"FND-DST-BENFORD-{col_str}",
                            category=FindingCategory.DISTRIBUTION,
                            severity=Severity.MEDIUM,
                            title=f"Benford conformity anomaly detected in '{col_str}'; further investigation recommended",
                            description=(
                                f"Leading digit distribution in '{col_str}' deviates from Benford's Law expectations "
                                f"(Mean Absolute Deviation: {mad_benford:.4f}, expected < 0.015 for organic multi-decade data). "
                                f"NOTE: Benford's Law is an investigative signal and does NOT establish fraud or intentional manipulation; "
                                f"deviations often arise from regulatory caps, psychological pricing thresholds, or synthetic sampling."
                            ),
                            affected_columns=[col_str],
                            affected_row_count=0,
                            affected_row_ratio=0.0,
                            evidence=[
                                Evidence(
                                    metric_name="benford_mad_divergence",
                                    observed_value=round(mad_benford, 4),
                                    threshold_or_expected="< 0.015 (Conformity Threshold)",
                                    sample_row_indices=[],
                                    sample_values=[{"digit": d, "observed": round(observed_probs[d], 3), "expected": round(BENFORD_EXPECTED[d], 3)} for d in range(1, 10)],
                                    details="Empirical leading digit frequencies diverge from natural logarithmic decay curve.",
                                )
                            ],
                            recommendations=[
                                Recommendation(
                                    finding_id=f"FND-DST-BENFORD-{col_str}",
                                    action=f"Inspect domain business logic in '{col_str}' for rounding rules, cluster caps, or artificial constraints.",
                                    reason="Benford non-conformity warrants review of numerical generation mechanisms.",
                                    priority=Severity.MEDIUM,
                                )
                            ],
                        )
                    )

    return findings
