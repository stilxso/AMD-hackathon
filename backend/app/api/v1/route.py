import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import current_user
from app.config import settings
from app.services.auth import User
from app.services.routing import Point, RoutingError, plan_route

logger = logging.getLogger("airq.api")
router = APIRouter()


class RouteRequest(BaseModel):
    start: Point
    end: Point
    profile: str = Field("walking", pattern="^(walking|cycling)$")
    # How much longer than the shortest route the recommendation may be. 1.0
    # disables detours entirely and returns the cleanest of the direct
    # variants; the default lets a route run half again as long when the air
    # on it is meaningfully better.
    max_detour_ratio: float = Field(1.6, ge=1.0, le=3.0)


@router.post("/route")
async def clean_air_route(
    body: RouteRequest,
    # Gated: every call spends Mapbox Directions requests, several per plan.
    user: User = Depends(current_user),
):
    """
    Routes from A to B ranked by how much PM2.5 they make you breathe.

    Returns every candidate with its own score, plus the index of the
    recommended one and of the plain shortest one, so the caller can draw both
    and show what the detour costs. Routes are real Mapbox walking or cycling
    routes; the ranking is by inhaled dose (concentration × time), not by
    concentration alone, so a longer cleaner route only wins while the extra
    minutes do not undo the cleaner air.

    `differentiated` is false when all candidates score within ~1 µg/m³ of each
    other, which is the honest answer wherever the only data is the ~11 km model
    grid: the routes are indistinguishable and the recommendation is just the
    shortest one. Check it before telling a user a detour is worth taking.
    """
    try:
        result = await plan_route(
            token=settings.mapbox_token,
            start=body.start,
            end=body.end,
            profile=body.profile,
            max_detour_ratio=body.max_detour_ratio,
        )
    except RoutingError as exc:
        # A missing token is a deployment fault (503); anything else here means
        # the request itself could not be answered (502 from upstream data).
        status = 503 if "MAPBOX_TOKEN" in str(exc) else 502
        raise HTTPException(status_code=status, detail=str(exc))

    return {
        "profile": body.profile,
        "recommendedIndex": result.recommended_index,
        "shortestIndex": result.shortest_index,
        "exposureReductionPct": result.exposure_reduction_pct,
        "extraDistanceKm": result.extra_distance_km,
        "extraMinutes": result.extra_minutes,
        "differentiated": result.differentiated,
        "sensorCount": result.sensor_count,
        "gridCellKm": result.grid_cell_km,
        "routes": [
            {
                "kind": c.kind,
                "geometry": c.geometry,
                "distanceKm": c.distance_km,
                "durationMin": c.duration_min,
                "meanPm25": c.mean_pm25,
                "maxPm25": c.max_pm25,
                "aqi": c.aqi,
                "exposure": c.exposure,
            }
            for c in result.candidates
        ],
    }
