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
