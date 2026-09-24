import os
from pydantic import BaseModel, Field


class Settings(BaseModel):
    """Immutable application configuration."""

    PROJECT_NAME: str = "INTEGRIS"
    TAGLINE: str = "Find what your data is hiding."
    VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api/v1"

    # Development and production CORS origins
    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: [
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
            ).split(",")
            if origin.strip()
        ]
    )
    CORS_ORIGIN_REGEX: str | None = Field(
        default_factory=lambda: os.getenv("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app")
    )

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

