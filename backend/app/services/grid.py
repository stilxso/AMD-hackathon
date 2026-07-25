"""
Modelled PM2.5 as a field rather than as scattered points.

The station feeds return a handful of monitors — 11 usable ones inside a 100 km
box over Almaty, and typically 0–3 elsewhere. A heatmap built from those is a
blur around dots, not a density field, and it says nothing about the space
between them.

Open-Meteo accepts many coordinates in one request, so a single call returns a
full grid of CAMS values (~11 km native resolution). That is a genuine field:
it varies across the viewport, resolves everywhere on Earth, and needs no key.
"""

import logging
import math
from typing import List, Optional

import httpx
from pydantic import BaseModel

logger = logging.getLogger("airq.services.grid")

_BASE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Open-Meteo's air-quality output lattice. Requested coordinates are snapped to
# it so each one lands on a distinct cell centre.
#
# Sampling on any other spacing aliases against this grid: an evenly-spaced 12×12
# request over a 50 km radius steps 0.112° in longitude, which skips an entire
# 0.1° column roughly every ninth step and leaves a visible stripe of missing
# data on the map. Snapping removes both that and the duplicate responses.
_MODEL_GRID_DEG = 0.1

# Coordinates per request. Every point costs ~18 characters of query string, so
# 300 keeps the URL near 5 KB — comfortably under the ~8 KB that servers and
# proxies commonly refuse. Over a viewport this is spent as roughly 20×15 cells,
# which the client interpolates into a continuous field.
_MAX_GRID_POINTS = 300


class GridPoint(BaseModel):
    lat: float
    lng: float
    pm25: float


class PointContext(BaseModel):
    """Vertical and temporal context for a single coordinate."""

    elevation_m: Optional[float] = None
    timezone: Optional[str] = None
    # Local-time hourly PM2.5 for the past 24 h, oldest first. The shape of this
    # series is what distinguishes overnight accumulation under an inversion
    # from a level that simply blew in.
    history: List[float] = []
    history_times: List[str] = []


def _axis_between(lo: float, hi: float, step: float) -> List[float]:
    """Cell centres on the model lattice covering [lo, hi]."""
    first = math.floor(lo / step)
    last = math.ceil(hi / step)
    # Rounded because 0.1 is not exactly representable: accumulating i*step
    # otherwise yields 76.30000000000001 and defeats de-duplication downstream.
    return [round(i * step, 4) for i in range(first, last + 1)]


def _axis(centre: float, half_span: float, step: float) -> List[float]:
    """Cell centres on the model lattice covering [centre-half_span, centre+half_span]."""
    return _axis_between(centre - half_span, centre + half_span, step)


def _grid_coords(lat: float, lng: float, radius_km: float, step: float = _MODEL_GRID_DEG):
    """Model-aligned lat/lng lattice covering a square around the point."""
    d_lat = radius_km / 111.0
    # Longitude degrees shrink toward the poles, so the box stays roughly square
    # in ground distance rather than in degrees.
    d_lng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))

    return [(a, b) for a in _axis(lat, d_lat, step) for b in _axis(lng, d_lng, step)]


def _bbox_coords(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
) -> tuple[List[tuple[float, float]], float]:
    """
    Model-aligned lattice covering a viewport, plus the spacing it was sampled at.

    The step is always a whole multiple of the model lattice, never an even
    division of the box: sampling on any other spacing aliases against
    Open-Meteo's own 0.1° grid, which is what left visible stripes of missing
    data. Zoomed out, a wide viewport therefore subsamples the model — coarser,
    but every returned point is still a real cell centre.
    """
    step = _MODEL_GRID_DEG
    while True:
        rows = len(_axis_between(min_lat, max_lat, step))
        cols = len(_axis_between(min_lng, max_lng, step))
        if rows * cols <= _MAX_GRID_POINTS:
            break
        # Scale by the overshoot rather than one lattice unit at a time, so a
        # whole-continent viewport converges in a couple of iterations.
        factor = math.sqrt(rows * cols / _MAX_GRID_POINTS)
        step = round(_MODEL_GRID_DEG * math.ceil(step * factor / _MODEL_GRID_DEG), 4)

    coords = [
        (a, b)
        for a in _axis_between(min_lat, max_lat, step)
        for b in _axis_between(min_lng, max_lng, step)
    ]
    return coords, step


