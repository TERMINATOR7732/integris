"""Unit tests for Validity Analyzer."""

import pandas as pd
import pytest

from app.engine.profiler import profile_dataset
from app.engine.validity import analyze_validity
from app.models.report import Severity


def test_validity_type_drift_in_numeric_column() -> None:
    """Detect non-numeric textual contaminants in predominantly numeric field."""
    mixed_data = [
        "100", "120", "145", "98", "unknown", "145kg", "210", "180", "190", "110", "105"
    ]
    df = pd.DataFrame({"weight": mixed_data})
    _, profiles = profile_dataset(df)
    findings = analyze_validity(df, profiles)

    drift_findings = [f for f in findings if "FND-VAL-TYPEDRIFT-weight" in f.id]
    assert len(drift_findings) == 1
    assert drift_findings[0].severity == Severity.HIGH
    assert "weight" in drift_findings[0].affected_columns
    assert drift_findings[0].affected_row_count == 2  # 'unknown' and '145kg'


def test_validity_date_format_inconsistency() -> None:
    """Detect mixed date formats (e.g. YYYY-MM-DD vs DD/MM/YYYY vs invalid text)."""
    dates = [
        "2023-01-15", "2023-02-20", "2023-03-10", "2023-04-05", "2023-05-12",
        "2023-06-18", "15/07/2023", "invalid-date", "2023-09-01", "2023-10-15"
    ]
    df = pd.DataFrame({"hire_date": dates})
    _, profiles = profile_dataset(df)
    findings = analyze_validity(df, profiles)

    format_findings = [f for f in findings if "FND-VAL-DATE-FORMAT-hire_date" in f.id]
    assert len(format_findings) == 1
    assert format_findings[0].severity == Severity.MEDIUM
    assert "hire_date" in format_findings[0].affected_columns


def test_validity_categorical_casing_drift() -> None:
    """Detect casing drift like 'Mumbai', 'mumbai', 'MUMBAI'."""
    cities = [
        "Mumbai", "Delhi", "mumbai", "Bangalore", "Delhi", "MUMBAI", "delhi", "Bangalore"
    ]
    df = pd.DataFrame({"city": cities})
    _, profiles = profile_dataset(df)
    findings = analyze_validity(df, profiles)

    casing_findings = [f for f in findings if "FND-VAL-CAT-CASING-city" in f.id]
    assert len(casing_findings) == 1
    assert casing_findings[0].severity == Severity.MEDIUM
    assert "city" in casing_findings[0].affected_columns
