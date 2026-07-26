import asyncio
import logging
import math
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.services.air_quality import (
    AirQualityUnavailable,
    WaqiClient,
    fetch_air_quality,
)
from app.services.fusion import pm25_to_aqi
from app.services.grid import cell_size_deg, fetch_pm25_grid, fetch_pm25_grid_bbox
from app.services.timeseries import TimeseriesError, fetch_pm25_series

logger = logging.getLogger("airq.api")
router = APIRouter()


# Deliberately unauthenticated. Everything here is public environmental data
# proxied from open feeds (WAQI, Open-Meteo), and the map renders on the landing
# page before any login exists — gating it made the map silently empty, since
# the client has no way to obtain a token. /analyze stays behind current_user.
# Radius covering a viewport, measured corner-to-centre so the station query
# reaches everything the user can see rather than only an inscribed circle.
_MAX_RADIUS_KM = 200


def _bbox_radius_km(min_lat: float, min_lng: float, max_lat: float, max_lng: float) -> int:
    d_lat_km = (max_lat - min_lat) / 2 * 111.0
    mid_lat = (max_lat + min_lat) / 2
    d_lng_km = (max_lng - min_lng) / 2 * 111.0 * math.cos(math.radians(mid_lat))
    radius = math.hypot(d_lat_km, d_lng_km)
    return max(1, min(_MAX_RADIUS_KM, math.ceil(radius)))


@router.get("/stations")
async def list_stations(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_km: int = Query(50, ge=1, le=200),
    grid: bool = Query(True, description="Include the modelled PM2.5 density field"),
    min_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    min_lng: Optional[float] = Query(None, ge=-180.0, le=180.0),
    max_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    max_lng: Optional[float] = Query(None, ge=-180.0, le=180.0),
):
    """
    Air quality over the map, for plotting.

    Three parts come back:

    - `stations`: point readings — physical monitors plus the single-point model
      values, each with an AQI, for dots and popups.
    - `grid`: modelled PM2.5 sampled on a lattice. This is what a density layer
      needs; the monitor network is far too sparse to interpolate, and both
      model sources report only at the query coordinate, so without this there
      is nothing to draw between the dots.
    - `sources`: each upstream's outcome, so the UI can tell "no monitors here"
      apart from "this API key is dead".

    Pass the four bbox parameters to cover a viewport. Without them the query
    falls back to a `radius_km` box around the point, which covers only a patch
    of whatever the user is actually looking at — the map then went bare as soon
    as it was panned or zoomed out.
    """
    bbox = (min_lat, min_lng, max_lat, max_lng)
    if any(v is not None for v in bbox):
        if any(v is None for v in bbox):
            raise HTTPException(
                status_code=400,
                detail="min_lat, min_lng, max_lat and max_lng must be given together",
            )
        if min_lat >= max_lat or min_lng >= max_lng:
            raise HTTPException(status_code=400, detail="Empty or inverted bounding box")
        radius_km = _bbox_radius_km(min_lat, min_lng, max_lat, max_lng)

    use_bbox = all(v is not None for v in bbox)

    aq_task = asyncio.create_task(fetch_air_quality(latitude, longitude, radius_km))
    grid_task = None
    if grid:
        grid_task = asyncio.create_task(
            fetch_pm25_grid_bbox(min_lat, min_lng, max_lat, max_lng)
            if use_bbox
            else fetch_pm25_grid(latitude, longitude, radius_km)
        )

    aq = await aq_task
    grid_result = await grid_task if grid_task else None
    # The bbox path reports the spacing it sampled at; the radius path always
    # samples the native lattice, so its spacing is measured from the response.
    if use_bbox and grid_result is not None:
        grid_points, sampled_step = grid_result
    else:
        grid_points, sampled_step = (grid_result or []), None

    # /feed/geo returns the nearest station on Earth, which for an unmonitored
    # region can be thousands of km away. Plotting it would draw a dot claiming
    # coverage that does not exist, so anything beyond the requested radius is
    # dropped. Model readings sit on the query point and always survive this.
    in_range = [s for s in aq.stations if s.distance_km <= radius_km]

    return {
        "count": len(in_range),
        "stations": [
            {
                "lat": s.lat,
                "lng": s.lng,
                "pm25": round(s.pm25, 1),
                "aqi": pm25_to_aqi(s.pm25),
                "distanceKm": round(s.distance_km, 1),
                "name": s.name,
                "source": s.source,
                "kind": s.kind,
                "uid": s.uid,
            }
            for s in in_range
        ],
        "grid": [
            {
                "lat": p.lat,
                "lng": p.lng,
                "pm25": round(p.pm25, 1),
                "aqi": pm25_to_aqi(p.pm25),
            }
            for p in grid_points
        ],
        # Spacing between grid samples, in degrees. The client renders the field
        # at this resolution, so the map never implies detail the sampling does
        # not have.
        "gridCellDeg": sampled_step if sampled_step is not None else cell_size_deg(grid_points),
        "radiusKm": radius_km,
        "sources": [
            {
                "name": s.name,
                "status": s.status,
                "count": len(s.stations),
                "detail": s.detail,
            }
            for s in aq.sources
        ],
    }