async def fetch_pm25_grid_bbox(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
) -> tuple[List[GridPoint], float]:
    """
    PM2.5 across everything the map viewport shows, in one HTTP request.

    Returns the points and the lattice spacing they were sampled at. The
    spacing is reported rather than inferred by the caller because a subsampled
    viewport is sparser than the model's native resolution, and the client sizes
    its render to it.
    """
    coords, step = _bbox_coords(min_lat, min_lng, max_lat, max_lng)
    return await _fetch_points(coords), step


async def fetch_pm25_grid(
    lat: float,
    lng: float,
    radius_km: float = 50.0,
) -> List[GridPoint]:
    """
    PM2.5 across a square grid around the point, in one HTTP request.

    Returns [] on any failure — the map falls back to station dots alone, which
    is degraded but not broken.
    """
    return await _fetch_points(_grid_coords(lat, lng, radius_km))


async def _fetch_points(coords: List[tuple[float, float]]) -> List[GridPoint]:
    """One multi-coordinate Open-Meteo call, de-duplicated onto model cells."""
    lat_param = ",".join(f"{a:.4f}" for a, _ in coords)
    lng_param = ",".join(f"{b:.4f}" for _, b in coords)
    url = f"{_BASE_URL}?latitude={lat_param}&longitude={lng_param}&current=pm2_5"

    try:
        # Wider timeout than the single-point clients: this is one large request
        # standing in for 144, and it is the only source of the density layer.
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error("Open-Meteo grid error: %s", e)
        return []

    # A single coordinate returns an object; many return a list.
    entries = data if isinstance(data, list) else [data]

    # Open-Meteo answers with its own grid-cell centres, not the requested
    # coordinates, so several requested points snap onto one cell (24 of 144 at
    # a 50 km radius). Keeping the returned centres and de-duplicating gives one
    # feature per real cell — drawing the duplicates would stack overlapping
    # geometry and imply resolution the model does not have.
    seen = set()
    points = []
    for entry in entries:
        pm25 = (entry.get("current") or {}).get("pm2_5")
        e_lat, e_lng = entry.get("latitude"), entry.get("longitude")
        if pm25 is None or e_lat is None or e_lng is None:
            continue
        key = (round(float(e_lat), 4), round(float(e_lng), 4))
        if key in seen:
            continue
        seen.add(key)
        points.append(GridPoint(lat=float(e_lat), lng=float(e_lng), pm25=float(pm25)))

    logger.debug(
        "[GRID] %d cells from %d requested points | pm25 %.1f–%.1f µg/m³",
        len(points),
        len(coords),
        min((p.pm25 for p in points), default=0.0),
        max((p.pm25 for p in points), default=0.0),
    )
    return points


def cell_size_deg(points: List[GridPoint]) -> Optional[float]:
    """
    Edge length of one model cell, in degrees, measured from the data.

    Open-Meteo currently returns a 0.1° lattice, but measuring rather than
    hard-coding means a resolution change upstream does not silently leave the
    map drawing cells of the wrong size.
    """
    lats = sorted({round(p.lat, 4) for p in points})
    lngs = sorted({round(p.lng, 4) for p in points})

    gaps = [round(b - a, 4) for a, b in zip(lats, lats[1:])]
    gaps += [round(b - a, 4) for a, b in zip(lngs, lngs[1:])]
    gaps = [g for g in gaps if g > 0]
    if not gaps:
        return None

    # Mode, not mean: the requested box rarely aligns with the model lattice, so
    # the outermost gaps are often partial and would drag an average down.
    return max(set(gaps), key=gaps.count)


async def fetch_point_context(lat: float, lng: float) -> PointContext:
    """Elevation and the past 24 h of modelled PM2.5 at one coordinate."""
    url = (
        f"{_BASE_URL}?latitude={lat}&longitude={lng}"
        "&hourly=pm2_5&past_days=1&forecast_days=1&timezone=auto"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error("Open-Meteo context error: %s", e)
        return PointContext()

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    values = hourly.get("pm2_5") or []

    # past_days=1 with forecast_days=1 spans 48 h centred on "now"; only the
    # elapsed half is observation-grade, so the forecast tail is dropped.
    pairs = [(t, v) for t, v in zip(times, values) if v is not None][:24]

    return PointContext(
        elevation_m=data.get("elevation"),
        timezone=data.get("timezone"),
        history=[float(v) for _, v in pairs],
        history_times=[t for t, _ in pairs],
    )
