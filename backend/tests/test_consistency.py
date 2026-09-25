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

