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
        "customer_code",
        "lookup_key",
        "userId",
        "CustomerID",
        "user-id",
        "user id",
        "PrimaryKey",
        "customerCode",
    ]
    for col_name in legitimate_ids:
        assert _is_identifier_column(col_name) is True, f"Expected '{col_name}' to be recognized as identifier"

    # Columns that must NOT receive primary-key identifier semantics by name alone
    non_identifiers = [
        "country_code",
        "status_code",
        "region_code",
        "product_code",
        "productCode",
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
        "customer_code": ["C-10", "C-20", "C-20", "C-30", "C-40", "C-50"],
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
    assert "FND-UNQ-PK-COLLISION-customer_code" in finding_ids
    assert "FND-UNQ-PK-COLLISION-product_code" not in finding_ids
    assert "FND-UNQ-PK-COLLISION-country_code" not in finding_ids
    assert "FND-UNQ-PK-COLLISION-status_code" not in finding_ids
    assert "FND-UNQ-PK-COLLISION-paid" not in finding_ids
    assert "FND-UNQ-PK-COLLISION-validity" not in finding_ids
    assert "FND-UNQ-PK-COLLISION-notes" not in finding_ids


def test_uniqueness_product_code_and_foreign_key_no_false_positives() -> None:
    """Verify product_code and foreign-key *_id columns do not trigger false PK collisions while genuine PK collisions still fire."""
    # A. Clean HR relational table with unique employee_id and repeating/nullable manager_id
    df_hr = pd.DataFrame({
        "employee_id": [f"EMP-{i:04d}" for i in range(20)],
        "full_name": [f"Employee {i}" for i in range(20)],
        "manager_id": [None] + ["EMP-0001"] * 9 + ["EMP-0002"] * 10,
        "region_code": ["NA", "EU", "APAC", "LATAM"] * 5,
    })
    _, profiles_hr = profile_dataset(df_hr)
    findings_hr = analyze_uniqueness(df_hr, profiles_hr)
    fids_hr = {f.id for f in findings_hr}
    assert "FND-UNQ-PK-COLLISION-manager_id" not in fids_hr
    assert "FND-UNQ-PK-NULL-manager_id" not in fids_hr
    assert "FND-UNQ-PK-COLLISION-region_code" not in fids_hr

    # B. Clean E-commerce relational table with unique order_id, repeated customer_id, and repeated product_code
    df_ecom = pd.DataFrame({
        "order_id": [f"ORD-{i:04d}" for i in range(20)],
        "customer_id": [f"CUST-{i % 5:03d}" for i in range(20)],
        "product_code": [f"PRD-{i % 8:03d}" for i in range(20)],
        "amount": [10.0 + i for i in range(20)],
    })
    _, profiles_ecom = profile_dataset(df_ecom)
    findings_ecom = analyze_uniqueness(df_ecom, profiles_ecom)
    fids_ecom = {f.id for f in findings_ecom}
    assert "FND-UNQ-PK-COLLISION-customer_id" not in fids_ecom
    assert "FND-UNQ-PK-COLLISION-product_code" not in fids_ecom
    assert len([f for f in findings_ecom if f.id.startswith("FND-UNQ-PK-COLLISION-")]) == 0

    # C. True-positive table where primary key (order_id) has genuine collisions alongside foreign key (customer_id) and product_code
    df_tp = df_ecom.copy()
    df_tp.loc[19, "order_id"] = "ORD-0000"  # Genuine primary key collision on order_id
    _, profiles_tp = profile_dataset(df_tp)
    findings_tp = analyze_uniqueness(df_tp, profiles_tp)
    fids_tp = {f.id for f in findings_tp}
    assert "FND-UNQ-PK-COLLISION-order_id" in fids_tp
    assert "FND-UNQ-PK-COLLISION-customer_id" not in fids_tp
    assert "FND-UNQ-PK-COLLISION-product_code" not in fids_tp
