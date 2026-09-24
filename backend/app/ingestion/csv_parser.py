"""CSV and TSV parser for INTEGRIS."""

import csv
import io
import pandas as pd


def parse_csv(content: bytes) -> pd.DataFrame:
    """Parse CSV or TSV byte stream in memory into a Pandas DataFrame.

    Preserves exact sniff-and-parse behavior required for the forensic stress baseline.
    """
    sample_chunk = content[:4096].decode("utf-8", errors="replace")
    sniffer = csv.Sniffer()
    try:
        detected_dialect = sniffer.sniff(sample_chunk, delimiters=[",", "\t", ";", "|"])
        delimiter = detected_dialect.delimiter
    except Exception:
        delimiter = "\t" if "\t" in sample_chunk.split("\n")[0] else ","

    df = pd.read_csv(
        io.BytesIO(content),
        sep=delimiter,
        encoding="utf-8",
        encoding_errors="replace",
        low_memory=False,
    )
    return df
