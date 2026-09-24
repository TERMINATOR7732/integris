"""Regression tests for non-finite numeric sanitization and CORS preservation.

Ensures that:
1. sanitize_for_json correctly converts NaN, +Inf, -Inf, and NA to None (JSON null).
2. Valid finite numbers (including 0 and 0.0) are preserved (undefined != 0).
3. The forensic engine pipeline processes datasets with NaN, +Inf, -Inf, and sparse empty cells without errors.
4. Serialized JSON responses adhere strictly to RFC 8259 without Starlette ValueError crashes.
5. ErrorHandlerMiddleware preserves CORS headers when internal 500 exceptions occur.
"""

import io
import json
import math
import numpy as np
import openpyxl
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.engine.pipeline import run_forensic_pipeline
from app.engine.profiler import profile_dataset
from app.engine.distribution import analyze_distribution
from app.engine.consistency import analyze_consistency
from app.engine.leakage import analyze_leakage
from app.engine.sanitizer import sanitize_for_json, sanitize_scalar
from app.main import app
from app.models.report import Evidence, ColumnProfile, ForensicDossier

client = TestClient(app)


# ==============================================================================
# 1. Unit Tests: Scalar and Deep Sanitization
# ==============================================================================

def test_sanitize_scalar_contract():
    """Verify scalar sanitization preserves types and maps non-finite to None."""
    # Non-finite values -> None
    assert sanitize_scalar(float("nan")) is None
    assert sanitize_scalar(float("inf")) is None
    assert sanitize_scalar(float("-inf")) is None
    assert sanitize_scalar(np.nan) is None
    assert sanitize_scalar(np.inf) is None
    assert sanitize_scalar(-np.inf) is None
    assert sanitize_scalar(pd.NA) is None
    assert sanitize_scalar(pd.NaT) is None
    assert sanitize_scalar(None) is None

    # Valid numeric values must remain unchanged (undefined != 0)
    assert sanitize_scalar(0) == 0
    assert isinstance(sanitize_scalar(0), int)
    assert sanitize_scalar(0.0) == 0.0
    assert isinstance(sanitize_scalar(0.0), float)
    assert sanitize_scalar(-42.5) == -42.5
    assert sanitize_scalar(np.int64(100)) == 100
    assert isinstance(sanitize_scalar(np.int64(100)), int)
    assert sanitize_scalar(np.float64(3.14159)) == pytest.approx(3.14159)

    # Strings and booleans
    assert sanitize_scalar(True) is True
    assert sanitize_scalar(False) is False
    assert sanitize_scalar("normal_text") == "normal_text"


def test_sanitize_for_json_deep_structure():
    """Verify recursive sanitization across nested dicts, lists, sets, and models."""
    data = {
        "dataset_name": "test_dataset",
        "clean_count": 100,
        "clean_zero": 0,
        "clean_float_zero": 0.0,
        "nan_metric": float("nan"),
        "pos_inf": float("inf"),
        "neg_inf": float("-inf"),
        "numpy_nan": np.nan,
        "numpy_inf": np.inf,
        "nested_dict": {
            "sub_nan": float("nan"),
            "sub_val": 42.123,
            "sub_list": [1, float("nan"), 3.0, float("inf"), -np.inf],
        },
        "tuple_data": (float("nan"), 99),
        "set_data": {"apple", "banana"},
        "array_data": np.array([1.5, np.nan, 2.5]),
    }

    sanitized = sanitize_for_json(data)

    # Must be valid standard JSON without throwing ValueError
    json_str = json.dumps(sanitized)
    assert json_str is not None

    parsed = json.loads(json_str)
    assert parsed["dataset_name"] == "test_dataset"
    assert parsed["clean_count"] == 100
    assert parsed["clean_zero"] == 0
    assert parsed["clean_float_zero"] == 0.0
    assert parsed["nan_metric"] is None
    assert parsed["pos_inf"] is None
    assert parsed["neg_inf"] is None
    assert parsed["numpy_nan"] is None
    assert parsed["numpy_inf"] is None
    assert parsed["nested_dict"]["sub_nan"] is None
    assert parsed["nested_dict"]["sub_val"] == 42.123
    assert parsed["nested_dict"]["sub_list"] == [1, None, 3.0, None, None]
    assert parsed["tuple_data"] == [None, 99]
    assert parsed["array_data"] == [1.5, None, 2.5]


