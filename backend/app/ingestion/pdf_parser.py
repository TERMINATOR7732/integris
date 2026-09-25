"""PDF tabular extractor for INTEGRIS."""

import io
import re
import numpy as np
import pdfplumber
import pandas as pd

from app.engine.uniqueness import _is_identifier_column

NUMERIC_LITERAL_PATTERN = re.compile(r"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$")
LEADING_ZERO_ID_PATTERN = re.compile(r"^[+-]?0\d+$")


def _infer_pdf_column_dtype(series: pd.Series, col_name: str) -> pd.Series:
    """Infer numeric dtype for a PDF column when all non-empty values are valid numbers.

    Preserves identifiers, leading-zero codes, dates, categorical values, and mixed columns as strings.
    """
    if _is_identifier_column(col_name):
        return series

    non_empty_mask = series.notna() & (series.astype(str) != "")
    if not non_empty_mask.any():
        return series

    non_empty_strs = series.loc[non_empty_mask].astype(str)

    # Preserve leading-zero identifier/code strings (e.g. '00123')
    if non_empty_strs.str.match(LEADING_ZERO_ID_PATTERN).any():
        return series

    # Require every non-empty cell to match a numeric literal (do not coerce mixed columns)
    if not non_empty_strs.str.match(NUMERIC_LITERAL_PATTERN).all():
        return series

    normalized = series.where(non_empty_mask, None)
    coerced = pd.to_numeric(normalized, errors="coerce")
    if not (coerced.loc[non_empty_mask].notna().all() and np.isfinite(coerced.loc[non_empty_mask]).all()):
        return series

    has_decimal_or_exp = non_empty_strs.str.contains(r"[\.eE]", regex=True).any()
    if non_empty_mask.all() and not has_decimal_or_exp:
        try:
            return coerced.astype("int64")
        except (ValueError, TypeError, OverflowError):
            return coerced.astype("float64")

    return coerced.astype("float64")


def parse_pdf(content: bytes) -> tuple[pd.DataFrame, int, int]:
    """Extract tabular data from a PDF document stream in volatile memory.

    Returns:
        tuple of (df, page_count, table_index)

    Raises:
        ValueError if no machine-readable tables are found.
    """
    bio = io.BytesIO(content)
    try:
        with pdfplumber.open(bio) as pdf:
            page_count = len(pdf.pages)
            if page_count == 0:
                raise ValueError("PDF document contains no pages.")

            extracted_tables: list[tuple[int, list[list[str | None]]]] = []
            for page_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        if table and len(table) >= 1 and len(table[0]) >= 2:
                            extracted_tables.append((page_idx, table))
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(
            "This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document."
        ) from e

    if not extracted_tables:
        raise ValueError(
            "This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document."
        )

    # Locate the primary multi-row table (must have at least 1 header + 1 data row and pass tabular structure checks)
    primary_entry_idx: int | None = None
    for idx, (_, table) in enumerate(extracted_tables):
        if len(table) < 2 or len(table[0]) < 2:
            continue
        non_empty_cells = [str(c).strip() for row in table for c in row if c is not None and str(c).strip()]
        if len(non_empty_cells) < 4:
            continue
        avg_newlines = sum(c.count("\n") for c in non_empty_cells) / len(non_empty_cells)
        avg_len = sum(len(c) for c in non_empty_cells) / len(non_empty_cells)
        if avg_newlines > 2 or (avg_len > 80 and len(table) < 5):
            continue
        primary_entry_idx = idx
        break

    if primary_entry_idx is None:
        raise ValueError(
            "This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document."
        )

    # Coalesce multi-page table chunks or use the primary table
    primary_page_idx, primary_table = extracted_tables[primary_entry_idx]
    col_count = len(primary_table[0])

    raw_headers = primary_table[0]
    norm_primary = [str(h).strip() if h is not None else "" for h in raw_headers]
    headers = [
        str(h).strip() if h is not None and str(h).strip() else f"col_{i+1}"
        for i, h in enumerate(raw_headers)
    ]

    # Ensure unique header names
    unique_headers: list[str] = []
    header_counts: dict[str, int] = {}
    for h in headers:
        if h in header_counts:
            header_counts[h] += 1
            unique_headers.append(f"{h}_{header_counts[h]}")
        else:
            header_counts[h] = 0
            unique_headers.append(h)

    combined_rows: list[list[str | None]] = []

    # Add data rows from first table
    for row in primary_table[1:]:
        if any(cell is not None and str(cell).strip() for cell in row):
            padded = list(row[:col_count]) + [None] * max(0, col_count - len(row))
            combined_rows.append(padded)

    # Check subsequent tables: coalesce matching multi-row tables and valid 1-row continuation pages
    for page_idx, tbl in extracted_tables[primary_entry_idx + 1 :]:
        if len(tbl[0]) != col_count:
            continue
        non_empty_cells = [str(c).strip() for row in tbl for c in row if c is not None and str(c).strip()]
        if not non_empty_cells:
            continue
        avg_newlines = sum(c.count("\n") for c in non_empty_cells) / len(non_empty_cells)
        avg_len = sum(len(c) for c in non_empty_cells) / len(non_empty_cells)
        tbl_headers = [str(h).strip() if h is not None else "" for h in tbl[0]]

        if len(tbl) >= 2:
            if len(non_empty_cells) < 4:
                continue
            if avg_newlines > 2 or (avg_len > 80 and len(tbl) < 5):
                continue
            start_idx = 1 if tbl_headers == norm_primary else 0
            for row in tbl[start_idx:]:
                if any(cell is not None and str(cell).strip() for cell in row):
                    padded = list(row[:col_count]) + [None] * max(0, col_count - len(row))
                    combined_rows.append(padded)
        elif len(tbl) == 1 and page_idx > primary_page_idx:
            # Single-row continuation table on a subsequent page: reject if it is a repeated header or prose noise
            if tbl_headers == norm_primary:
                continue
            if len(non_empty_cells) < 2 or avg_newlines > 2 or avg_len > 80:
                continue
            padded = list(tbl[0][:col_count]) + [None] * max(0, col_count - len(tbl[0]))
            combined_rows.append(padded)

    if not combined_rows:
        raise ValueError(
            "This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document."
        )

    df = pd.DataFrame(combined_rows, columns=unique_headers)

    # Clean whitespace in string cells and infer numeric column types where appropriate
    for col in df.columns:
        df[col] = df[col].apply(lambda v: v.strip() if isinstance(v, str) else v)
        df[col] = _infer_pdf_column_dtype(df[col], str(col))

    return df, page_count, 1
