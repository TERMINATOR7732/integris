"""API route definitions for INTEGRIS."""

import csv
from datetime import datetime, timezone
import io
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
import pandas as pd

from app.core.config import settings
from app.engine.pipeline import run_forensic_pipeline
from app.models.report import ForensicDossier, HealthResponse

router = APIRouter()

MAX_DATASET_ROWS = 500_000


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="System and Engine Health Check",
    description="Confirms that the INTEGRIS API and forensic engine foundation are operational.",
)
async def get_health() -> HealthResponse:
    """Return health status and readiness of the forensic analysis engine."""
    return HealthResponse(
        status="healthy",
        service=f"{settings.PROJECT_NAME} Forensic Engine",
        version=settings.VERSION,
        engine_status="ready",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.post(
    "/investigate",
    response_model=ForensicDossier,
    summary="Perform Forensic Investigation on Dataset",
    description="Analyzes an uploaded dataset entirely in-memory and returns a structured Forensic Dossier.",
)
async def investigate_dataset(
    file: Annotated[UploadFile, File(description="Tabular CSV, TSV, or TXT file to investigate")],
    target_column: Annotated[str | None, Form(description="Optional target feature name for ML leakage analysis")] = None,
) -> ForensicDossier:
    """Ingest dataset stream into volatile memory, run forensic analyzers, and return Dossier."""
    # 1. Validate file extension
    filename = file.filename or "dataset.csv"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed extensions: {settings.ALLOWED_EXTENSIONS}.",
        )

    # 2. Ingest stream and enforce size boundary in memory
    try:
        content = await file.read()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read uploaded file stream.",
        )

    file_size = len(content)
    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded dataset file is completely empty (0 bytes).",
        )

    if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Dataset size ({file_size / (1024*1024):.1f} MB) exceeds the maximum allowed limit of {settings.MAX_UPLOAD_SIZE_BYTES / (1024*1024):.0f} MB.",
        )

    # 3. Delimiter Detection & In-Memory Parsing
    try:
        sample_chunk = content[:4096].decode("utf-8", errors="replace")
        sniffer = csv.Sniffer()
        try:
            detected_dialect = sniffer.sniff(sample_chunk, delimiters=[",", "\t", ";", "|"])
            delimiter = detected_dialect.delimiter
        except Exception:
            delimiter = "\t" if "\t" in sample_chunk.split("\n")[0] else ","

        # Parse CSV into Pandas DataFrame purely in memory
        df = pd.read_csv(
            io.BytesIO(content),
            sep=delimiter,
            encoding="utf-8",
            encoding_errors="replace",
            low_memory=False,
        )
    except pd.errors.EmptyDataError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dataset parsing failed: File contains no header or tabular records.",
        )
    except pd.errors.ParserError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed dataset: Structural delimiter or quote parsing error encountered.",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to parse dataset. Ensure the file is a standard delimited tabular file.",
        )

    # 4. Dimension & Target Validation
    if df.empty or len(df.columns) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dataset contains 0 records or 0 columns after parsing.",
        )

    if len(df) > MAX_DATASET_ROWS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Dataset contains {len(df):,} records, which exceeds the maximum processing limit of {MAX_DATASET_ROWS:,} rows.",
        )

    target_clean = target_column.strip() if target_column else None
    if target_clean:
        if target_clean not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Specified target column '{target_clean}' does not exist in dataset. Available columns: {list(df.columns)}.",
            )

    # 5. Execute Forensic Pipeline (Zero-Retention: in-memory execution)
    try:
        dossier = run_forensic_pipeline(
            df=df,
            file_name=filename,
            file_size_bytes=file_size,
            target_column=target_clean,
        )
        return dossier
    except Exception as e:
        # Prevent stack trace leakage to client
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forensic investigation pipeline encountered an internal error during execution: {type(e).__name__}.",
        )
