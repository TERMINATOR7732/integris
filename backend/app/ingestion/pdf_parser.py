"""PDF tabular extractor for INTEGRIS."""

import io
import pdfplumber
import pandas as pd


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

            extracted_tables: list[list[list[str | None]]] = []
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        if table and len(table) >= 2:  # At least 1 header + 1 data row
                            extracted_tables.append(table)
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

    # Filter candidate tables for genuine tabular structure (reject decorative borders or paragraph boxes)
    valid_tables: list[list[list[str | None]]] = []
    for table in extracted_tables:
        if len(table) < 2 or len(table[0]) < 2:
            continue
        non_empty_cells = [str(c).strip() for row in table for c in row if c is not None and str(c).strip()]
        if len(non_empty_cells) < 4:
            continue
        avg_newlines = sum(c.count("\n") for c in non_empty_cells) / len(non_empty_cells)
        avg_len = sum(len(c) for c in non_empty_cells) / len(non_empty_cells)
        if avg_newlines > 2 or (avg_len > 80 and len(table) < 5):
            continue
        valid_tables.append(table)

    if not valid_tables:
        raise ValueError(
            "This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document."
        )

    # Coalesce multi-page table chunks or use the primary table
    primary_table = valid_tables[0]
    col_count = len(primary_table[0])

    raw_headers = primary_table[0]
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

    # Check subsequent tables: coalesce if column count matches
    for tbl in extracted_tables[1:]:
        if len(tbl[0]) == col_count:
            tbl_headers = [str(h).strip() if h is not None else "" for h in tbl[0]]
            norm_primary = [str(h).strip() if h is not None else "" for h in raw_headers]
            start_idx = 1 if tbl_headers == norm_primary else 0
            for row in tbl[start_idx:]:
                if any(cell is not None and str(cell).strip() for cell in row):
                    padded = list(row[:col_count]) + [None] * max(0, col_count - len(row))
                    combined_rows.append(padded)

    if not combined_rows:
        raise ValueError(
            "This PDF does not contain machine-readable tabular data. OCR is not currently enabled for this document."
        )

    df = pd.DataFrame(combined_rows, columns=unique_headers)

    # Clean whitespace in string cells
    for col in df.columns:
        df[col] = df[col].apply(lambda v: v.strip() if isinstance(v, str) else v)

    return df, page_count, 1
