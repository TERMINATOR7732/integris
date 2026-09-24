"""Excel parser for .xlsx and .xls files."""

import io
import pandas as pd


def parse_excel(content: bytes, file_type: str) -> tuple[pd.DataFrame, str, list[str]]:
    """Parse an Excel workbook stream into a DataFrame from the first non-empty sheet.

    Returns:
        tuple of (df, selected_sheet_name, available_sheet_names)

    Raises:
        ValueError if the file is invalid, corrupted, or has no tabular records.
    """
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
        df = df.dropna(how="all").dropna(axis=1, how="all")
        if not df.empty and len(df.columns) > 0 and len(df) > 0:
            selected_sheet = sheet
            # Clean headers: convert all column names to string and strip
            df.columns = [str(c).strip() for c in df.columns]
            df_result = df
            break

    if df_result is None or selected_sheet is None:
        raise ValueError("Spreadsheet contains no tabular records across any sheets.")

    # Convert datetime columns to ISO formatted strings for downstream forensic analyzers
    for col in df_result.columns:
        if pd.api.types.is_datetime64_any_dtype(df_result[col]):
            df_result[col] = df_result[col].dt.strftime("%Y-%m-%d %H:%M:%S")

    return df_result, selected_sheet, available_sheets
