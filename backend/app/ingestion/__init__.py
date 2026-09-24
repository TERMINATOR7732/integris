"""Ingestion module for INTEGRIS.

Provides unified, zero-retention tabular ingestion across CSV, TSV, TXT, XLSX, XLS, and PDF formats.
"""

from app.ingestion.detector import detect_file_type
from app.ingestion.models import IngestionResult
from app.ingestion.csv_parser import parse_csv
from app.ingestion.excel_parser import parse_excel
from app.ingestion.text_parser import parse_txt
from app.ingestion.pdf_parser import parse_pdf


def ingest_dataset(filename: str, content: bytes) -> IngestionResult:
    """Ingest any supported file format stream into a unified tabular IngestionResult.

    All processing occurs entirely in volatile memory with zero disk retention.
    """
    file_type = detect_file_type(filename, content)

    if file_type in ("csv", "tsv"):
        df = parse_csv(content)
        return IngestionResult(df=df, file_type=file_type)

    elif file_type == "txt":
        df = parse_txt(content)
        return IngestionResult(df=df, file_type="txt")

    elif file_type in ("xlsx", "xls"):
        df, sheet_name, available_sheets = parse_excel(content, file_type)
        return IngestionResult(
            df=df,
            file_type=file_type,
            sheet_name=sheet_name,
            available_sheets=available_sheets,
        )

    elif file_type == "pdf":
        df, page_count, table_index = parse_pdf(content)
        return IngestionResult(
            df=df,
            file_type="pdf",
            page_count=page_count,
            table_index=table_index,
        )

    raise ValueError(f"Unsupported format '{file_type}'.")


__all__ = [
    "detect_file_type",
    "ingest_dataset",
    "IngestionResult",
    "parse_csv",
    "parse_excel",
    "parse_txt",
    "parse_pdf",
]
