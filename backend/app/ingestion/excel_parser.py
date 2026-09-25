"""Excel parser for .xlsx and .xls files."""

from datetime import date, datetime
import io
import zipfile
import pandas as pd

MAX_EXCEL_UNCOMPRESSED_BYTES = 250 * 1024 * 1024


def _normalize_excel_datetime_cell(val: object) -> object:
    """Format Python datetime/date instances in mixed object columns to ISO strings."""
    if pd.isna(val):
        return val
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(val, date):
        return val.strftime("%Y-%m-%d")
    return val


def parse_excel(content: bytes, file_type: str) -> tuple[pd.DataFrame, str, list[str]]:
    """Parse an Excel workbook stream into a DataFrame from the first non-empty sheet.

    Returns:
        tuple of (df, selected_sheet_name, available_sheet_names)

    Raises:
        ValueError if the file is invalid, corrupted, or has no tabular records.
    """
    if file_type == "xlsx":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                total_uncompressed = sum(info.file_size for info in zf.infolist())
                if total_uncompressed > MAX_EXCEL_UNCOMPRESSED_BYTES:
                    raise ValueError(
                        "Excel archive uncompressed size exceeds safety limits (potential decompression bomb)."
                    )
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Unable to read Excel file ({file_type}): {str(e)}") from e

    engine = "openpyxl" if file_type == "xlsx" else "xlrd"
    bio = io.BytesIO(content)

    try:
        excel_file = pd.ExcelFile(bio, engine=engine)
    except Exception as e:
        raise ValueError(f"Unable to read Excel file ({file_type}): {str(e)}") from e

    available_sheets = excel_file.sheet_names
    if not available_sheets:
        raise ValueError("Spreadsheet contains no sheets.")

    selected_sheet = None
    df_result = None

    for sheet in available_sheets:
        try:
            df = pd.read_excel(excel_file, sheet_name=sheet)
        except Exception:
            continue

        # Strip completely empty rows and columns
        df = df.dropna(how="all").dropna(axis=1, how="all").reset_index(drop=True)
        if not df.empty and len(df.columns) > 0 and len(df) > 0:
            selected_sheet = sheet
            # Clean and deduplicate headers
            raw_headers = [
                str(c).strip() if c is not None and str(c).strip() else f"col_{i+1}"
                for i, c in enumerate(df.columns)
            ]
            unique_headers: list[str] = []
            counts: dict[str, int] = {}
            for h in raw_headers:
                if h in counts:
                    counts[h] += 1
                    unique_headers.append(f"{h}_{counts[h]}")
                else:
                    counts[h] = 0
                    unique_headers.append(h)
            df.columns = unique_headers
            df_result = df
            break

    if df_result is None or selected_sheet is None:
        raise ValueError("Spreadsheet contains no tabular records across any sheets.")

    # Convert datetime columns to ISO formatted strings for downstream forensic analyzers
    for col in df_result.columns:
        if pd.api.types.is_datetime64_any_dtype(df_result[col]):
            df_result[col] = df_result[col].dt.strftime("%Y-%m-%d %H:%M:%S")
        elif df_result[col].dtype == object:
            non_null = df_result[col].dropna()
            if not non_null.empty and non_null.map(lambda v: isinstance(v, (datetime, date))).any():
                df_result[col] = df_result[col].map(_normalize_excel_datetime_cell)

    return df_result, selected_sheet, available_sheets
