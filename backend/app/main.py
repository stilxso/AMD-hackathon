"""
FastAPI application entry point.

- CORS middleware allows the Next.js dev server (port 3000) to call the API.
- Lifespan handler loads the ML model once at startup and releases it on shutdown.
- Health endpoint for quick liveness checks.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

logger = logging.getLogger("airq")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: load the EfficientNet-B0 model into app.state.
    Shutdown: release the model from memory.
    """
    # ── Startup ──────────────────────────────────────────────────────
    logger.info("Loading ML model from %s …", settings.model_abs_path)

    # Lazy import so the server can still boot if torch isn't installed yet
    # (useful during early scaffold testing).
    try:
        from app.ml.inference import InferenceService

        service = InferenceService(
            model_path=settings.model_abs_path,
            num_classes=settings.num_classes,
        )
        app.state.ml_service = service
        logger.info("ML model loaded successfully (%s classes).", settings.num_classes)
    except Exception as exc:
        logger.warning("Could not load ML model – running without inference: %s", exc)
        app.state.ml_service = None

    yield

    # ── Shutdown ─────────────────────────────────────────────────────
    app.state.ml_service = None
    logger.info("ML model released.")


def create_app() -> FastAPI:
    """Factory that builds and returns the configured FastAPI application."""

    app = FastAPI(
        title="AirQ – Air Quality Prediction API",
        description=(
            "Upload a sky / landscape photo and get a PM2.5-based AQI score. "
            "Combines EfficientNet-B0 vision inference with real-time station "
            "data (WAQI, OpenAQ) and weather context (OpenWeatherMap)."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── CORS ─────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",   # Next.js dev server
            "http://127.0.0.1:3000",
            "http://localhost:3001",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Health endpoint ──────────────────────────────────────────────
    @app.get("/health", tags=["system"])
    async def health():
        """Liveness / readiness probe."""
        return {
            "status": "ok",
            "model_loaded": app.state.ml_service is not None,
            "version": app.version,
        }

    # ── Mount API router (Stage 5 will add the analyze route) ────────
    # Placeholder: will be filled in Stage 5
    # from app.api.routes import router as api_router
    # app.include_router(api_router)

    return app


# Module-level app instance used by uvicorn
app = create_app()
