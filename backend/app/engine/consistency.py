"""Consistency Analyzer for INTEGRIS.

Detects cross-column logical contradictions, temporal inversions,
impossible numeric bounds, and semantic state conflicts.
"""

import math
import re
from typing import Any
import pandas as pd

from app.models.report import (
    ColumnProfile,
    Evidence,
    Finding,
    FindingCategory,
    Recommendation,
    SemanticType,
    Severity,
)

# Defensible temporal pairs: (start_tokens, end_tokens, description)
TEMPORAL_PAIRS = [
    (
        {"hire", "hired", "join", "joined", "start", "started", "entry", "onboard", "onboarded"},
        {"exit", "exited", "term", "termination", "terminated", "end", "ended", "leave", "resign", "resigned", "offboard", "offboarded"},
        "Exit date occurs chronologically prior to hire/start date",
    ),
    (
        {"birth", "birthdate", "dob"},
        {"hire", "hired", "join", "joined", "start", "started", "graduate", "graduated", "graduation"},
        "Event date occurs prior to date of birth",
    ),
    (
        {"order", "ordered", "booking", "booked", "creation", "created"},
        {"ship", "shipped", "shipping", "shipment", "deliver", "delivered", "delivery", "dispatch", "dispatched", "fulfill", "fulfilled", "fulfillment"},
        "Fulfillment/delivery date occurs prior to order date",
    ),
]

TEMPORAL_COLUMN_TOKENS = {
    "date", "dates", "time", "datetime", "timestamp", "day", "dt", "dob",
    "hire", "hired", "exit", "exited", "term", "termination", "terminated",
    "join", "joined", "start", "started", "end", "ended", "birth", "birthdate",
    "created", "updated", "order", "ordered", "booking", "booked", "creation",
    "ship", "shipped", "shipping", "shipment", "deliver", "delivered", "delivery",
    "dispatch", "dispatched", "fulfill", "fulfilled", "fulfillment", "leave",
    "resign", "resigned", "onboard", "onboarded", "offboard", "offboarded",
    "entry", "graduate", "graduated", "graduation",
}

# Defensible non-negative keywords
NON_NEGATIVE_TOKENS = ["count", "quantity", "qty", "items", "age", "days", "hours", "units", "visits", "clicks"]


def _tokenize_column_name(col_name: str) -> list[str]:
    """Split a column name into lowercase semantic tokens across naming conventions.

    Handles snake_case, kebab-case, spaces, camelCase, and PascalCase.
    """
    step1 = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", col_name.strip())
    step2 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", step1)
    return [tok.lower() for tok in re.split(r"[^a-zA-Z0-9]+", step2) if tok]


def _has_temporal_semantics(col_name: str) -> bool:
    """Return True if column name contains a standalone temporal token."""
    tokens = set(_tokenize_column_name(col_name))
    return bool(tokens & TEMPORAL_COLUMN_TOKENS)


def _matches_temporal_tokens(col_name: str, target_tokens: set[str] | list[str]) -> bool:
    """Return True if tokenized column name intersects with target temporal role tokens."""
    tokens = set(_tokenize_column_name(col_name))
    return bool(tokens & set(target_tokens))


def _has_non_negative_semantics(col_name: str) -> bool:
    """Return True if column name contains a standalone non-negative domain token."""
    tokens = set(_tokenize_column_name(col_name))
    return bool(tokens & set(NON_NEGATIVE_TOKENS))


