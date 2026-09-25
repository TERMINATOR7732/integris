"""End-to-end integration tests for the forensic pipeline and FastAPI endpoints."""

from pathlib import Path
from fastapi.testclient import TestClient
import pandas as pd
import pytest

from app.engine.pipeline import run_forensic_pipeline
from app.main import app
from app.models.report import ExecutiveVerdict, ForensicDossier

client = TestClient(app)

DATASETS_DIR = Path(__file__).resolve().parent.parent.parent / "datasets"
CLEAN_CSV_PATH = DATASETS_DIR / "clean_baseline.csv"
MODERATE_CSV_PATH = DATASETS_DIR / "moderate_quality.csv"
CORRUPTED_CSV_PATH = DATASETS_DIR / "corrupted_forensic.csv"


def test_pipeline_clean_baseline() -> None:
    """Clean dataset must score >= 90.0, have RELIABLE verdict, and minimal/no severe findings."""
    assert CLEAN_CSV_PATH.exists(), f"Missing test dataset: {CLEAN_CSV_PATH}"
    df = pd.read_csv(CLEAN_CSV_PATH)

    dossier = run_forensic_pipeline(
        df=df,
        file_name="clean_baseline.csv",
        file_size_bytes=CLEAN_CSV_PATH.stat().st_size,
    )

    assert isinstance(dossier, ForensicDossier)
    assert dossier.metadata.row_count == 50
    assert dossier.trust_score.overall_score >= 90.0
    assert dossier.trust_score.verdict == ExecutiveVerdict.RELIABLE
    assert dossier.trust_score.grade in ("A", "A+")

    # Zero critical findings in clean dataset
    critical_findings = [f for f in dossier.findings if f.severity.value == "critical"]
    assert len(critical_findings) == 0


def test_pipeline_corrupted_forensic() -> None:
    """Corrupted dataset must trigger findings across multiple forensic dimensions."""
    assert CORRUPTED_CSV_PATH.exists(), f"Missing test dataset: {CORRUPTED_CSV_PATH}"
    df = pd.read_csv(CORRUPTED_CSV_PATH)

    dossier = run_forensic_pipeline(
        df=df,
        file_name="corrupted_forensic.csv",
        file_size_bytes=CORRUPTED_CSV_PATH.stat().st_size,
        target_column="attrition",
    )

    assert isinstance(dossier, ForensicDossier)
    assert dossier.trust_score.overall_score < 60.0
    assert dossier.trust_score.verdict in (ExecutiveVerdict.CAUTION, ExecutiveVerdict.COMPROMISED)

    fnd_ids = [f.id for f in dossier.findings]

    # Verify duplicate rows detected
    assert "FND-UNQ-EXACT-DUPS" in fnd_ids

    # Verify primary key collision detected
    assert any("FND-UNQ-PK-COLLISION" in fid for fid in fnd_ids)

    # Verify type drift detected
    assert any("FND-VAL-TYPEDRIFT" in fid for fid in fnd_ids)

    # Verify categorical casing drift detected
    assert any("FND-VAL-CAT-CASING" in fid for fid in fnd_ids)

    # Verify temporal contradiction detected
    assert any("FND-CNS-TEMP" in fid for fid in fnd_ids)

    # Verify negative quantity detected
    assert any("FND-CNS-NEG" in fid for fid in fnd_ids)

    # Verify target leakage indicator detected
    assert any("FND-LKG-PROXY" in fid for fid in fnd_ids)

    # Verify recommendations generated
    assert len(dossier.recommendations) > 0


def test_pipeline_moderate_quality() -> None:
    """Moderate dataset should yield an intermediate CAUTION verdict."""
    assert MODERATE_CSV_PATH.exists(), f"Missing test dataset: {MODERATE_CSV_PATH}"
    df = pd.read_csv(MODERATE_CSV_PATH)

    dossier = run_forensic_pipeline(
        df=df,
        file_name="moderate_quality.csv",
        file_size_bytes=MODERATE_CSV_PATH.stat().st_size,
    )

    assert isinstance(dossier, ForensicDossier)
    assert 50.0 <= dossier.trust_score.overall_score < 75.0
    assert dossier.trust_score.verdict == ExecutiveVerdict.CAUTION
    assert dossier.trust_score.grade == "C"
    assert len(dossier.findings) > 0


