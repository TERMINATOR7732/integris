"""Unit tests for Consistency Analyzer."""

import pandas as pd
import pytest

from app.engine.consistency import analyze_consistency
from app.engine.profiler import profile_dataset
from app.models.report import Severity


def test_consistency_temporal_inversion() -> None:
    """Detect chronologically inverted dates (exit_date < hire_date)."""
    df = pd.DataFrame({
        "hire_date": ["2020-01-01", "2021-06-01", "2022-03-15"],
        "exit_date": ["2023-01-01", "2020-01-01", None],  # Row 1 is inverted! (Exit in 2020, hire in 2021)
    })
    _, profiles = profile_dataset(df)
    findings = analyze_consistency(df, profiles)

    temp_findings = [f for f in findings if "FND-CNS-TEMP" in f.id]
    assert len(temp_findings) == 1
    assert temp_findings[0].severity == Severity.CRITICAL
    assert temp_findings[0].affected_row_count == 1
    assert "hire_date" in temp_findings[0].affected_columns
    assert "exit_date" in temp_findings[0].affected_columns


def test_consistency_negative_quantity_violation() -> None:
    """Detect negative values in defensible non-negative count columns."""
    df = pd.DataFrame({
        "item_count": [10, 5, -2, 8, -15, 20],
        "customer_age": [25, 30, -5, 45, 50, 35],
    })
    _, profiles = profile_dataset(df)
    findings = analyze_consistency(df, profiles)

    neg_findings = [f for f in findings if "FND-CNS-NEG" in f.id]
    assert len(neg_findings) == 2
    assert any("item_count" in f.affected_columns for f in neg_findings)
    assert any("customer_age" in f.affected_columns for f in neg_findings)


def test_consistency_token_aware_age_matching() -> None:
    """Ensure only genuine age fields trigger negative-value findings, not substring overlaps."""
    df = pd.DataFrame({
        "age": [25, -3, 40, 32, 28, 50],
        "user_age": [19, 22, -1, 35, 41, 29],
        "age_years": [30, 45, 27, -10, 38, 52],
        "price_change": [-12.5, 5.0, -3.2, 8.1, -0.5, 2.0],
        "voltage": [-5.0, -12.0, 5.0, 12.0, -3.3, 3.3],
        "shortage": [-10, -2, 0, -5, -1, 0],
        "leverage_ratio": [-1.5, 2.0, -0.8, 1.2, 0.5, -0.2],
    })
    _, profiles = profile_dataset(df)
    findings = analyze_consistency(df, profiles)

    neg_finding_ids = {f.id for f in findings if f.id.startswith("FND-CNS-NEG-")}
    assert "FND-CNS-NEG-age" in neg_finding_ids
    assert "FND-CNS-NEG-user_age" in neg_finding_ids
    assert "FND-CNS-NEG-age_years" in neg_finding_ids

    assert "FND-CNS-NEG-price_change" not in neg_finding_ids
    assert "FND-CNS-NEG-voltage" not in neg_finding_ids
    assert "FND-CNS-NEG-shortage" not in neg_finding_ids
    assert "FND-CNS-NEG-leverage_ratio" not in neg_finding_ids


def test_consistency_temporal_token_aware_matching() -> None:
    """Verify genuine temporal pairs trigger findings while substring collisions (e.g. attendance_pct) do not."""
    df = pd.DataFrame({
        "hire_date": ["2022-05-01", "2023-06-15", "2021-01-10"],
        "end_date": ["2024-01-01", "2022-01-01", "2023-12-31"],
        "termination_date": ["2025-01-01", "2021-03-01", None],
        "attendance_pct": [95.5, 88.2, 100.0],
        "percentage": [12.0, 45.0, 78.0],
        "attendant": ["2020-01-01", "2019-01-01", "2018-01-01"],
        "ending_balance": [1000.0, 500.0, 250.0],
        "trend": ["2020-01-01", "2019-01-01", "2018-01-01"],
        "weekend_flag": [0, 1, 0],
    })
    _, profiles = profile_dataset(df)
    findings = analyze_consistency(df, profiles)

    temp_finding_ids = {f.id for f in findings if f.id.startswith("FND-CNS-TEMP-")}
    assert "FND-CNS-TEMP-hire_date-end_date" in temp_finding_ids
    assert "FND-CNS-TEMP-hire_date-termination_date" in temp_finding_ids

    assert "FND-CNS-TEMP-hire_date-attendance_pct" not in temp_finding_ids
    for f in findings:
        if f.id.startswith("FND-CNS-TEMP-"):
            for non_temp in ("attendance_pct", "percentage", "attendant", "ending_balance", "trend", "weekend_flag"):
                assert non_temp not in f.affected_columns
