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
