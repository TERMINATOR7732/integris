"""Unit tests for Uniqueness Analyzer."""

import pandas as pd
import pytest

from app.engine.profiler import profile_dataset
from app.engine.uniqueness import analyze_uniqueness
from app.models.report import Severity


def test_uniqueness_exact_duplicate_rows() -> None:
    """Identify exact duplicate records and quantify them."""
    data = {
        "id": [1, 2, 3, 4, 5, 2, 3],
        "name": ["A", "B", "C", "D", "E", "B", "C"],
        "score": [10, 20, 30, 40, 50, 20, 30],
    }
    df = pd.DataFrame(data)
    _, profiles = profile_dataset(df)
    findings = analyze_uniqueness(df, profiles)

    dup_findings = [f for f in findings if f.id == "FND-UNQ-EXACT-DUPS"]
    assert len(dup_findings) == 1
    assert dup_findings[0].affected_row_count == 2
    assert dup_findings[0].severity in (Severity.HIGH, Severity.CRITICAL, Severity.MEDIUM)


def test_uniqueness_primary_key_collision() -> None:
    """Flag collision when candidate identifier contains duplicate values."""
    data = {
        "employee_id": ["EMP-01", "EMP-02", "EMP-03", "EMP-01", "EMP-04"],
        "name": ["John", "Sarah", "Alice", "David", "Bob"],  # Distinct data, but same ID!
        "salary": [60000, 75000, 80000, 92000, 65000],
    }
    df = pd.DataFrame(data)
    _, profiles = profile_dataset(df)
    findings = analyze_uniqueness(df, profiles)

    pk_collisions = [f for f in findings if "FND-UNQ-PK-COLLISION-employee_id" in f.id]
    assert len(pk_collisions) == 1
    assert pk_collisions[0].severity == Severity.CRITICAL
    assert "employee_id" in pk_collisions[0].affected_columns


def test_uniqueness_clean_dataset() -> None:
    """Ensure clean distinct dataset triggers no duplicate or collision findings."""
    data = {
        "employee_id": [f"EMP-{i}" for i in range(25)],
        "name": [f"Name_{i}" for i in range(25)],
        "role": ["Staff"] * 25,
    }
    df = pd.DataFrame(data)
    _, profiles = profile_dataset(df)
    findings = analyze_uniqueness(df, profiles)

    critical_dup_findings = [f for f in findings if f.severity in (Severity.CRITICAL, Severity.HIGH)]
    assert len(critical_dup_findings) == 0


def test_uniqueness_token_aware_identifier_matching() -> None:
    """Ensure identifier semantics trigger only on legitimate identifier tokens, not substrings or categorical codes."""
    from app.engine.uniqueness import _is_identifier_column

    # Legitimate identifier names across naming conventions
    legitimate_ids = [
        "id",
        "user_id",
        "customer_id",
        "record_id",
        "identifier",
        "primary_key",
        "product_code",
        "customer_code",
        "lookup_key",
        "userId",
        "CustomerID",
        "user-id",
        "user id",
        "PrimaryKey",
        "productCode",
    ]
    for col_name in legitimate_ids:
        assert _is_identifier_column(col_name) is True, f"Expected '{col_name}' to be recognized as identifier"

    # Columns that must NOT receive identifier semantics
    non_identifiers = [
        "country_code",
        "status_code",
        "region_code",
        "paid",
        "validity",
        "country",
        "status",
        "department",
        "notes",
        "description",
    ]
    for col_name in non_identifiers:
        assert _is_identifier_column(col_name) is False, f"Expected '{col_name}' NOT to be recognized as identifier"

    # End-to-end uniqueness check with repeated values in both legitimate IDs and non-ID columns
    df = pd.DataFrame({
        "user_id": ["U-1", "U-2", "U-1", "U-3", "U-4", "U-5"],
        "product_code": ["P-10", "P-20", "P-20", "P-30", "P-40", "P-50"],
        "country_code": ["US", "US", "IN", "IN", "GB", "US"],
        "status_code": ["200", "200", "404", "200", "500", "404"],
        "paid": [True, False, True, True, False, True],
        "validity": ["valid", "valid", "expired", "valid", "expired", "valid"],
        "notes": ["ok", "review", "ok", "pending", "approved", "ok"],
    })
    _, profiles = profile_dataset(df)
    findings = analyze_uniqueness(df, profiles)
    finding_ids = {f.id for f in findings}

    assert "FND-UNQ-PK-COLLISION-user_id" in finding_ids
    assert "FND-UNQ-PK-COLLISION-product_code" in finding_ids
    assert "FND-UNQ-PK-COLLISION-country_code" not in finding_ids
    assert "FND-UNQ-PK-COLLISION-status_code" not in finding_ids
    assert "FND-UNQ-PK-COLLISION-paid" not in finding_ids
    assert "FND-UNQ-PK-COLLISION-validity" not in finding_ids
    assert "FND-UNQ-PK-COLLISION-notes" not in finding_ids

