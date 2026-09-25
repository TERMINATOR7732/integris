"""Format detection and validation based on extensions and magic bytes."""

from typing import Literal

FileType = Literal["csv", "tsv", "xlsx", "xls", "pdf", "txt"]


def detect_file_type(filename: str, content: bytes) -> str:
    """Detect and validate file format using filename extension and magic bytes.

    Raises:
        ValueError if the file format is invalid, mismatched, or unsupported.
    """
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # Check magic byte signatures
    if content.startswith(b"%PDF"):
        if ext and ext != ".pdf":
            raise ValueError(f"File contains PDF data but has extension '{ext}'.")
        return "pdf"

    if content.startswith(b"PK\x03\x04"):
        if ext in (".xls", ".csv", ".tsv", ".txt"):
            raise ValueError(f"File contains OpenXML/ZIP data but has extension '{ext}'.")
        return "xlsx"

    if content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        if ext in (".xlsx", ".csv", ".tsv", ".txt"):
            raise ValueError(f"File contains legacy OLE/XLS data but has extension '{ext}'.")
        return "xls"

    # Extension-based mapping for text-based formats
    if ext in (".csv", ".tsv", ".txt"):
        if b"\x00" in content[:8192] and not content.startswith((b"\xff\xfe", b"\xfe\xff")):
            raise ValueError(f"File with extension '{ext}' contains binary null-byte data and is not valid text.")
        return ext.lstrip(".")
    elif ext == ".xlsx":
        # Missing zip header for xlsx
        raise ValueError("Invalid .xlsx file: missing OpenXML zip archive signature.")
    elif ext == ".xls":
        raise ValueError("Invalid .xls file: missing legacy Excel binary signature.")
    elif ext == ".pdf":
        raise ValueError("Invalid .pdf file: missing %PDF header signature.")

    raise ValueError(f"Unsupported file format '{ext}'.")
