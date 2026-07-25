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
from app.api.v1 import analyze, stations

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
            calibration_divisor=settings.pm25_calibration_divisor,
            pm25_max=settings.pm25_max,
            mc_samples=settings.mc_dropout_samples,
        )
        app.state.ml_service = service
        logger.info(
            "ML regression model loaded (MC-dropout samples=%d).",
            settings.mc_dropout_samples,
        )
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
            "data (WAQI, OpenAQ), global modelled coverage (Open-Meteo CAMS, "
            "OpenWeather Air Pollution) and weather context (OpenWeatherMap)."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── CORS ─────────────────────────────────────────────────────────
    # Origins come from CORS_ORIGINS so a deployed frontend can be allowed
    # without a code change. Defaults cover the local Next.js dev server.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
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

    # ── Mount API router ─────────────────────────────────────────────
    app.include_router(analyze.router, prefix="/api/v1")
    app.include_router(stations.router, prefix="/api/v1")

    return app


# Module-level app instance used by uvicorn
app = create_app()
