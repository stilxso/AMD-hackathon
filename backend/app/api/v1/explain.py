import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import current_user
from app.config import settings
from app.services.air_quality import fetch_air_quality
from app.services.auth import User
from app.services.explain import ExplainError, build_evidence, generate_explanation
from app.services.fusion import pm25_to_aqi
from app.services.grid import fetch_point_context, fetch_pm25_grid
from app.services.weather import WeatherClient

logger = logging.getLogger("airq.api")
router = APIRouter()

weather_client = WeatherClient(settings.openweather_api_key)


@router.get("/explain")
async def explain_pollution(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_km: int = Query(50, ge=1, le=200),
    pm25: float | None = Query(
        None,
        ge=0.0,
        le=1000.0,
        description="Override the observed concentration, e.g. a fused photo estimate",
    ),
    # Gated: every call bills a Gemini request. /stations stays public so the
    # map still renders pre-login, but this one needs an account.
    user: User = Depends(current_user),
):
    """
    Reasoned explanation of why PM2.5 is at its current level at this point.

    Gathers the same data the map uses, derives the quantities that discriminate
    between causes (spatial gradient, 24 h trajectory, upwind/downwind,
    ventilation, sensor-vs-model divergence), and asks Gemini to reason over them.

    `evidence` is returned alongside the prose so the reasoning is auditable —
    every number the explanation cites is visible here.
    """
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Explanations are unavailable: GEMINI_API_KEY is not configured.",
        )

    aq, grid_points, context, weather = await asyncio.gather(
        fetch_air_quality(latitude, longitude, radius_km),
        fetch_pm25_grid(latitude, longitude, radius_km),
        fetch_point_context(latitude, longitude),
        weather_client.get_current(latitude, longitude),
    )

    in_range = [s for s in aq.stations if s.distance_km <= radius_km]

    # Prefer the caller's fused figure when supplied, then a real monitor, then
    # the grid mean. Explaining a level nobody measured would be fiction.
    if pm25 is not None:
        observed = pm25
        basis = "caller-supplied (fused estimate)"
    else:
        sensors = [s for s in in_range if s.kind == "sensor"]
        if sensors:
            nearest = min(sensors, key=lambda s: s.distance_km)
            observed = nearest.pm25
            basis = f"nearest monitor: {nearest.name} ({nearest.distance_km:.1f} km)"
        elif grid_points:
            observed = sum(p.pm25 for p in grid_points) / len(grid_points)
            basis = "modelled grid mean (no monitor in range)"
        elif context.history:
            observed = context.history[-1]
            basis = "modelled point value"
        else:
            raise HTTPException(
                status_code=502,
                detail="No air quality data available for this location.",
            )

    evidence = build_evidence(
        lat=latitude,
        lng=longitude,
        pm25=observed,
        aqi=pm25_to_aqi(observed),
        stations=in_range,
        weather=weather,
        grid_points=grid_points,
        context=context,
    )
    evidence["reading"]["basis"] = basis

    try:
        explanation = await generate_explanation(evidence)
    except ExplainError as e:
        # 502: our request was fine, the upstream model could not answer.
        logger.warning("Explanation failed at (%s, %s): %s", latitude, longitude, e)
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "explanation": explanation,
        "evidence": evidence,
        "model": settings.gemini_model,
        "sources": [
            {"name": s.name, "status": s.status, "count": len(s.stations), "detail": s.detail}
            for s in aq.sources
        ],
    }
