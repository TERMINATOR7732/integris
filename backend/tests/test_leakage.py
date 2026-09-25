"""Unit tests for Data Leakage Indicator Analyzer."""

import numpy as np
import pandas as pd
import pytest

from app.engine.leakage import analyze_leakage
from app.engine.profiler import profile_dataset
from app.models.report import Severity


def test_leakage_near_identical_target_proxy() -> None:
    """Detect features that duplicate or directly mirror the target column."""
    targets = ["Yes", "No", "No", "Yes", "Yes", "No", "Yes", "No", "No", "Yes"] * 2
    proxies = targets.copy()
    proxies[0] = "No"  # 95% identical

    df = pd.DataFrame({
        "target_outcome": targets,
        "leaked_proxy_code": proxies,
        "clean_feature": list(range(20)),
    })
    _, profiles = profile_dataset(df)
    findings = analyze_leakage(df, profiles, target_column="target_outcome")

    proxy_findings = [f for f in findings if "FND-LKG-PROXY" in f.id]
    assert len(proxy_findings) == 1
    assert proxy_findings[0].severity == Severity.CRITICAL
    assert "leaked_proxy_code" in proxy_findings[0].affected_columns


def test_leakage_extreme_numeric_correlation() -> None:
    """Detect extreme linear correlation with the numeric target column."""
    np.random.seed(42)
    x = np.linspace(10, 100, 30)
    # Target is almost exactly 2 * x + noise
    y = 2.0 * x + np.random.normal(0, 0.05, 30)
    unrelated = np.random.normal(0, 10, 30)

    df = pd.DataFrame({"target_price": y, "leaked_signal": x, "unrelated_col": unrelated})
    _, profiles = profile_dataset(df)
    findings = analyze_leakage(df, profiles, target_column="target_price")

    corr_findings = [f for f in findings if "FND-LKG-CORR" in f.id]
    assert len(corr_findings) == 1
    assert "leaked_signal" in corr_findings[0].affected_columns


def test_leakage_no_target_specified_skips() -> None:
    """If no target column is provided, leakage analysis must gracefully return 0 findings."""
    df = pd.DataFrame({"feature_a": [1, 2, 3, 4], "feature_b": [2, 4, 6, 8]})
    _, profiles = profile_dataset(df)
    findings = analyze_leakage(df, profiles, target_column=None)
    assert len(findings) == 0


def test_leakage_missing_target_column_skips() -> None:
    """If user requests a target column that does not exist, it should gracefully skip."""
    df = pd.DataFrame({"feature_a": [1, 2, 3, 4], "feature_b": [2, 4, 6, 8]})
    _, profiles = profile_dataset(df)
    findings = analyze_leakage(df, profiles, target_column="non_existent_target")
    assert len(findings) == 0


def test_leakage_numeric_correlation_with_inf() -> None:
    """Ensure a single +/-inf value does not suppress correlation leakage detection on finite rows."""
    x = [float(i) for i in range(1, 25)] + [np.inf]
    y = [float(i * 2) for i in range(1, 25)] + [100.0]
    df = pd.DataFrame({"target_val": y, "leaked_feature": x})
    _, profiles = profile_dataset(df)
    findings = analyze_leakage(df, profiles, target_column="target_val")
    assert any(f.id == "FND-LKG-CORR-leaked_feature" for f in findings)
