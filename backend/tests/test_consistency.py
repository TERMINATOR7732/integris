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


def test_consistency_mixed_timezone_and_identifier_exclusion() -> None:
    """Verify mixed tz-aware and tz-naive timestamps compare safely and identifier columns are excluded."""
    df = pd.DataFrame({
        "order_id": ["20230501", "20230502", "20230503", "20230504", "20230505"],
        "shipment_id": ["20210101", "20210102", "20210103", "20210104", "20210105"],
        "order_date": [
            "2025-05-10T12:00:00Z",
            "2025-06-01T08:30:00Z",
            "2025-07-01T00:00:00Z",
            "2025-08-01T00:00:00Z",
            "2025-09-01T00:00:00Z",
        ],
        "delivery_date": [
            "2025-05-15",
            "2025-05-20",  # Inverted against 2025-06-01T08:30:00Z
            "2025-07-10",
            "2025-08-10",
            "2025-09-10",
        ],
    })
    _, profiles = profile_dataset(df)
    findings = analyze_consistency(df, profiles)
    temp_ids = {f.id for f in findings if f.id.startswith("FND-CNS-TEMP-")}

    assert "FND-CNS-TEMP-order_date-delivery_date" in temp_ids
    assert "FND-CNS-TEMP-order_id-shipment_id" not in temp_ids


def test_consistency_expanded_lifecycle_temporal_pairs() -> None:
    """Verify all domain lifecycle temporal pairs (admit->discharge, enrollment->graduation, opened->closed, pickup->delivered, ship->delivery, transaction->settlement) while keeping attendance_pct excluded."""
    df = pd.DataFrame({
        "hire_date": ["2024-01-10", "2024-05-10", "2024-03-01"],
        "termination_date": ["2024-06-01", "2024-02-01", None],
        "attendance_pct": [98.0, 85.5, 92.1],
        "admit_date": ["2024-04-10", "2024-08-15", "2024-09-01"],
        "discharge_date": ["2024-04-15", "2024-08-01", "2024-09-05"],
        "enrollment_date": ["2021-09-01", "2023-09-01", "2022-09-01"],
        "graduation_date": ["2025-05-15", "2022-05-15", "2026-05-15"],
        "opened_date": ["2024-10-01", "2024-10-15", "2024-10-20"],
        "closed_date": ["2024-10-05", "2024-10-10", "2024-10-25"],
        "pickup_date": ["2024-11-01", "2024-11-12", "2024-11-20"],
        "delivered_date": ["2024-11-02", "2024-11-05", "2024-11-21"],
        "order_date": ["2024-12-01", "2024-12-10", "2024-12-15"],
        "ship_date": ["2024-12-02", "2024-12-08", "2024-12-18"],
        "delivery_date": ["2024-12-05", "2024-12-09", "2024-12-16"],
        "transaction_datetime": [
            "2024-10-22 21:19:10",  # Same calendar day settlement -> NOT inverted
            "2024-10-25 14:30:00",  # Prior calendar day settlement -> INVERTED
            "2024-10-28 09:00:00",
        ],
        "settlement_date": [
            "2024-10-22",
            "2024-10-23",
            "2024-10-30",
        ],
    })
    _, profiles = profile_dataset(df)
    findings = analyze_consistency(df, profiles)
    temp_map = {f.id: f for f in findings if f.id.startswith("FND-CNS-TEMP-")}

    # A. hire_date -> termination_date still detected
    assert "FND-CNS-TEMP-hire_date-termination_date" in temp_map
    # B. hire_date -> attendance_pct NOT detected
    assert "FND-CNS-TEMP-hire_date-attendance_pct" not in temp_map
    for f in temp_map.values():
        assert "attendance_pct" not in f.affected_columns
    # C. admit_date -> discharge_date detected
    assert "FND-CNS-TEMP-admit_date-discharge_date" in temp_map
    assert temp_map["FND-CNS-TEMP-admit_date-discharge_date"].affected_row_count == 1
    # D. enrollment_date -> graduation_date detected
    assert "FND-CNS-TEMP-enrollment_date-graduation_date" in temp_map
    assert temp_map["FND-CNS-TEMP-enrollment_date-graduation_date"].affected_row_count == 1
    # E. opened_date -> closed_date detected
    assert "FND-CNS-TEMP-opened_date-closed_date" in temp_map
    assert temp_map["FND-CNS-TEMP-opened_date-closed_date"].affected_row_count == 1
    # F. pickup_date -> delivered_date detected
    assert "FND-CNS-TEMP-pickup_date-delivered_date" in temp_map
    assert temp_map["FND-CNS-TEMP-pickup_date-delivered_date"].affected_row_count == 1
    # G. ship_date -> delivery_date detected
    assert "FND-CNS-TEMP-ship_date-delivery_date" in temp_map
    assert temp_map["FND-CNS-TEMP-ship_date-delivery_date"].affected_row_count == 1
    # H. transaction_datetime -> settlement_date detected (only row 1, not same-day row 0)
    assert "FND-CNS-TEMP-transaction_datetime-settlement_date" in temp_map
    assert temp_map["FND-CNS-TEMP-transaction_datetime-settlement_date"].affected_row_count == 1
    # I. Existing order_date -> ship_date and order_date -> delivery_date preserved
    assert "FND-CNS-TEMP-order_date-ship_date" in temp_map
    assert "FND-CNS-TEMP-order_date-delivery_date" in temp_map
