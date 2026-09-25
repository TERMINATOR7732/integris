import os
from pydantic import BaseModel, Field


def _load_cors_origins() -> list[str]:
    default_origins = (
        "https://integris-ten.vercel.app,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )
    origins = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", default_origins).split(",")
        if origin.strip()
    ]
    if "https://integris-ten.vercel.app" not in origins:
        origins.insert(0, "https://integris-ten.vercel.app")
    return origins


def _load_cors_origin_regex() -> str:
    strict_regex = r"^https://integris-ten(-[a-z0-9-]+)?\.vercel\.app$"
    raw = (os.getenv("CORS_ORIGIN_REGEX") or "").strip()
    if not raw or raw in {r"https://.*\.vercel\.app", r"^https://.*\.vercel\.app$"}:
        return strict_regex
    return raw


class Settings(BaseModel):
    """Immutable application configuration."""

    PROJECT_NAME: str = "INTEGRIS"
    TAGLINE: str = "Find what your data is hiding."
    VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api/v1"

    # Development and production CORS origins
    CORS_ORIGINS: list[str] = Field(default_factory=_load_cors_origins)
    CORS_ORIGIN_REGEX: str | None = Field(default_factory=_load_cors_origin_regex)

    # Zero-retention upload boundaries (50 MB default for CSV/TSV/TXT, 25 MB for Excel, 15 MB for PDF)
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024
    ALLOWED_EXTENSIONS: list[str] = [".csv", ".tsv", ".txt", ".xlsx", ".xls", ".pdf"]
    FORMAT_SIZE_LIMITS_BYTES: dict[str, int] = Field(
        default_factory=lambda: {
            ".csv": 50 * 1024 * 1024,
            ".tsv": 50 * 1024 * 1024,
            ".txt": 50 * 1024 * 1024,
            ".xlsx": 25 * 1024 * 1024,
            ".xls": 25 * 1024 * 1024,
            ".pdf": 15 * 1024 * 1024,
        }
    )


settings = Settings()