def test_pydantic_model_field_validator_sanitizes_nan():
    """Verify Pydantic validators on Evidence and ColumnProfile coerce NaN to None."""
    ev = Evidence(
        metric_name="test_metric",
        observed_value=float("nan"),
        threshold_or_expected=float("inf"),
        sample_values=[1.0, float("nan"), 3.0],
    )
    assert ev.observed_value is None
    assert ev.threshold_or_expected is None
    assert ev.sample_values == [1.0, None, 3.0]

    prof = ColumnProfile(
        name="test_col",
        ordinal_position=0,
        detected_dtype="float64",
        inferred_dtype="float64",
        semantic_type="numeric_continuous",
        total_count=10,
        non_null_count=8,
        null_count=2,
        null_ratio=0.2,
        unique_count=8,
        unique_ratio=0.8,
        mean=float("nan"),
        std_dev=float("inf"),
        min_value=float("-inf"),
        max_value=100.0,
        sample_values=[0.0, float("nan")],
    )
    assert prof.mean is None
    assert prof.std_dev is None
    assert prof.min_value is None
    assert prof.max_value == 100.0
    assert prof.sample_values == [0.0, None]


# ==============================================================================
# 2. Engine Level Tests: Profiler and Pipeline with Non-Finite Values
# ==============================================================================

def test_profiler_with_all_nan_and_inf_columns():
    """Verify ColumnProfile handles all-nan and inf columns gracefully."""
    df = pd.DataFrame({
        "all_nan": [np.nan, np.nan, np.nan, np.nan],
        "mixed_inf": [10.0, np.inf, -np.inf, np.nan],
        "constant_num": [5.0, 5.0, 5.0, 5.0],
        "single_finite": [np.nan, 42.0, np.nan, np.nan],
    })

    _, profiles = profile_dataset(df)
    assert len(profiles) == 4

    p_nan = next(p for p in profiles if p.name == "all_nan")
    assert p_nan.min_value is None
    assert p_nan.max_value is None
    assert p_nan.mean is None
    assert p_nan.std_dev is None

    p_inf = next(p for p in profiles if p.name == "mixed_inf")
    # Only 10.0 is finite
    assert p_inf.min_value == 10.0
    assert p_inf.max_value == 10.0
    assert p_inf.mean == 10.0

    p_const = next(p for p in profiles if p.name == "constant_num")
    assert p_const.min_value == 5.0
    assert p_const.max_value == 5.0
    assert p_const.std_dev == 0.0


def test_pipeline_with_nan_and_inf_executes_and_serializes():
    """Verify run_forensic_pipeline succeeds on non-finite data and serializes to JSON."""
    np.random.seed(42)
    n = 100
    df = pd.DataFrame({
        "feature_a": np.random.normal(50, 10, size=n),
        "feature_with_nans": [np.nan if i % 5 == 0 else float(i) for i in range(n)],
        "feature_with_infs": [np.inf if i == 10 else (-np.inf if i == 20 else float(i)) for i in range(n)],
        "all_nan_col": [np.nan] * n,
        "target": np.random.choice([0, 1], size=n),
    })

    dossier = run_forensic_pipeline(
        df=df,
        file_name="stress_nan.csv",
        file_size_bytes=5000,
        target_column="target",
    )

    assert isinstance(dossier, ForensicDossier)
    # Ensure sanitization and standard JSON serialization succeeds
    dumped = dossier.model_dump(mode="json")
    sanitized = sanitize_for_json(dumped)
    serialized = json.dumps(sanitized)
    assert serialized is not None
    assert "NaN" not in serialized
    assert "Infinity" not in serialized


