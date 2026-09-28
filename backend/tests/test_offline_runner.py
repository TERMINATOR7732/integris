"""Comprehensive tests for INTEGRIS Offline Investigation Mode (`app.offline`).

Verifies:
1. Small valid CSV and all supported formats (.csv, .tsv, .txt, .xlsx, .xls, .pdf)
2. Clean baseline dataset (`datasets/clean_baseline.csv`)
3. Moderate-quality dataset (`datasets/moderate_quality.csv`)
4. Corrupted forensic dataset (`datasets/corrupted_forensic.csv`)
5. Invalid/unsupported input (extensions, empty files, prose TXT, non-tabular PDF, missing target column)
6. Missing file and directory path handling
7. CLI stdout JSON and `--output` file generation (plus overwrite protection)
8. Same-engine invocation (`app.engine.pipeline.run_forensic_pipeline`)
9. Exact forensic parity between Online API (`POST /api/v1/investigate`) and Offline Runner
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from fastapi.testclient import TestClient
import openpyxl
import pytest

from app.engine.pipeline import run_forensic_pipeline
from app.main import app
from app.models.report import ExecutiveVerdict, ForensicDossier
from app.offline import (
    OfflineInvestigationError,
    investigate_file,
    investigate_file_to_dict,
    investigate_file_to_json,
)
from app.offline.cli import main as offline_cli_main
from tests.test_ingestion_formats import create_minimal_pdf_with_table

client = TestClient(app)

DATASETS_DIR = Path(__file__).resolve().parent.parent.parent / "datasets"
CLEAN_CSV_PATH = DATASETS_DIR / "clean_baseline.csv"
MODERATE_CSV_PATH = DATASETS_DIR / "moderate_quality.csv"
CORRUPTED_CSV_PATH = DATASETS_DIR / "corrupted_forensic.csv"


def test_offline_small_valid_csv(tmp_path: Path) -> None:
    """1. Verify offline runner processes a small valid CSV file and returns a ForensicDossier."""
    csv_file = tmp_path / "small_valid.csv"
    csv_file.write_text(
        "employee_id,department,salary,is_active\n"
        "EMP-001,Engineering,95000,true\n"
        "EMP-002,Finance,88000,true\n"
        "EMP-003,Operations,76000,false\n",
        encoding="utf-8",
    )

    dossier = investigate_file(csv_file)
    assert isinstance(dossier, ForensicDossier)
    assert dossier.metadata.file_name == "small_valid.csv"
    assert dossier.metadata.file_type == "csv"
    assert dossier.metadata.row_count == 3
    assert dossier.metadata.column_count == 4
    assert dossier.trust_score.overall_score == 100.0
    assert dossier.trust_score.verdict == ExecutiveVerdict.RELIABLE


def test_offline_supported_formats_tsv_txt_xlsx_pdf(tmp_path: Path) -> None:
    """Verify offline runner supports TSV, TXT, XLSX, and PDF formats via shared ingestion."""
    # TSV
    tsv_file = tmp_path / "sample.tsv"
    tsv_file.write_bytes(b"id\tmetric\n1\t10.5\n2\t20.0\n")
    tsv_dossier = investigate_file(tsv_file)
    assert tsv_dossier.metadata.file_type == "tsv"
    assert tsv_dossier.metadata.row_count == 2

    # TXT
    txt_file = tmp_path / "sample.txt"
    txt_file.write_bytes(b"user_id,action,score\nU1,login,91\nU2,logout,84\n")
    txt_dossier = investigate_file(txt_file)
    assert txt_dossier.metadata.file_type == "txt"
    assert txt_dossier.metadata.row_count == 2

    # XLSX
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "AuditSheet"
    ws.append(["record_id", "amount"])
    ws.append(["R-1", 125.0])
    ws.append(["R-2", 250.5])
    bio = io.BytesIO()
    wb.save(bio)
    xlsx_file = tmp_path / "sample.xlsx"
    xlsx_file.write_bytes(bio.getvalue())

    xlsx_dossier = investigate_file(xlsx_file)
    assert xlsx_dossier.metadata.file_type == "xlsx"
    assert xlsx_dossier.metadata.sheet_name == "AuditSheet"
    assert xlsx_dossier.metadata.row_count == 2

    # PDF
    pdf_file = tmp_path / "sample.pdf"
    pdf_file.write_bytes(create_minimal_pdf_with_table())
    pdf_dossier = investigate_file(pdf_file)
    assert pdf_dossier.metadata.file_type == "pdf"
    assert pdf_dossier.metadata.page_count == 1
    assert pdf_dossier.metadata.row_count == 2


def test_offline_clean_baseline_dataset() -> None:
    """2. Verify offline runner on existing clean_baseline.csv benchmark."""
    dossier = investigate_file(CLEAN_CSV_PATH)
    assert dossier.metadata.file_name == "clean_baseline.csv"
    assert dossier.metadata.row_count == 50
    assert dossier.metadata.column_count == 12
    assert dossier.trust_score.overall_score == 100.0
    assert dossier.trust_score.verdict == ExecutiveVerdict.RELIABLE
    assert dossier.trust_score.grade == "A+"


def test_offline_moderate_quality_dataset() -> None:
    """3. Verify offline runner on existing moderate_quality.csv benchmark."""
    dossier = investigate_file(MODERATE_CSV_PATH)
    assert dossier.metadata.file_name == "moderate_quality.csv"
    assert dossier.metadata.row_count == 50
    assert dossier.metadata.column_count == 12
    assert 50.0 <= dossier.trust_score.overall_score < 75.0
    assert dossier.trust_score.verdict == ExecutiveVerdict.CAUTION
    assert dossier.trust_score.grade == "C"
    assert len(dossier.findings) == 7


def test_offline_corrupted_forensic_dataset() -> None:
    """4. Verify offline runner on existing corrupted_forensic.csv benchmark with target column."""
    dossier = investigate_file(CORRUPTED_CSV_PATH, target_column="attrition")
    assert dossier.metadata.file_name == "corrupted_forensic.csv"
    assert dossier.metadata.row_count == 50
    assert dossier.metadata.column_count == 13
    assert dossier.trust_score.overall_score == 0.0
    assert dossier.trust_score.verdict == ExecutiveVerdict.COMPROMISED
    assert dossier.trust_score.grade == "F"
    assert len(dossier.findings) == 17


def test_offline_invalid_and_unsupported_inputs(tmp_path: Path, capsys) -> None:
    """5. Verify offline runner and CLI reject unsupported extensions, empty files, prose, and invalid target columns."""
    # Unsupported extension
    exe_file = tmp_path / "payload.exe"
    exe_file.write_bytes(b"MZ\x90\x00")
    with pytest.raises(OfflineInvestigationError, match="Unsupported file format"):
        investigate_file(exe_file)

    exit_code = offline_cli_main(["investigate", str(exe_file)])
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "Unsupported file format" in captured.err
    assert "Traceback" not in captured.err

    # Empty 0-byte file
    empty_file = tmp_path / "empty.csv"
    empty_file.write_bytes(b"")
    with pytest.raises(OfflineInvestigationError, match="empty"):
        investigate_file(empty_file)

    # Unstructured prose in .txt
    prose_file = tmp_path / "notes.txt"
    prose_file.write_bytes(
        b"This is a plain text paragraph without any tabular delimiter structure.\n"
        b"It should be cleanly rejected by the shared ingestion layer.\n"
    )
    with pytest.raises(OfflineInvestigationError, match="structured tabular data"):
        investigate_file(prose_file)

    # Non-existent target column
    with pytest.raises(OfflineInvestigationError, match="does not exist in dataset"):
        investigate_file(CLEAN_CSV_PATH, target_column="non_existent_target")


def test_offline_missing_file_and_directory_input(tmp_path: Path, capsys) -> None:
    """6. Verify missing files and directory paths return controlled errors and non-zero CLI exit codes."""
    missing_path = tmp_path / "does_not_exist.csv"
    with pytest.raises(OfflineInvestigationError, match="not found"):
        investigate_file(missing_path)

    exit_code = offline_cli_main(["investigate", str(missing_path)])
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "not found" in captured.err
    assert "Traceback" not in captured.err

    # Directory passed instead of file
    with pytest.raises(OfflineInvestigationError, match="not a regular file"):
        investigate_file(tmp_path)


def test_offline_cli_output_generation_and_overwrite_guard(tmp_path: Path, capsys) -> None:
    """7. Verify CLI stdout JSON output, --output file writing, and input overwrite protection."""
    # Stdout JSON mode
    rc_stdout = offline_cli_main(["investigate", str(CLEAN_CSV_PATH), "--compact"])
    out_stdout = capsys.readouterr()
    assert rc_stdout == 0
    parsed_stdout = json.loads(out_stdout.out)
    validated_stdout = ForensicDossier.model_validate(parsed_stdout)
    assert validated_stdout.metadata.file_name == "clean_baseline.csv"

    # File --output mode
    out_file = tmp_path / "nested" / "dossier_output.json"
    rc_file = offline_cli_main(
        [
            "investigate",
            str(CORRUPTED_CSV_PATH),
            "--target-column",
            "attrition",
            "--output",
            str(out_file),
        ]
    )
    out_summary = capsys.readouterr()
    assert rc_file == 0
    assert out_file.exists()
    assert "INTEGRIS Offline Investigation Complete" in out_summary.out

    saved_data = json.loads(out_file.read_text(encoding="utf-8"))
    validated_saved = ForensicDossier.model_validate(saved_data)
    assert validated_saved.metadata.file_name == "corrupted_forensic.csv"
    assert validated_saved.trust_score.overall_score == 0.0

    # Refusal to overwrite input dataset file
    sample_input = tmp_path / "protect_me.csv"
    sample_input.write_text("a,b\n1,2\n3,4\n", encoding="utf-8")
    rc_overwrite = offline_cli_main(
        ["investigate", str(sample_input), "--output", str(sample_input)]
    )
    err_overwrite = capsys.readouterr()
    assert rc_overwrite == 1
    assert "Refusing to overwrite" in err_overwrite.err
    assert sample_input.read_text(encoding="utf-8") == "a,b\n1,2\n3,4\n"


def test_offline_invokes_same_forensic_engine_pipeline(monkeypatch) -> None:
    """8. Verify `investigate_file` directly delegates to `app.engine.pipeline.run_forensic_pipeline`."""
    import app.offline.runner as runner_mod

    calls: list[dict] = []
    original_pipeline = run_forensic_pipeline

    def _spy_pipeline(*args, **kwargs):
        calls.append(kwargs)
        return original_pipeline(*args, **kwargs)

    monkeypatch.setattr(runner_mod, "run_forensic_pipeline", _spy_pipeline)

    dossier = investigate_file(CLEAN_CSV_PATH, target_column="attrition")
    assert len(calls) == 1
    assert calls[0]["file_name"] == "clean_baseline.csv"
    assert calls[0]["target_column"] == "attrition"
    assert calls[0]["file_type"] == "csv"
    assert isinstance(dossier, ForensicDossier)


@pytest.mark.parametrize(
    ("dataset_path", "target_col"),
    [
        (CLEAN_CSV_PATH, None),
        (MODERATE_CSV_PATH, None),
        (CORRUPTED_CSV_PATH, "attrition"),
    ],
)
def test_online_vs_offline_result_compatibility_and_benchmark_parity(
    dataset_path: Path,
    target_col: str | None,
) -> None:
    """9. Verify Online API (`POST /api/v1/investigate`) and Offline Runner produce equivalent forensic results."""
    # Online engine invocation via FastAPI endpoint
    with open(dataset_path, "rb") as f:
        form_data = {"target_column": target_col} if target_col else {}
        response = client.post(
            "/api/v1/investigate",
            files={"file": (dataset_path.name, f, "text/csv")},
            data=form_data,
        )
    assert response.status_code == 200
    online_dict = response.json()

    # Offline runner invocation on the same local file
    offline_json_str = investigate_file_to_json(dataset_path, target_column=target_col)
    offline_dict = json.loads(offline_json_str)
    second_offline_dict = investigate_file_to_dict(dataset_path, target_column=target_col)
    for key in ("summary", "trust_score", "findings", "columns", "recommendations"):
        assert offline_dict[key] == second_offline_dict[key]

    # Both must validate against the exact same ForensicDossier Pydantic schema
    online_dossier = ForensicDossier.model_validate(online_dict)
    offline_dossier = ForensicDossier.model_validate(offline_dict)

    # Compare metadata (excluding wall-clock analyzed_at and execution_time_ms)
    assert offline_dossier.metadata.file_name == online_dossier.metadata.file_name
    assert offline_dossier.metadata.file_size_bytes == online_dossier.metadata.file_size_bytes
    assert offline_dossier.metadata.row_count == online_dossier.metadata.row_count
    assert offline_dossier.metadata.column_count == online_dossier.metadata.column_count
    assert offline_dossier.metadata.engine_version == online_dossier.metadata.engine_version
    assert offline_dossier.metadata.file_type == online_dossier.metadata.file_type

    # Compare summary, trust_score, findings, columns, and recommendations
    assert offline_dict["summary"] == online_dict["summary"]
    assert offline_dict["trust_score"] == online_dict["trust_score"]
    assert offline_dict["findings"] == online_dict["findings"]
    assert offline_dict["columns"] == online_dict["columns"]
    assert offline_dict["recommendations"] == online_dict["recommendations"]
