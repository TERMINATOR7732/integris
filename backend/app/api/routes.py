"""API route definitions for INTEGRIS."""

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
import pandas as pd

from app.core.config import settings
from app.engine.pipeline import run_forensic_pipeline
from app.engine.sanitizer import sanitize_for_json
from app.ingestion import ingest_dataset
from app.models.report import ForensicDossier, HealthResponse

router = APIRouter()

MAX_DATASET_ROWS = 500_000
MAX_DATASET_COLUMNS = 1_000


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
    max_bytes = settings.FORMAT_SIZE_LIMITS_BYTES.get(ext, settings.MAX_UPLOAD_SIZE_BYTES)
    try:
        content = await file.read(max_bytes + 1)
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

    if file_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Dataset size ({file_size / (1024*1024):.1f} MB) exceeds the maximum allowed limit of {max_bytes / (1024*1024):.0f} MB.",
        )

    # 3. Delimiter / Document Ingestion & In-Memory Parsing
    try:
        ingestion = ingest_dataset(filename=filename, content=content)
        df = ingestion.df
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
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to parse dataset. Ensure the file is a standard supported tabular file.",
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

    if len(df.columns) > MAX_DATASET_COLUMNS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Dataset contains {len(df.columns):,} columns, which exceeds the maximum processing limit of {MAX_DATASET_COLUMNS:,} columns.",
        )

    target_clean = target_column.strip() if target_column else None
    if target_clean:
        if target_clean not in df.columns:
            col_preview = [str(c) for c in list(df.columns)[:20]]
            suffix = f" (and {len(df.columns) - 20} more)" if len(df.columns) > 20 else ""
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Specified target column '{target_clean}' does not exist in dataset. Available columns: {col_preview}{suffix}.",
            )

    # 5. Execute Forensic Pipeline (Zero-Retention: in-memory execution)
    try:
        dossier = run_forensic_pipeline(
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
        sanitized = sanitize_for_json(dossier.model_dump(mode="json"))
        return JSONResponse(status_code=status.HTTP_200_OK, content=sanitized)
    except HTTPException:
        raise
    except Exception as e:
        # Prevent stack trace leakage to client
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forensic investigation pipeline encountered an internal error during execution: {type(e).__name__}.",
        )
