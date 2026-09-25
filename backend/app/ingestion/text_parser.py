"""TXT parser for INTEGRIS with tabular delimiter validation."""

import csv
import io
import pandas as pd


def parse_txt(content: bytes) -> pd.DataFrame:
    """Parse TXT file into a tabular DataFrame or reject unstructured prose."""
    try:
        text_sample = content[:4096].decode("utf-8-sig", errors="replace")
    except Exception as e:
        raise ValueError("This TXT file cannot be decoded as text.") from e

    lines = [line.strip() for line in text_sample.splitlines() if line.strip()]
    if not lines:
        raise ValueError("Uploaded TXT file is empty or contains only whitespace.")

    # Check for structured delimiters across the sample lines
    common_delimiters = [",", "\t", "|", ";"]
    delimiter_counts = {d: 0 for d in common_delimiters}
    for line in lines[:10]:
        for d in common_delimiters:
            if d in line:
                delimiter_counts[d] += 1

    # Delimiter must appear in at least half of the sample lines (or at least 1 if only 1-2 lines)
    min_required = max(1, len(lines[:10]) // 2)
    viable_delims = [d for d, count in delimiter_counts.items() if count >= min_required]
    if not viable_delims:
        raise ValueError("This TXT file does not contain structured tabular data.")

    # Attempt csv.Sniffer with candidate delimiters
    sniffer = csv.Sniffer()
    delimiter = None
    try:
        detected = sniffer.sniff(text_sample, delimiters=viable_delims)
        delimiter = detected.delimiter
    except Exception:
        # Fall back to the most frequent delimiter
        delimiter = max(viable_delims, key=lambda d: delimiter_counts[d])

    try:
        df = pd.read_csv(
            io.BytesIO(content),
            sep=delimiter,
            encoding="utf-8-sig",
            encoding_errors="replace",
            low_memory=False,
        )
    except Exception as e:
        raise ValueError("This TXT file does not contain structured tabular data.") from e

    # Validation: Unstructured prose check
    if df.empty:
        raise ValueError("This TXT file does not contain structured tabular data.")

    if len(df.columns) < 2:
        col_name = str(df.columns[0])
        first_vals = df[col_name].dropna().head(5).astype(str).tolist()
        has_spaces = any(" " in val for val in first_vals)
        avg_len = sum(len(v) for v in first_vals) / max(len(first_vals), 1)
        if has_spaces and avg_len > 25:
            raise ValueError("This TXT file does not contain structured tabular data.")

    return df