# The lookup endpoints below stay unauthenticated for the same reason /stations
# is: they proxy public environmental feeds and the map uses them before a login
# exists.


@router.get("/stations/search")
async def search_stations(
    q: str = Query(..., min_length=2, max_length=64, description="City or station name"),
    limit: int = Query(20, ge=1, le=50),
):
    """
    Find monitors by place name.

    Everything else in the API answers "what is near this coordinate", which
    cannot serve a user asking about a city they are not in.
    """
    try:
        results = await WaqiClient(settings.waqi_api_token).search(q, limit)
    except AirQualityUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("Station search failed for %r: %s", q, exc)
        raise HTTPException(status_code=502, detail="Station search is unavailable")

    return {"query": q, "count": len(results), "results": results}


@router.get("/stations/detail")
async def station_detail(uid: str = Query(..., min_length=1, max_length=32)):
    """
    One monitor's full record — every pollutant it publishes, its own weather
    readings, attribution and WAQI's daily forecast.

    `uid` comes from the `uid` field on a station in /stations.
    """
    try:
        return await WaqiClient(settings.waqi_api_token).get_by_uid(uid)
    except AirQualityUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("Station detail failed for uid=%r: %s", uid, exc)
        raise HTTPException(status_code=502, detail="Station detail is unavailable")


@router.get("/stations/history")
async def station_history(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    hours: int = Query(24, ge=1, le=168, description="Hours of history to return"),
    forecast_hours: int = Query(0, ge=0, le=96),
):
    """
    Hourly pollutant concentrations at a point, oldest first, with an optional
    forecast tail.

    The values are modelled (CAMS via Open-Meteo), not measured at a monitor —
    the station feeds publish only a current value, so a measured series is not
    available. Present it as a model estimate.
    """
    try:
        series = await fetch_pm25_series(latitude, longitude, hours, forecast_hours)
    except TimeseriesError as exc:
        raise HTTPException(status_code=502, detail=f"History is unavailable: {exc}")

    hours_out = [
        {**p.model_dump(), "aqi": pm25_to_aqi(p.pm25) if p.pm25 is not None else None}
        for p in series.hours
    ]
    values = [p.pm25 for p in series.hours if p.pm25 is not None]

    return {
        "latitude": series.latitude,
        "longitude": series.longitude,
        "source": series.source,
        "kind": "model",
        "count": len(hours_out),
        "hours": hours_out,
        "summary": {
            "meanPm25": round(sum(values) / len(values), 1) if values else None,
            "maxPm25": max(values) if values else None,
            "minPm25": min(values) if values else None,
            "meanAqi": pm25_to_aqi(sum(values) / len(values)) if values else None,
        },
    }


@router.get("/stations/ranking")
async def station_ranking(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_km: int = Query(50, ge=1, le=200),
    order: str = Query("worst", pattern="^(worst|best|nearest)$"),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Nearby monitors ranked by how dirty the air at them is.

    /stations returns everything in view unordered by severity, which leaves the
    client to answer "where is the worst air around me" itself. Only physical
    sensors are ranked — the model sources all sit on the query coordinate, so
    including them would rank the same point against itself.
    """
    aq = await fetch_air_quality(latitude, longitude, radius_km)
    sensors = [s for s in aq.stations if s.kind == "sensor" and s.distance_km <= radius_km]

    if order == "worst":
        sensors.sort(key=lambda s: s.pm25, reverse=True)
    elif order == "best":
        sensors.sort(key=lambda s: s.pm25)
    else:
        sensors.sort(key=lambda s: s.distance_km)

    return {
        "order": order,
        "radiusKm": radius_km,
        "count": len(sensors),
        "stations": [
            {
                "lat": s.lat,
                "lng": s.lng,
                "pm25": round(s.pm25, 1),
                "aqi": pm25_to_aqi(s.pm25),
                "distanceKm": round(s.distance_km, 1),
                "name": s.name,
                "source": s.source,
                "uid": s.uid,
            }
            for s in sensors[:limit]
        ],
    }