# ==============================================================================
# 3. API End-to-End Tests: Ingestion Formats with Sparse/Missing Cells
# ==============================================================================

def test_api_investigate_xlsx_with_empty_and_nan_cells():
    """Verify XLSX containing missing cells and formula errors returns 200 with valid JSON."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "SparseData"
    ws.append(["id", "score", "category", "target"])
    # 25 rows with intermittent missing cells
    for i in range(25):
        score = None if i % 3 == 0 else round(float(i * 1.5), 2)
        cat = None if i % 4 == 0 else f"Cat_{i % 3}"
        target = i % 2
        ws.append([i + 1, score, cat, target])

    bio = io.BytesIO()
    wb.save(bio)
    xlsx_bytes = bio.getvalue()

    response = client.post(
        "/api/v1/investigate",
        files={"file": ("sparse_test.xlsx", xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"target_column": "target"},
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()
    assert "trust_score" in data
    assert "columns" in data
    # Verify no raw NaN in response
    raw_text = response.text
    assert "NaN" not in raw_text
    assert "Infinity" not in raw_text


def test_api_investigate_csv_with_non_finite_values():
    """Verify CSV with raw 'nan', 'inf', '-inf' strings returns 200 and serializes correctly."""
    csv_content = (
        "record_id,metric_val,status,label\n"
        "1,10.5,active,0\n"
        "2,nan,active,1\n"
        "3,inf,pending,0\n"
        "4,-inf,active,1\n"
        "5,,inactive,0\n"
        "6,25.0,,1\n"
    )

    response = client.post(
        "/api/v1/investigate",
        files={"file": ("non_finite.csv", csv_content.encode("utf-8"), "text/csv")},
        data={"target_column": "label"},
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()
    assert data["metadata"]["row_count"] == 6
    assert "trust_score" in data


# ==============================================================================
# 4. Middleware & CORS Tests: CORS Preservation on 500 Exceptions
# ==============================================================================

def test_error_handling_middleware_cors_preservation(monkeypatch):
    """Verify that unexpected internal exceptions return JSON 500 with CORS headers."""
    # Temporarily monkeypatch run_forensic_pipeline to raise an unexpected error
    def mock_broken_pipeline(*args, **kwargs):
        raise RuntimeError("Simulated unexpected pipeline failure")

    from app.api import routes
    monkeypatch.setattr(routes, "run_forensic_pipeline", mock_broken_pipeline)

    csv_data = "a,b\n1,2\n3,4\n"
    origin = "https://integris-ten.vercel.app"

    response = client.post(
        "/api/v1/investigate",
        files={"file": ("test.csv", csv_data.encode("utf-8"), "text/csv")},
        headers={"Origin": origin},
    )

    assert response.status_code == 500
    # Must have CORS headers intact
    assert response.headers.get("access-control-allow-origin") == origin
    assert response.headers.get("access-control-allow-credentials") == "true"
    body = response.json()
    assert "detail" in body
    assert "RuntimeError" in body["detail"]


def test_unauthorized_origin_does_not_get_cors_header(monkeypatch):
    """Verify unauthorized origin does not receive Access-Control-Allow-Origin on 500."""
    def mock_broken_pipeline(*args, **kwargs):
        raise RuntimeError("Simulated failure")

    from app.api import routes
    monkeypatch.setattr(routes, "run_forensic_pipeline", mock_broken_pipeline)

    csv_data = "a,b\n1,2\n3,4\n"
    response = client.post(
        "/api/v1/investigate",
        files={"file": ("test.csv", csv_data.encode("utf-8"), "text/csv")},
        headers={"Origin": "https://malicious-attacker.com"},
    )

    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") is None
