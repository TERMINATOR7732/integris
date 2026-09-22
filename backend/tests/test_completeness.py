"""Unit tests for Completeness Analyzer."""

import numpy as np
import pandas as pd
import pytest

from app.engine.completeness import analyze_completeness
from app.engine.profiler import profile_dataset
from app.models.report import Severity


def test_completeness_standard_missingness() -> None:
    """Detect standard nulls and empty whitespace strings."""
    data = {
        "regular_col": [1, 2, np.nan, 4, 5, np.nan, 7, 8, 9, 10],
        "string_col": ["a", "b", "  ", "d", "e", "", "g", "h", "i", "j"],
    }
    df = pd.DataFrame(data)
    _, profiles = profile_dataset(df)
    findings = analyze_completeness(df, profiles)

    fnd_ids = [f.id for f in findings]
    assert any("FND-CMP-MISS-regular_col" in fid for fid in fnd_ids)
    assert any("FND-CMP-MISS-string_col" in fid for fid in fnd_ids)


def test_completeness_disguised_text_sentinels() -> None:
    """Detect textual placeholder tokens like 'N/A', '?', and 'None'."""
    data = {
        "feedback": ["Great", "N/A", "Good", "?", "Poor", "None", "Excellent", "Average", "Fine", "Unknown"],
    }
    df = pd.DataFrame(data)
    _, profiles = profile_dataset(df)
    findings = analyze_completeness(df, profiles)

    sent_findings = [f for f in findings if "FND-CMP-SENT-TXT" in f.id]
    assert len(sent_findings) > 0
    assert "feedback" in sent_findings[0].affected_columns
    assert sent_findings[0].severity in (Severity.HIGH, Severity.MEDIUM)


def test_completeness_disguised_numeric_sentinels() -> None:
    """Detect numeric placeholders like -999 when isolated from genuine distribution."""
    # Column with positive salaries plus sentinel -999
    salaries = [50000, 60000, 55000, 70000, 65000, 58000, 62000, 75000, 54000, 61000, -999, -999]
    df = pd.DataFrame({"salary": salaries})
    _, profiles = profile_dataset(df)
    findings = analyze_completeness(df, profiles)

    num_sent_findings = [f for f in findings if "FND-CMP-SENT-NUM" in f.id]
    assert len(num_sent_findings) > 0
    assert "salary" in num_sent_findings[0].affected_columns
    assert num_sent_findings[0].affected_row_count == 2


def test_completeness_co_missingness() -> None:
    """Detect lockstep co-missingness between correlated fields."""
    rows = 40
    col_a = [f"val_{i}" for i in range(rows)]
    col_b = [f"val_{i}" for i in range(rows)]

    # Make exactly rows 10 through 25 missing in both
    for idx in range(10, 26):
        col_a[idx] = None
        col_b[idx] = None

    df = pd.DataFrame({"col_a": col_a, "col_b": col_b})
    _, profiles = profile_dataset(df)
    findings = analyze_completeness(df, profiles)

    co_miss = [f for f in findings if "FND-CMP-COMISS" in f.id]
    assert len(co_miss) > 0
    assert "col_a" in co_miss[0].affected_columns
    assert "col_b" in co_miss[0].affected_columns
