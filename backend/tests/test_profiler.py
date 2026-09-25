"""Unit tests for the Profiler engine module."""

import numpy as np
import pandas as pd
import pytest

from app.engine.profiler import profile_dataset
from app.models.report import SemanticType


def test_profiler_clean_dataframe() -> None:
    """Ensure profiler extracts accurate dimensions, types, and stats on a clean dataframe."""
    df = pd.DataFrame({
        "emp_id": [f"ID-{i}" for i in range(20)],
        "age": [25, 30, 35, 40, 45] * 4,
        "department": ["Engineering", "Finance", "Legal", "Operations"] * 5,
        "is_active": [True, False] * 10,
    })

    summary, profiles = profile_dataset(df)

    assert summary.total_cells == 80
    assert summary.missing_cells == 0
    assert summary.missing_cell_ratio == 0.0
    assert summary.duplicate_rows == 0

    assert len(profiles) == 4
    prof_map = {p.name: p for p in profiles}

    # Identifier check
    assert prof_map["emp_id"].is_candidate_identifier is True
    assert prof_map["emp_id"].semantic_type == SemanticType.IDENTIFIER

    # Numeric check
    assert prof_map["age"].semantic_type in (SemanticType.NUMERIC_DISCRETE, SemanticType.NUMERIC_CONTINUOUS)
    assert prof_map["age"].mean == 35.0
    assert prof_map["age"].min_value == 25
    assert prof_map["age"].max_value == 45

    # Categorical check
    assert prof_map["department"].semantic_type == SemanticType.CATEGORICAL

    # Boolean check
    assert prof_map["is_active"].semantic_type == SemanticType.BOOLEAN


def test_profiler_single_column() -> None:
    """Profiler must handle a single-column dataframe gracefully."""
    df = pd.DataFrame({"single_col": [1, 2, 3, 4, 5]})
    summary, profiles = profile_dataset(df)

    assert summary.total_cells == 5
    assert len(profiles) == 1
    assert profiles[0].name == "single_col"
    assert profiles[0].non_null_count == 5


def test_profiler_all_null_column() -> None:
    """Profiler must safely characterize an entirely null column without ZeroDivisionError."""
    df = pd.DataFrame({
        "all_null": [None, np.nan, None, np.nan],
        "valid": [1, 2, 3, 4],
    })
    summary, profiles = profile_dataset(df)

    prof_map = {p.name: p for p in profiles}
    assert prof_map["all_null"].null_count == 4
    assert prof_map["all_null"].non_null_count == 0
    assert prof_map["all_null"].null_ratio == 1.0
    assert prof_map["all_null"].semantic_type == SemanticType.UNKNOWN
    assert prof_map["all_null"].mean is None


def test_profiler_constant_column() -> None:
    """Profiler must flag constant or zero-variance columns."""
    df = pd.DataFrame({
        "constant_col": ["FIXED_VAL"] * 20,
        "varying_col": list(range(20)),
    })
    summary, profiles = profile_dataset(df)

    prof_map = {p.name: p for p in profiles}
    assert prof_map["constant_col"].is_constant_or_near_constant is True
    assert prof_map["varying_col"].is_constant_or_near_constant is False


def test_profiler_identifier_semantic_classification_token_aware() -> None:
    """Verify profiler classifies genuine high-cardinality identifiers without substring false positives."""
    # 20 rows with 19 unique values -> unique_ratio = 0.95 (> 0.90, < 1.0)
    vals = [f"VAL-{i}" for i in range(19)] + ["VAL-0"]

    id_cols = [
        "id",
        "user_id",
        "customer_id",
        "record_id",
        "uuid",
        "user_uuid",
        "identifier",
        "primary_key",
        "customer_code",
        "lookup_key",
        "userId",
        "CustomerID",
    ]
    non_id_cols = [
        "notes",
        "normal",
        "normal_status",
        "number_of_items",
        "notification",
        "notification_text",
        "country",
        "status",
        "country_code",
        "status_code",
        "region_code",
        "product_code",
    ]

    data = {col: vals for col in id_cols + non_id_cols}
    df = pd.DataFrame(data)
    _, profiles = profile_dataset(df)
    prof_map = {p.name: p for p in profiles}

    for col in id_cols:
        assert prof_map[col].semantic_type == SemanticType.IDENTIFIER, f"Expected {col} to be IDENTIFIER"

    for col in non_id_cols:
        assert prof_map[col].semantic_type != SemanticType.IDENTIFIER, f"Expected {col} NOT to be IDENTIFIER"


def test_profiler_free_text_not_misclassified_as_identifier() -> None:
    """Ensure high-cardinality prose/sentence columns are classified as FREE_TEXT, not IDENTIFIER."""
    long_sentences = [
        f"Customer investigation record #{i} detailing extensive transaction audit notes and review commentary."
        for i in range(15)
    ]
    medium_prose = [f"Detailed review comment from analyst number {i}" for i in range(15)]
    df = pd.DataFrame({
        "audit_narrative": long_sentences,
        "analyst_comment": medium_prose,
        "user_id": [1000 + i for i in range(15)],
        "product_code": [f"00{100 + i}" for i in range(15)],
    })
    _, profiles = profile_dataset(df)
    prof_map = {p.name: p for p in profiles}

    assert prof_map["audit_narrative"].semantic_type == SemanticType.FREE_TEXT
    assert prof_map["audit_narrative"].is_candidate_identifier is False
    assert prof_map["analyst_comment"].is_candidate_identifier is False
    assert prof_map["user_id"].semantic_type == SemanticType.IDENTIFIER
    assert prof_map["user_id"].is_candidate_identifier is True
    assert prof_map["product_code"].semantic_type == SemanticType.IDENTIFIER


def test_profiler_tiny_dataset_and_duplicate_columns() -> None:
    """Verify profiler handles tiny datasets (1-3 rows) and duplicate column names without crashing."""
    df_tiny = pd.DataFrame({
        "employee_id": ["EMP-1", "EMP-2"],
        "department": ["Engineering", "Finance"],
    })
    _, profiles_tiny = profile_dataset(df_tiny)
    prof_tiny = {p.name: p for p in profiles_tiny}
    assert prof_tiny["employee_id"].semantic_type == SemanticType.IDENTIFIER
    assert prof_tiny["department"].semantic_type == SemanticType.CATEGORICAL

    # Duplicate column names
    df_dup_cols = pd.DataFrame([[1, 10, 20], [2, 30, 40]], columns=["id", "score", "score"])
    summary, profiles_dup = profile_dataset(df_dup_cols)
    assert summary.total_cells == 6
    assert [p.name for p in profiles_dup] == ["id", "score", "score_1"]
