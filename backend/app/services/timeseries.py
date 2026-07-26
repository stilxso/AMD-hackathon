"""
Hourly pollutant series for one point.

The station feeds publish a single current value per monitor, so nothing in the
product could answer "was it worse this morning". Open-Meteo's air-quality
endpoint serves the same CAMS field as an hourly series with both past and
forecast hours, needs no key, and resolves everywhere — the same reasons it
backs the density grid in services/grid.py.

The values are modelled, not measured. A caller presenting them next to a
monitor reading has to say so.
"""

import logging
import math
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import httpx
from pydantic import BaseModel

logger = logging.getLogger("airq.services.timeseries")

_BASE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Pollutants requested for every series. pm2_5 is the one the product is built
# around; the rest come in the same response at no extra cost and are what let a
# station page say which pollutant is actually driving the index.
_HOURLY_VARS = ("pm2_5", "pm10", "ozone", "nitrogen_dioxide", "sulphur_dioxide", "carbon_monoxide")

# Same reasoning as the station cache: CAMS republishes hourly, and a chart is
# usually opened several times over the same point while panning around it.
_CACHE_TTL_S = 600
_CACHE_MAX = 256
_cache: Dict[str, Tuple[float, "PollutantSeries"]] = {}


class SeriesPoint(BaseModel):
    at: str
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    o3: Optional[float] = None
    no2: Optional[float] = None
    so2: Optional[float] = None
    co: Optional[float] = None


class PollutantSeries(BaseModel):
    latitude: float
    longitude: float
    source: str = "open-meteo"
    hours: List[SeriesPoint] = []


class TimeseriesError(Exception):
    """The series could not be fetched."""


def _series_key(lat: float, lng: float, past_hours: int, forecast_hours: int) -> str:
    return f"{lat:.2f}:{lng:.2f}:{past_hours}:{forecast_hours}"


async def fetch_pm25_series(
    lat: float,
    lng: float,
    past_hours: int = 24,
    forecast_hours: int = 0,
) -> PollutantSeries:
    """
    Hourly pollutants around now, oldest first.

    `past_hours` and `forecast_hours` are hours, but Open-Meteo only accepts
    whole days on either side, so the request is rounded up to cover the window
    and the response trimmed back to it.
    """
    key = _series_key(lat, lng, past_hours, forecast_hours)
    now_mono = time.monotonic()
    hit = _cache.get(key)
    if hit and now_mono - hit[0] < _CACHE_TTL_S:
        return hit[1]

    past_days = max(1, math.ceil(past_hours / 24))
    forecast_days = max(1, math.ceil(forecast_hours / 24)) if forecast_hours else 1

    params = {
        "latitude": lat,
        "longitude": lng,
        "hourly": ",".join(_HOURLY_VARS),
        "past_days": min(past_days, 7),
        "forecast_days": min(forecast_days, 5),
        "timezone": "UTC",
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(_BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("Open-Meteo series failed for %.3f,%.3f: %s", lat, lng, exc)
        if hit:
            # Same trade as the station cache: an hour-old chart beats no chart.
            logger.warning("Serving cached series for %s", key)
            return hit[1]
        raise TimeseriesError(str(exc)[:120])

    hourly = data.get("hourly") or {}
    stamps = hourly.get("time") or []
    if not stamps:
        raise TimeseriesError("upstream returned no hourly data")

    columns = {
        "pm25": hourly.get("pm2_5") or [],
        "pm10": hourly.get("pm10") or [],
        "o3": hourly.get("ozone") or [],
        "no2": hourly.get("nitrogen_dioxide") or [],
        "so2": hourly.get("sulphur_dioxide") or [],
        "co": hourly.get("carbon_monoxide") or [],
    }

    now = datetime.now(timezone.utc)
    lower = now.timestamp() - past_hours * 3600
    upper = now.timestamp() + forecast_hours * 3600

    points: List[SeriesPoint] = []
    for i, stamp in enumerate(stamps):
        try:
            ts = datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            continue
        if ts < lower or ts > upper:
            continue

        values = {k: (col[i] if i < len(col) else None) for k, col in columns.items()}
        # An all-null hour carries nothing and would draw a gap in the chart
        # indistinguishable from clean air.
        if all(v is None for v in values.values()):
            continue

        points.append(SeriesPoint(
            at=datetime.fromtimestamp(ts, timezone.utc).isoformat(),
            **{k: (round(float(v), 1) if v is not None else None) for k, v in values.items()},
        ))

    series = PollutantSeries(latitude=lat, longitude=lng, hours=points)

    if len(_cache) >= _CACHE_MAX:
        cutoff = now_mono - 2 * _CACHE_TTL_S
        for k in [k for k, (ts, _) in _cache.items() if ts < cutoff]:
            del _cache[k]
    _cache[key] = (now_mono, series)

    return series
