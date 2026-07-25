import logging

from fastapi import APIRouter, Query

from app.services.air_quality import fetch_all_stations
from app.services.fusion import pm25_to_aqi

logger = logging.getLogger("airq.api")
router = APIRouter()


@router.get("/stations")
async def list_stations(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_km: int = Query(50, ge=1, le=200),
):
    """
    Air quality readings around a point, for plotting on the map.

    Returns physical monitors and, where none exist, modelled grid values —
    so the response is never empty for a valid coordinate.
    """
    stations = await fetch_all_stations(latitude, longitude, radius_km)

    # /feed/geo returns the nearest station on Earth, which for an unmonitored
    # region can be thousands of km away. Plotting it would draw a dot claiming
    # coverage that does not exist, so anything beyond the requested radius is
    # dropped. Model readings sit on the query point and always survive this.
    in_range = [s for s in stations if s.distance_km <= radius_km]

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
            }
            for s in in_range
        ],
    }