def test_api_investigate_endpoint_success() -> None:
    """Test live POST /api/v1/investigate with clean dataset upload."""
    with open(CLEAN_CSV_PATH, "rb") as f:
        response = client.post(
            "/api/v1/investigate",
            files={"file": ("clean_baseline.csv", f, "text/csv")},
        )

    assert response.status_code == 200
    data = response.json()
    dossier = ForensicDossier.model_validate(data)
    assert dossier.trust_score.overall_score >= 90.0
    assert dossier.metadata.file_name == "clean_baseline.csv"


def test_api_investigate_corrupted_with_target() -> None:
    """Test live POST /api/v1/investigate with corrupted dataset and target column."""
    with open(CORRUPTED_CSV_PATH, "rb") as f:
        response = client.post(
            "/api/v1/investigate",
            files={"file": ("corrupted_forensic.csv", f, "text/csv")},
            data={"target_column": "attrition"},
        )

    assert response.status_code == 200
    data = response.json()
    dossier = ForensicDossier.model_validate(data)
    assert dossier.trust_score.overall_score < 60.0


def test_api_investigate_empty_file_fails() -> None:
    """Empty file upload must return HTTP 400 Bad Request."""
    response = client.post(
        "/api/v1/investigate",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_api_investigate_invalid_extension_fails() -> None:
    """Unsupported extension must return HTTP 400 Bad Request."""
    response = client.post(
        "/api/v1/investigate",
        files={"file": ("malicious.exe", b"binary content", "application/octet-stream")},
    )
    assert response.status_code == 400
    assert "unsupported file format" in response.json()["detail"].lower()


def test_api_investigate_invalid_target_column() -> None:
    """Non-existent target column must return HTTP 422 Unprocessable Entity."""
    with open(CLEAN_CSV_PATH, "rb") as f:
        response = client.post(
            "/api/v1/investigate",
            files={"file": ("clean_baseline.csv", f, "text/csv")},
            data={"target_column": "non_existent_column"},
        )
    assert response.status_code == 422
    assert "does not exist" in response.json()["detail"]


def test_pipeline_empty_single_row_and_duplicate_columns() -> None:
    """Verify pipeline safely handles empty DataFrames, 1-row DataFrames, and duplicate column names."""
    # Empty DataFrame (0 rows)
    df_empty = pd.DataFrame({"id": pd.Series(dtype="object"), "val": pd.Series(dtype="float64")})
    dossier_empty = run_forensic_pipeline(df_empty, file_name="empty.csv")
    assert dossier_empty.metadata.row_count == 0
    assert dossier_empty.trust_score.overall_score == 100.0
    assert len(dossier_empty.findings) == 0

    # Single-row DataFrame
    df_one = pd.DataFrame({"employee_id": ["EMP-1"], "salary": [75000.0], "is_active": [True]})
    dossier_one = run_forensic_pipeline(df_one, file_name="single.csv")
    assert dossier_one.metadata.row_count == 1
    assert dossier_one.trust_score.overall_score == 100.0

    # Duplicate column names with duplicate rows and non-zero index
    df_dup = pd.DataFrame(
        [["EMP-1", 10, 20], ["EMP-1", 10, 20], ["EMP-2", 30, 40]],
        columns=["employee_id", "metric", "metric"],
        index=[5, 10, 15],
    )
    dossier_dup = run_forensic_pipeline(df_dup, file_name="dup_cols.csv")
    assert [c.name for c in dossier_dup.columns] == ["employee_id", "metric", "metric_1"]
    assert any(f.id == "FND-UNQ-EXACT-DUPS" for f in dossier_dup.findings)


def test_pipeline_deterministic_repeatability() -> None:
    """Verify repeated executions on the same dataset produce identical findings, scores, and ordering."""
    df = pd.read_csv(CORRUPTED_CSV_PATH)
    runs = [
        run_forensic_pipeline(df=df, file_name="corrupted_forensic.csv", target_column="attrition")
        for _ in range(3)
    ]
    baseline = runs[0]
    for r in runs[1:]:
        assert r.metadata.row_count == baseline.metadata.row_count
        assert r.metadata.column_count == baseline.metadata.column_count
        assert r.trust_score.overall_score == baseline.trust_score.overall_score
        assert r.trust_score.verdict == baseline.trust_score.verdict
        assert r.trust_score.grade == baseline.trust_score.grade
        assert [f.id for f in r.findings] == [f.id for f in baseline.findings]
        assert [f.severity for f in r.findings] == [f.severity for f in baseline.findings]
        assert [f.evidence[0].sample_row_indices for f in r.findings] == [
            f.evidence[0].sample_row_indices for f in baseline.findings
        ]


def test_api_root_and_health_contracts() -> None:
    """Verify GET / and GET /api/v1/health return expected status codes and contracts."""
    root_resp = client.get("/")
    assert root_resp.status_code == 200
    root_json = root_resp.json()
    assert root_json["platform"] == "INTEGRIS"
    assert root_json["health"] == "/api/v1/health"
    assert "version" in root_json

    health_resp = client.get("/api/v1/health")
    assert health_resp.status_code == 200
    health_json = health_resp.json()
    assert health_json["status"] == "healthy"
    assert health_json["engine_status"] == "ready"
    assert "timestamp" in health_json


def test_api_investigate_missing_file_returns_422() -> None:
    """Submitting POST /api/v1/investigate without a file field must return HTTP 422."""
    resp = client.post("/api/v1/investigate", data={"target_column": "attrition"})
    assert resp.status_code == 422


def test_api_wide_dataset_bounds_duplicate_preview_and_422_columns(monkeypatch) -> None:
    """Verify wide datasets bound duplicate row preview dicts, affected_columns, and 422 column error lists."""
    import app.api.routes as routes_mod

    cols = [f"col_{i}" for i in range(60)]
    row_vals = [str(i) for i in range(60)]
    csv_lines = [",".join(cols), ",".join(row_vals), ",".join(row_vals), ",".join([str(i + 1) for i in range(60)])]
    csv_bytes = "\n".join(csv_lines).encode("utf-8")

    # 1. Invalid target_column on 60-column dataset bounds the column preview to 20 columns
    resp_422 = client.post(
        "/api/v1/investigate",
        files={"file": ("wide.csv", csv_bytes, "text/csv")},
        data={"target_column": "missing_target"},
    )
    assert resp_422.status_code == 422
    detail_422 = resp_422.json()["detail"]
    assert "does not exist" in detail_422
    assert "(and 40 more)" in detail_422
    assert "col_59" not in detail_422

    # 2. Valid investigation on 60-column dataset bounds duplicate preview keys to 25 and affected_columns to 50
    resp_200 = client.post(
        "/api/v1/investigate",
        files={"file": ("wide.csv", csv_bytes, "text/csv")},
    )
    assert resp_200.status_code == 200
    dossier = ForensicDossier.model_validate(resp_200.json())
    dup_fnd = next(f for f in dossier.findings if f.id == "FND-UNQ-EXACT-DUPS")
    assert len(dup_fnd.affected_columns) == 50
    assert len(dup_fnd.evidence[0].sample_values[0]) == 25

    # 3. Exceeding MAX_DATASET_COLUMNS returns HTTP 413
    monkeypatch.setattr(routes_mod, "MAX_DATASET_COLUMNS", 30)
    resp_413 = client.post(
        "/api/v1/investigate",
        files={"file": ("wide.csv", csv_bytes, "text/csv")},
    )
    assert resp_413.status_code == 413
    assert "exceeds the maximum processing limit of 30 columns" in resp_413.json()["detail"]


def test_api_internal_error_does_not_leak_exception_details(monkeypatch) -> None:
    """Ensure unexpected pipeline exceptions return HTTP 500 without leaking sensitive exception messages."""
    import app.api.routes as routes_mod

    def _boom(*args, **kwargs):
        raise RuntimeError("Sensitive internal path /var/secrets/db.key failed")

    monkeypatch.setattr(routes_mod, "run_forensic_pipeline", _boom)
    resp = client.post(
        "/api/v1/investigate",
        files={"file": ("small.csv", b"a,b\n1,2\n3,4", "text/csv")},
    )
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert "/var/secrets" not in detail
    assert "db.key" not in detail
    assert "internal error" in detail
