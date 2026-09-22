"""Profiler Module for INTEGRIS.

Performs deterministic schema profiling, semantic type inference,
statistical characterization, and structural property extraction.
"""

import math
from typing import Any
import numpy as np
import pandas as pd

from app.models.report import ColumnProfile, DatasetSummary, SemanticType


def _sanitize_scalar(val: Any) -> Any:
    """Convert numpy/pandas scalars to native JSON-serializable Python types."""
    if pd.isna(val):
        return None
    if isinstance(val, (np.integer, int)):
        return int(val)
    if isinstance(val, (np.floating, float)):
        if math.isnan(val) or math.isinf(val):
            return None
        return round(float(val), 4)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    # Sanitize spreadsheet formula injection tokens for display safety
    str_val = str(val)
    if str_val.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{str_val}"
    return str_val


def _infer_semantic_type(series: pd.Series, col_name: str, total_rows: int) -> SemanticType:
    """Determine the functional semantic role of a column."""
    valid_series = series.dropna()
    valid_count = len(valid_series)
    if valid_count == 0:
        return SemanticType.UNKNOWN

    unique_count = valid_series.nunique()
    unique_ratio = unique_count / valid_count if valid_count > 0 else 0.0
    col_lower = col_name.lower().strip()

    # Check for Boolean
    if unique_count <= 2:
        distinct_vals = set(valid_series.astype(str).str.lower().unique())
        if distinct_vals.issubset({"true", "false", "0", "1", "yes", "no", "t", "f"}):
            return SemanticType.BOOLEAN

    # Check for Datetime
    if pd.api.types.is_datetime64_any_dtype(series):
        return SemanticType.DATETIME
    if pd.api.types.is_string_dtype(series) or series.dtype == object:
        # Sample check for date format strings
        sample_str = valid_series.astype(str).head(20)
        date_like = sample_str.str.match(r"^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$")
        if date_like.sum() >= min(3, len(sample_str)) and date_like.mean() > 0.6:
            return SemanticType.DATETIME

    # Check for Identifier (only strings or integers with near-zero nulls)
    id_tokens = {"id", "uuid", "code", "key", "guid", "pk", "ident", "no", "num", "number"}
    is_id_named = any(token in col_lower for token in id_tokens)
    is_not_float = not pd.api.types.is_float_dtype(series)
    low_nulls = (series.isna().sum() / total_rows) <= 0.05 if total_rows > 0 else True

    if is_not_float and low_nulls and total_rows >= 5:
        if is_id_named and (unique_ratio > 0.90 or unique_count == total_rows):
            return SemanticType.IDENTIFIER
        if unique_ratio == 1.0 and valid_count >= (total_rows * 0.95):
            return SemanticType.IDENTIFIER

    # Check Numeric
    if pd.api.types.is_numeric_dtype(series):
        if pd.api.types.is_float_dtype(series):
            return SemanticType.NUMERIC_CONTINUOUS
        if unique_count <= 10 and unique_ratio < 0.05:
            return SemanticType.CATEGORICAL
        if unique_count > 20:
            return SemanticType.NUMERIC_CONTINUOUS
        return SemanticType.NUMERIC_DISCRETE

    # Categorical vs Free Text
    if pd.api.types.is_string_dtype(series) or series.dtype == object or isinstance(series.dtype, pd.CategoricalDtype):
        avg_len = valid_series.astype(str).str.len().mean()
        if avg_len > 60:
            return SemanticType.FREE_TEXT
        if unique_ratio < 0.20 or unique_count <= 50:
            return SemanticType.CATEGORICAL
        return SemanticType.FREE_TEXT

    return SemanticType.UNKNOWN


def profile_dataset(df: pd.DataFrame) -> tuple[DatasetSummary, list[ColumnProfile]]:
    """Generate structural profile and column-level characterization.
    
    Args:
        df: Ingested tabular dataframe.
        
    Returns:
        tuple of (DatasetSummary, list of ColumnProfile)
    """
    row_count = len(df)
    col_count = len(df.columns)
    total_cells = row_count * col_count

    missing_cells = int(df.isna().sum().sum())
    missing_ratio = float(missing_cells / total_cells) if total_cells > 0 else 0.0
    duplicate_rows = int(df.duplicated().sum()) if row_count > 0 else 0
    duplicate_ratio = float(duplicate_rows / row_count) if row_count > 0 else 0.0
    approx_memory = int(df.memory_usage(deep=True).sum()) if not df.empty else 0

    summary = DatasetSummary(
        total_cells=total_cells,
        missing_cells=missing_cells,
        missing_cell_ratio=round(missing_ratio, 6),
        duplicate_rows=duplicate_rows,
        duplicate_row_ratio=round(duplicate_ratio, 6),
        memory_usage_bytes=approx_memory,
    )

    column_profiles: list[ColumnProfile] = []

    for col in df.columns:
        series = df[col]
        non_null_count = int(series.notna().sum())
        null_count = int(series.isna().sum())
        null_ratio = float(null_count / row_count) if row_count > 0 else 0.0
        unique_count = int(series.nunique(dropna=True))
        unique_ratio = float(unique_count / non_null_count) if non_null_count > 0 else 0.0
        col_memory = int(series.memory_usage(deep=True))

        semantic_type = _infer_semantic_type(series, str(col), row_count)

        # Statistical summary where applicable
        min_val = None
        max_val = None
        mean_val = None
        median_val = None
        std_val = None

        if pd.api.types.is_numeric_dtype(series) and non_null_count > 0:
            numeric_valid = series.dropna()
            try:
                min_val = _sanitize_scalar(numeric_valid.min())
                max_val = _sanitize_scalar(numeric_valid.max())
                mean_calc = numeric_valid.mean()
                mean_val = round(float(mean_calc), 4) if not (math.isnan(mean_calc) or math.isinf(mean_calc)) else None
                median_calc = numeric_valid.median()
                median_val = round(float(median_calc), 4) if not (math.isnan(median_calc) or math.isinf(median_calc)) else None
                if non_null_count > 1:
                    std_calc = numeric_valid.std()
                    std_val = round(float(std_calc), 4) if not (math.isnan(std_calc) or math.isinf(std_calc)) else None
            except Exception:
                pass

        # Identifier & constant flags
        is_candidate_id = False
        if unique_count == row_count and row_count > 1 and null_count == 0 and not pd.api.types.is_float_dtype(series):
            is_candidate_id = True
        elif semantic_type == SemanticType.IDENTIFIER and unique_ratio > 0.95 and null_ratio <= 0.05:
            is_candidate_id = True

        is_constant = False
        if non_null_count > 0 and (unique_count <= 1 or (unique_ratio < 0.01 and unique_count == 1)):
            is_constant = True

        # Representative sanitized sample values (up to 5 distinct non-null)
        sample_vals = [
            _sanitize_scalar(val)
            for val in series.dropna().unique()[:5]
        ]

        profile = ColumnProfile(
            name=str(col),
            inferred_dtype=str(series.dtype),
            semantic_type=semantic_type,
            non_null_count=non_null_count,
            null_count=null_count,
            null_ratio=round(null_ratio, 4),
            unique_count=unique_count,
            unique_ratio=round(unique_ratio, 4),
            sample_values=sample_vals,
            anomalies_detected=0,
            min_value=min_val,
            max_value=max_val,
            mean=mean_val,
            median=median_val,
            std_dev=std_val,
            memory_bytes=col_memory,
            is_candidate_identifier=is_candidate_id,
            is_constant_or_near_constant=is_constant,
        )
        column_profiles.append(profile)

    return summary, column_profiles
