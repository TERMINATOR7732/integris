import re
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import router as api_router
from app.core.config import settings


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Intercept unhandled exceptions and return JSON 500 with CORS headers intact.

    Ensures that unexpected server crashes still return valid CORS headers for
    authorized origins so browsers can read the JSON error instead of dropping
    the response due to Missing Allow-Origin.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            origin = request.headers.get("origin")
            headers = {}
            if origin:
                is_allowed = origin in settings.CORS_ORIGINS
                if not is_allowed and settings.CORS_ORIGIN_REGEX:
                    is_allowed = bool(re.fullmatch(settings.CORS_ORIGIN_REGEX, origin))
                if is_allowed or "*" in settings.CORS_ORIGINS:
                    headers["Access-Control-Allow-Origin"] = origin
                    headers["Access-Control-Allow-Credentials"] = "true"
                    headers["Vary"] = "Origin"

            return JSONResponse(
                status_code=500,
                content={
                    "detail": f"Forensic engine encountered an internal server error: {type(exc).__name__}."
                },
                headers=headers,
            )


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Data Integrity & Forensics Platform — Find what your data is hiding.",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Intercept unhandled exceptions before they reach Starlette ServerErrorMiddleware
app.add_middleware(ErrorHandlerMiddleware)

# Development & Production CORS configuration
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
