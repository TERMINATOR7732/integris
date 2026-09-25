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


def test_validity_iso_date_and_datetime_compatibility() -> None:
    """Recognize both YYYY-MM-DD and YYYY-MM-DD HH:MM:SS while rejecting invalid dates and non-date strings."""
    from datetime import date, datetime
    import io
    import openpyxl
    from app.ingestion.excel_parser import parse_excel

    # 1. Valid date-only and datetime ISO strings together must NOT trigger format anomaly
    df_valid = pd.DataFrame({
        "event_date": [
            "2026-09-25",
            "2026-09-25 12:30:45",
            "2026-09-26",
            "2026-09-26 00:00:00",
            "2026-09-27 18:15:00",
        ],
        "unrelated_text": ["alpha", "beta", "gamma", "delta", "epsilon"],
    })
    _, profiles_valid = profile_dataset(df_valid)
    findings_valid = analyze_validity(df_valid, profiles_valid)
    assert not any(f.id.startswith("FND-VAL-DATE-FORMAT") for f in findings_valid)

    # 2. Invalid calendar date and unrelated non-date string in a date column MUST be flagged
    df_invalid = pd.DataFrame({
        "event_date": [
            "2026-09-25",
            "2026-09-25 12:30:45",
            "2026-09-26 08:00:00",
            "2026-02-30",          # impossible calendar date
            "2026-13-45",          # invalid month/day
            "unrelated_non_date",  # non-date string
        ]
    })
    _, profiles_invalid = profile_dataset(df_invalid)
    findings_invalid = analyze_validity(df_invalid, profiles_invalid)
    date_findings = [f for f in findings_invalid if f.id == "FND-VAL-DATE-FORMAT-event_date"]
    assert len(date_findings) == 1
    assert date_findings[0].affected_row_count == 3

    # 3. Excel-derived datetime representations normalized via parse_excel
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Events"
    ws.append(["record_id", "hire_date"])
    ws.append(["R-1", datetime(2026, 9, 25, 12, 30, 45)])
    ws.append(["R-2", datetime(2026, 9, 26, 0, 0, 0)])
    ws.append(["R-3", date(2026, 9, 27)])
    ws.append(["R-4", datetime(2026, 9, 28, 9, 15, 30)])

    bio = io.BytesIO()
    wb.save(bio)
    df_excel, _, _ = parse_excel(bio.getvalue(), "xlsx")
    _, profiles_excel = profile_dataset(df_excel)
    findings_excel = analyze_validity(df_excel, profiles_excel)
    assert not any(f.id.startswith("FND-VAL-DATE-FORMAT") for f in findings_excel)


def test_validity_numeric_parsing_edge_cases() -> None:
    """Verify vectorized numeric validity parsing across valid strings, invalid strings, numbers, nulls, and mixed columns."""
    df = pd.DataFrame({
        "valid_num_strings": ["100", "42.5", "-17", "0", " 3.14 ", "250", "-0.5", "88"],
        "invalid_num_strings": ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"],
        "actual_numbers": [100, 42.5, -17, 0, 3.14, 250, -0.5, 88],
        "with_missing": ["100", None, "42.5", "-17", float("nan"), "250", None, "88"],
        "mixed_column": [100, "42.5", "-17", "bad_val", None, "250", "invalid_str", 88],
    })
    _, profiles = profile_dataset(df)
    findings = analyze_validity(df, profiles)
    drift_ids = {f.id for f in findings if f.id.startswith("FND-VAL-TYPEDRIFT-")}

    assert "FND-VAL-TYPEDRIFT-valid_num_strings" not in drift_ids
    assert "FND-VAL-TYPEDRIFT-invalid_num_strings" not in drift_ids
    assert "FND-VAL-TYPEDRIFT-actual_numbers" not in drift_ids
    assert "FND-VAL-TYPEDRIFT-with_missing" not in drift_ids
    assert "FND-VAL-TYPEDRIFT-mixed_column" in drift_ids

    mixed_finding = next(f for f in findings if f.id == "FND-VAL-TYPEDRIFT-mixed_column")
    assert mixed_finding.affected_row_count == 2


def test_validity_slash_ymd_date_support() -> None:
    """Recognize valid YYYY/MM/DD dates while rejecting impossible YYYY/MM/DD calendar dates."""
    # 1. Pure valid YYYY/MM/DD column should have zero date format anomalies
    df_valid = pd.DataFrame({
        "promotion_date": [
            "2027/09/15",
            "2026/01/31",
            "2026/12/31",
            "2025/06/01",
            "2024/02/29",
        ]
    })
    _, profiles_valid = profile_dataset(df_valid)
    findings_valid = analyze_validity(df_valid, profiles_valid)
    assert not any(f.id.startswith("FND-VAL-DATE-FORMAT") for f in findings_valid)

    # 2. Impossible calendar dates and non-date strings in a YYYY/MM/DD column must be flagged
    df_invalid = pd.DataFrame({
        "promotion_date": [
            "2027/09/15",
            "2026/01/31",
            "2026/12/31",
            "2025/06/01",
            "2026/02/30",
            "2026/13/01",
            "2026/00/10",
            "not-a-date",
        ]
    })
    _, profiles_invalid = profile_dataset(df_invalid)
    findings_invalid = analyze_validity(df_invalid, profiles_invalid)
    date_findings = [f for f in findings_invalid if f.id == "FND-VAL-DATE-FORMAT-promotion_date"]
    assert len(date_findings) == 1
    assert date_findings[0].affected_row_count == 4
