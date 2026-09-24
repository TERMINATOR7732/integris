"""Data models for ingestion results."""

from dataclasses import dataclass, field
import pandas as pd


@dataclass
class IngestionResult:
    """Internal tabular representation of an ingested dataset."""

    df: pd.DataFrame
    file_type: str  # "csv", "tsv", "xlsx", "xls", "pdf", "txt"
    sheet_name: str | None = None
    available_sheets: list[str] | None = None
    table_index: int | None = None
    page_count: int | None = None
    warnings: list[str] = field(default_factory=list)
