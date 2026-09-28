"""Thin local execution adapter around the existing INTEGRIS forensic engine.

Validates a local dataset file using the shared ingestion layer, executes
`run_forensic_pipeline()` from `app.engine.pipeline`, and returns the standard
`ForensicDossier` model or RFC 8259 sanitized JSON payload without network calls.
"""

import json
from pathlib import Path
from typing import Any

import pandas as pd

from app.api.routes import (
    MAX_DATASET_COLUMNS,
    MAX_DATASET_ROWS,
    _sanitize_upload_filename,
)
from app.core.config import settings
from app.engine.pipeline import run_forensic_pipeline
from app.engine.sanitizer import sanitize_for_json
from app.ingestion import ingest_dataset
from app.models.report import ForensicDossier


class OfflineInvestigationError(Exception):
    """Controlled error raised when local dataset validation, ingestion, or execution fails."""


def investigate_file(
    file_path: str | Path,
    target_column: str | None = None,
) -> ForensicDossier:
    """Run an offline forensic investigation on a local dataset file.

    Args:
        file_path: Path to a local dataset file (.csv, .tsv, .txt, .xlsx, .xls, .pdf).
        target_column: Optional target column name for ML leakage checks.

    Returns:
        ForensicDossier produced by `app.engine.pipeline.run_forensic_pipeline`.

    Raises:
        OfflineInvestigationError: If the file does not exist, has an unsupported
            extension, exceeds size or dimension limits, fails parsing, or specifies
            a non-existent target column.
    """
    if not file_path or not str(file_path).strip():
        raise OfflineInvestigationError("Dataset file path must not be empty.")

    path = Path(file_path)
    if not path.exists():
        raise OfflineInvestigationError(f"Dataset file not found: '{file_path}'.")
    if not path.is_file():
        raise OfflineInvestigationError(f"Dataset path is not a regular file: '{file_path}'.")

    # 1. Sanitize filename to basename and validate file extension
    filename = _sanitize_upload_filename(path.name)
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise OfflineInvestigationError(
            f"Unsupported file format '{ext}'. Allowed extensions: {settings.ALLOWED_EXTENSIONS}."
        )

    # 2. Enforce format-specific size limits before reading into memory
    max_bytes = settings.FORMAT_SIZE_LIMITS_BYTES.get(ext, settings.MAX_UPLOAD_SIZE_BYTES)
    try:
        file_size = path.stat().st_size
    except OSError as exc:
        raise OfflineInvestigationError(
            f"Failed to inspect dataset file: {exc.strerror or 'OS error'}."
        ) from exc

    if file_size == 0:
        raise OfflineInvestigationError("Uploaded dataset file is completely empty (0 bytes).")

    if file_size > max_bytes:
        raise OfflineInvestigationError(
            f"Dataset size ({file_size / (1024 * 1024):.1f} MB) exceeds the maximum allowed limit of {max_bytes / (1024 * 1024):.0f} MB."
        )

    try:
        content = path.read_bytes()
    except OSError as exc:
        raise OfflineInvestigationError(
            f"Failed to read dataset file: {exc.strerror or 'OS error'}."
        ) from exc

    # 3. Shared multi-format ingestion & in-memory parsing
    try:
        ingestion = ingest_dataset(filename=filename, content=content)
        df = ingestion.df
    except pd.errors.EmptyDataError as exc:
        raise OfflineInvestigationError(
            "Dataset parsing failed: File contains no header or tabular records."
        ) from exc
    except pd.errors.ParserError as exc:
        raise OfflineInvestigationError(
            "Malformed dataset: Structural delimiter or quote parsing error encountered."
        ) from exc
    except ValueError as exc:
        raise OfflineInvestigationError(str(exc)) from exc
    except Exception as exc:
        raise OfflineInvestigationError(
            "Unable to parse dataset. Ensure the file is a standard supported tabular file."
        ) from exc

    # 4. Dimension & target column validation
    if df.empty or len(df.columns) == 0:
        raise OfflineInvestigationError("Dataset contains 0 records or 0 columns after parsing.")

    if len(df) > MAX_DATASET_ROWS:
        raise OfflineInvestigationError(
            f"Dataset contains {len(df):,} records, which exceeds the maximum processing limit of {MAX_DATASET_ROWS:,} rows."
        )

    if len(df.columns) > MAX_DATASET_COLUMNS:
        raise OfflineInvestigationError(
            f"Dataset contains {len(df.columns):,} columns, which exceeds the maximum processing limit of {MAX_DATASET_COLUMNS:,} columns."
        )

    target_clean = target_column.strip() if target_column else None
    if target_clean:
        if target_clean not in df.columns:
            col_preview = [str(c) for c in list(df.columns)[:20]]
            suffix = f" (and {len(df.columns) - 20} more)" if len(df.columns) > 20 else ""
            raise OfflineInvestigationError(
                f"Specified target column '{target_clean}' does not exist in dataset. Available columns: {col_preview}{suffix}."
            )

    # 5. Execute the existing Forensic Pipeline
    try:
        return run_forensic_pipeline(
            df=df,
            file_name=filename,
            file_size_bytes=file_size,
            target_column=target_clean,
            file_type=ingestion.file_type,
            sheet_name=ingestion.sheet_name,
            available_sheets=ingestion.available_sheets,
            table_index=ingestion.table_index,
            page_count=ingestion.page_count,
        )
    except OfflineInvestigationError:
        raise
    except Exception as exc:
        raise OfflineInvestigationError(
            f"Forensic investigation pipeline encountered an internal error during execution: {type(exc).__name__}."
        ) from exc


def investigate_file_to_dict(
    file_path: str | Path,
    target_column: str | None = None,
) -> dict[str, Any]:
    """Run an offline investigation and return the RFC 8259 sanitized JSON dictionary."""
    dossier = investigate_file(file_path=file_path, target_column=target_column)
    sanitized: dict[str, Any] = sanitize_for_json(dossier.model_dump(mode="json"))
    return sanitized


def investigate_file_to_json(
    file_path: str | Path,
    target_column: str | None = None,
    indent: int | None = 2,
) -> str:
    """Run an offline investigation and serialize the result to a strict JSON string."""
    payload = investigate_file_to_dict(file_path=file_path, target_column=target_column)
    return json.dumps(payload, indent=indent, allow_nan=False)
