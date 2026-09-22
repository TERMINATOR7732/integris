"""Unit tests for Distribution & Benford's Law analyzer."""

import numpy as np
import pandas as pd
import pytest

from app.engine.distribution import analyze_distribution
from app.engine.profiler import profile_dataset
from app.models.report import Severity


def test_distribution_extreme_outlier_detection() -> None:
    """Detect isolated extreme statistical outliers beyond 3x IQR."""
    # Normal salary values around 50k-80k, plus an extreme 50,000,000 outlier
    normal_salaries = [52000, 54000, 56000, 58000, 60000, 62000, 64000, 66000, 68000, 70000, 72000, 75000, 80000]
    salaries = normal_salaries + [50_000_000]
    df = pd.DataFrame({"salary": salaries})
    _, profiles = profile_dataset(df)
    findings = analyze_distribution(df, profiles)

    outlier_findings = [f for f in findings if "FND-DST-OUTLIER-salary" in f.id]
    assert len(outlier_findings) == 1
    assert outlier_findings[0].severity in (Severity.HIGH, Severity.MEDIUM)
    assert outlier_findings[0].affected_row_count == 1


def test_distribution_benford_law_detection() -> None:
    """Test Benford's Law on synthetic non-conforming financial data."""
    # Fabricate 60 entries where all leading digits are artificially '9' (e.g. 91000, 92000, 93000, 99000, 950000)
    # Spans multiple orders of magnitude: 900 to 950,000
    np.random.seed(42)
    synthetic_prices = [float(f"9.{np.random.randint(10, 99)}") for _ in range(20)]
    synthetic_prices += [float(f"9{np.random.randint(10, 99)}.{np.random.randint(10, 99)}") for _ in range(20)]
    synthetic_prices += [float(f"9{np.random.randint(100, 999)}.{np.random.randint(10, 99)}") for _ in range(20)]

    df = pd.DataFrame({"transaction_amount": synthetic_prices})
    _, profiles = profile_dataset(df)
    findings = analyze_distribution(df, profiles)

    benford_findings = [f for f in findings if "FND-DST-BENFORD" in f.id]
    assert len(benford_findings) == 1
    assert "transaction_amount" in benford_findings[0].affected_columns
    assert "investigation recommended" in benford_findings[0].title.lower()
    # Confirm it never claims 'fraud'
    assert "fraud detected" not in benford_findings[0].title.lower()


def test_distribution_small_dataset_graceful_skip() -> None:
    """Distribution analysis should gracefully skip when dataset has fewer than required rows."""
    df = pd.DataFrame({"val": [1, 2, 3]})
    _, profiles = profile_dataset(df)
    findings = analyze_distribution(df, profiles)
    assert len(findings) == 0


def test_distribution_unsuitable_for_benford_skips() -> None:
    """Non-financial, single-order-of-magnitude, or negative data should not trigger Benford analysis."""
    # Data bounded within [1, 5] (e.g. ratings)
    ratings = [1.0, 2.0, 3.0, 4.0, 5.0] * 12
    df = pd.DataFrame({"rating": ratings})
    _, profiles = profile_dataset(df)
    findings = analyze_distribution(df, profiles)

    benford_findings = [f for f in findings if "FND-DST-BENFORD" in f.id]
    assert len(benford_findings) == 0
