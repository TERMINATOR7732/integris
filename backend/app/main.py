"""INTEGRIS Backend Application Entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Data Integrity & Forensics Platform — Find what your data is hiding.",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Development CORS configuration for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API v1 router
app.include_router(api_router, prefix=settings.API_V1_PREFIX, tags=["Forensics"])


@app.get("/", tags=["Root"])
async def root() -> dict[str, str]:
    """Root platform descriptor."""
    return {
        "platform": settings.PROJECT_NAME,
        "tagline": settings.TAGLINE,
        "version": settings.VERSION,
        "health": f"{settings.API_V1_PREFIX}/health",
        "docs": "/docs",
    }