def analyze_consistency(
    df: pd.DataFrame,
    column_profiles: list[ColumnProfile],
) -> list[Finding]:
    """Inspect dataset for logical cross-column contradictions.
    
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

    cols = list(df.columns)
    col_str_map = {str(c): c for c in cols}
    cols_lower = {str(c).lower(): str(c) for c in cols}

    col_profile_map = {p.name: p for p in column_profiles}
    date_like_cols: list[str] = []
    for col in cols:
        col_str = str(col)
        series = df[col]
        if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_datetime64_any_dtype(series):
            continue
        profile = col_profile_map.get(col_str)
        if profile and profile.semantic_type in (SemanticType.IDENTIFIER, SemanticType.BOOLEAN):
            continue
        is_dt_type = (profile.semantic_type == SemanticType.DATETIME) if profile else False
        if is_dt_type or _has_temporal_semantics(col_str):
            parsed = pd.to_datetime(series.dropna().head(10), errors="coerce", format="mixed")
            if parsed.notna().sum() >= 1:
                date_like_cols.append(col_str)

    # 1. Temporal Ordering Contradictions
    parsed_dates: dict[str, pd.Series] = {}
    for start_tokens, end_tokens, rule_desc in TEMPORAL_PAIRS:
        matched_starts = [c for c in date_like_cols if _matches_temporal_tokens(c, start_tokens)]
        matched_ends = [c for c in date_like_cols if _matches_temporal_tokens(c, end_tokens)]

        for matched_start in matched_starts:
            for matched_end in matched_ends:
                if matched_start == matched_end:
                    continue
                if matched_start not in parsed_dates:
                    parsed_dates[matched_start] = pd.to_datetime(df[matched_start], errors="coerce", format="mixed")
                if matched_end not in parsed_dates:
                    parsed_dates[matched_end] = pd.to_datetime(df[matched_end], errors="coerce", format="mixed")

                s_series = parsed_dates[matched_start]
                e_series = parsed_dates[matched_end]

                # Handle timezone-aware vs timezone-naive comparison safely
                if (
                    getattr(s_series.dtype, "tz", None) is not None
                    or getattr(e_series.dtype, "tz", None) is not None
                    or s_series.dtype == object
                    or e_series.dtype == object
                ):
                    s_series = pd.to_datetime(df[matched_start], errors="coerce", format="mixed", utc=True)
                    e_series = pd.to_datetime(df[matched_end], errors="coerce", format="mixed", utc=True)

                valid_mask = s_series.notna() & e_series.notna()
                if valid_mask.sum() > 0:
                    inversion_mask = valid_mask & (e_series < s_series)
                    inversion_count = int(inversion_mask.sum())

                    if inversion_count > 0:
                        inversion_ratio = inversion_count / total_rows
                        affected_indices = df.index[inversion_mask].tolist()

                        sample_evidence = []
                        for idx in affected_indices[:5]:
                            sample_evidence.append({
                                matched_start: str(df.loc[idx, matched_start]),
                                matched_end: str(df.loc[idx, matched_end]),
                            })

                        findings.append(
                            Finding(
                                id=f"FND-CNS-TEMP-{matched_start}-{matched_end}",
                                category=FindingCategory.CONSISTENCY,
                                severity=Severity.CRITICAL,
                                title=f"Temporal inversion: '{matched_end}' precedes '{matched_start}' ({inversion_count} records)",
                                description=(
                                    f"Found {inversion_count} record(s) where {matched_end} is chronologically earlier than "
                                    f"{matched_start}. Temporal causality requires start dates to precede completion/exit dates."
                                ),
                                affected_columns=[matched_start, matched_end],
                                affected_row_count=inversion_count,
                                affected_row_ratio=round(inversion_ratio, 4),
                                evidence=[
                                    Evidence(
                                        metric_name="chronological_inversion_count",
                                        observed_value=inversion_count,
                                        threshold_or_expected=0,
                                        sample_row_indices=affected_indices[:10],
                                        sample_values=sample_evidence,
                                        details=f"Rule violated: {rule_desc}.",
                                    )
                                ],
                                recommendations=[
                                    Recommendation(
                                        finding_id=f"FND-CNS-TEMP-{matched_start}-{matched_end}",
                                        action=f"Correct chronologically inverted timestamps between '{matched_start}' and '{matched_end}'.",
                                        reason="Inverted dates corrupt duration calculations and destroy time-series integrity.",
                                        priority=Severity.CRITICAL,
                                    )
                                ],
                            )
                        )

    # 2. Defensible Non-Negative Columns with Negative Values
    for col in cols:
        col_str = str(col)
        if _has_non_negative_semantics(col_str):
            series = pd.to_numeric(df[col], errors="coerce")
            neg_mask = series < 0
            neg_count = int(neg_mask.sum())

            if neg_count > 0:
                neg_ratio = neg_count / total_rows
                neg_indices = df.index[neg_mask].tolist()
                sample_negs = [round(float(v), 4) for v in series[neg_mask].unique().tolist()[:5] if pd.notna(v) and math.isfinite(v)]

                findings.append(
                    Finding(
                        id=f"FND-CNS-NEG-{col_str}",
                        category=FindingCategory.CONSISTENCY,
                        severity=Severity.HIGH,
                        title=f"Impossible negative values in non-negative domain '{col_str}'",
                        description=(
                            f"Column '{col_str}' is semantically defined as a count/quantity field, "
                            f"but contains {neg_count} negative value(s) like {sample_negs}."
                        ),
                        affected_columns=[col_str],
                        affected_row_count=neg_count,
                        affected_row_ratio=round(neg_ratio, 4),
                        evidence=[
                            Evidence(
                                metric_name="negative_count_violation",
                                observed_value=sample_negs,
                                threshold_or_expected=">= 0",
                                sample_row_indices=neg_indices[:10],
                                sample_values=sample_negs,
                                details="Count metrics cannot physically take negative values.",
                            )
                        ],
                        recommendations=[
                            Recommendation(
                                finding_id=f"FND-CNS-NEG-{col_str}",
                                action=f"Investigate negative values in '{col_str}'; filter or recode invalid entries.",
                                reason="Negative quantities break probability distributions and summary sums.",
                                priority=Severity.HIGH,
                            )
                        ],
                    )
                )

    # 3. Contradictory Min/Max Pairs
    for col_a in cols:
        a_str = str(col_a).lower()
        if "min" in _tokenize_column_name(str(col_a)):
            base_name = a_str.replace("min", "")
            for col_b in cols:
                b_str = str(col_b).lower()
                if "max" in _tokenize_column_name(str(col_b)) and base_name == b_str.replace("max", "") and col_a != col_b:
                    s_a = pd.to_numeric(df[col_a], errors="coerce")
                    s_b = pd.to_numeric(df[col_b], errors="coerce")
                    violation = (s_a.notna() & s_b.notna()) & (s_a > s_b)
                    v_count = int(violation.sum())
                    if v_count > 0:
                        v_indices = df.index[violation].tolist()
                        findings.append(
                            Finding(
                                id=f"FND-CNS-BOUND-{col_a}-{col_b}",
                                category=FindingCategory.CONSISTENCY,
                                severity=Severity.HIGH,
                                title=f"Minimum bound exceeds maximum bound in ('{col_a}', '{col_b}')",
                                description=(
                                    f"Found {v_count} records where '{col_a}' is greater than '{col_b}'. "
                                    f"Mathematical definition requires minimum values to be less than or equal to maximum values."
                                ),
                                affected_columns=[str(col_a), str(col_b)],
                                affected_row_count=v_count,
                                affected_row_ratio=round(v_count / total_rows, 4),
                                evidence=[
                                    Evidence(
                                        metric_name="min_gt_max_violations",
                                        observed_value=v_count,
                                        threshold_or_expected=0,
                                        sample_row_indices=v_indices[:10],
                                        sample_values=[],
                                        details=f"Violation in {v_count} rows.",
                                    )
                                ],
                                recommendations=[
                                    Recommendation(
                                        finding_id=f"FND-CNS-BOUND-{col_a}-{col_b}",
                                        action=f"Swap or correct inverted bounds in '{col_a}' and '{col_b}'.",
                                        reason="Inverted bounds produce negative intervals and invalid query filtering.",
                                        priority=Severity.HIGH,
                                    )
                                ],
                            )
                        )

    return findings
