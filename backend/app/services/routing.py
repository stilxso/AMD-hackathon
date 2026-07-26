"""
Clean-air route planning between two points.

The shortest way from A to B is not the one a runner or an asthmatic should
take: a route along an arterial road can sit in twice the PM2.5 of a parallel
street two blocks away, and the difference compounds because exposure is a
*dose* — concentration multiplied by the time spent breathing it hard.

So this module does not invent its own geometry. It asks Mapbox Directions for
several real, walkable/cyclable routes between the same two points — the direct
one plus detours bowed out through offset via-points — then scores each against
the same PM2.5 data the map already shows, and ranks them by inhaled dose
subject to a cap on how much longer the detour may be.

What the scoring can and cannot see is worth stating plainly: the modelled field
is Open-Meteo CAMS at ~11 km, which is coarser than any city route, so on its
own every candidate scores nearly the same. The variation that makes one street
better than another comes from physical monitors, and those exist in useful
density only in monitored cities. `differentiated` in the result says which case
the caller is in, so a UI never presents a coin-flip as advice.
"""

import asyncio
import logging
import math
from typing import List, Optional, Sequence, Tuple

import httpx
from pydantic import BaseModel

from app.services.air_quality import fetch_air_quality
from app.services.fusion import pm25_to_aqi
from app.services.grid import GridPoint, fetch_pm25_grid_bbox
from app.services.schemas import StationData

logger = logging.getLogger("airq.services.routing")

_DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox"

# Profiles Mapbox offers that make sense for a person out in the air.
PROFILES = ("walking", "cycling")

# Perpendicular offsets for the detour via-points, as fractions of the
# straight-line A→B distance. Two magnitudes on each side: a small bow that
# usually stays on parallel streets, and a wider one that can reach a park or a
# river path. Larger than ~0.5 the detour is nearly always rejected by the
# distance cap anyway, so generating it only costs a request.
_DETOUR_OFFSETS = (0.18, 0.42)

# Spacing between exposure samples along a route, and the ceiling on how many a
# single route may take. 150 m is well below the scale on which the field
# varies; the cap keeps a 40 km cycle route from sampling ten thousand points
# against every grid cell.
_SAMPLE_SPACING_M = 150.0
_MAX_SAMPLES = 400

# Physical monitors inform the field out to this range, with their influence
# decaying at the e-folding distance below. Both are urban-scale numbers: a
# monitor 1 km away says a great deal about the air on this street, one 20 km
# away says almost nothing that the model does not already say better.
_SENSOR_MAX_KM = 25.0
_SENSOR_DECORRELATION_KM = 5.0
_IDW_POWER = 2.0
_IDW_MIN_KM = 0.05

# Padding around the routes' bounding box when fetching the field, so samples
# near the ends still have grid cells on every side to interpolate between.
_FIELD_PAD_KM = 12.0

# Below this spread in mean PM2.5 between the best and worst candidate, the
# routes are not meaningfully distinguishable and the result says so.
_DIFFERENTIATION_THRESHOLD = 1.0


class RoutingError(RuntimeError):
    """Upstream routing failed or returned nothing usable."""


class Point(BaseModel):
    lat: float
    lng: float


class RouteCandidate(BaseModel):
    """One real route with its air-quality score."""

    # "direct" is what a normal navigation app returns; "alternative" is
    # Mapbox's own variant; "detour" was requested through an offset via-point.
    kind: str
    geometry: List[List[float]]  # [lng, lat] pairs, GeoJSON order
    distance_km: float
    duration_min: float
    mean_pm25: float
    max_pm25: float
    aqi: int
    # Concentration integrated over time on the route, µg·min/m³. This is the
    # quantity that matters to a pair of lungs, and the one routes are ranked
    # by — a longer route through cleaner air can still win, but only until the
    # extra minutes outweigh the lower concentration.
    exposure: float


class RouteResult(BaseModel):
    candidates: List[RouteCandidate]
    recommended_index: int
    shortest_index: int
    exposure_reduction_pct: float
    extra_distance_km: float
    extra_minutes: float
    # How well the underlying data can tell these routes apart.
    differentiated: bool
    sensor_count: int
    grid_cell_km: Optional[float]


# ─── Geometry ────────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _km_per_deg_lng(lat: float) -> float:
    """Longitude degrees shrink toward the poles; offsets have to account for it."""
    return 111.0 * max(math.cos(math.radians(lat)), 0.01)


def _via_points(start: Point, end: Point) -> List[Point]:
    """
    Via-points that bow a route out to either side of the straight line.

    Each sits on the perpendicular bisector of A→B, at a distance proportional
    to how far apart A and B are — a detour scaled to the trip rather than a
    fixed number of metres that would be a rounding error on a 10 km run and a
    different neighbourhood on a 400 m walk.
    """
    mid_lat = (start.lat + end.lat) / 2
    mid_lng = (start.lng + end.lng) / 2

    # Direction A→B in kilometres, so the perpendicular is a true right angle on
    # the ground rather than in degree space.
    kx = _km_per_deg_lng(mid_lat)
    dx = (end.lng - start.lng) * kx
    dy = (end.lat - start.lat) * 111.0
    length = math.hypot(dx, dy)
    if length < 1e-6:
        return []

    # Unit perpendicular, in km.
    px, py = -dy / length, dx / length

    points = []
    for frac in _DETOUR_OFFSETS:
        for sign in (1.0, -1.0):
            off = length * frac * sign
            points.append(
                Point(
                    lat=mid_lat + (py * off) / 111.0,
                    lng=mid_lng + (px * off) / kx,
                )
            )
    return points


def _sample_route(geometry: Sequence[Sequence[float]]) -> List[Tuple[float, float, float]]:
    """
    Resample a route into (lat, lng, weight_km) points at roughly even spacing.

    The weight is the length of track each sample stands for, which is what
    makes the mean a length-weighted average of the route rather than an average
    of Mapbox's vertices — those cluster at corners and would over-weight
    junctions, exactly where a road-side route is dirtiest.
    """
    total_km = sum(
        _haversine_km(a[1], a[0], b[1], b[0])
        for a, b in zip(geometry, geometry[1:])
    )
    if total_km <= 0:
        return []

    spacing_km = max(_SAMPLE_SPACING_M / 1000.0, total_km / _MAX_SAMPLES)

    samples: List[Tuple[float, float, float]] = []
    for a, b in zip(geometry, geometry[1:]):
        seg_km = _haversine_km(a[1], a[0], b[1], b[0])
        if seg_km <= 0:
            continue
        steps = max(1, math.ceil(seg_km / spacing_km))
        step_km = seg_km / steps
        for i in range(steps):
            # Midpoint of each sub-segment, linear in lat/lng — over ≤150 m the
            # difference from a great-circle interpolation is centimetres.
            t = (i + 0.5) / steps
            samples.append(
                (
                    a[1] + (b[1] - a[1]) * t,
                    a[0] + (b[0] - a[0]) * t,
                    step_km,
                )
            )
    return samples


# ─── Exposure field ──────────────────────────────────────────────────────────

class ExposureField:
    """
    PM2.5 as a function of position, from monitors over a modelled background.

    The model grid resolves everywhere but cannot see a single street; the
    monitors see the street but exist only where someone installed one. So the
    grid provides the background and monitors pull it locally, with an influence
    that decays over a few kilometres. Where no monitor is near, the answer is
    simply the model — correct, just uniform.
    """

    def __init__(self, grid: List[GridPoint], sensors: List[StationData]):
        self.grid = grid
        self.sensors = sensors

    @property
    def usable(self) -> bool:
        return bool(self.grid or self.sensors)

    def pm25_at(self, lat: float, lng: float) -> Optional[float]:
        background = self._grid_value(lat, lng)
        local, nearest_km = self._sensor_value(lat, lng)

        if local is None:
            return background
        if background is None:
            return local

        w = math.exp(-nearest_km / _SENSOR_DECORRELATION_KM)
        return local * w + background * (1.0 - w)

    def _grid_value(self, lat: float, lng: float) -> Optional[float]:
        if not self.grid:
            return None
        # Four nearest cells, inverse-distance weighted: enough to make the
        # field continuous across cell boundaries without a route picking up a
        # step change every 11 km.
        nearest = sorted(
            ((_haversine_km(lat, lng, p.lat, p.lng), p.pm25) for p in self.grid),
            key=lambda t: t[0],
        )[:4]
        return _idw([(d, v) for d, v in nearest])

    def _sensor_value(self, lat: float, lng: float) -> Tuple[Optional[float], float]:
        in_range = [
            (_haversine_km(lat, lng, s.lat, s.lng), s.pm25)
            for s in self.sensors
        ]
        in_range = [(d, v) for d, v in in_range if d <= _SENSOR_MAX_KM]
        if not in_range:
            return None, math.inf
        return _idw(in_range), min(d for d, _ in in_range)


def _idw(pairs: Sequence[Tuple[float, float]]) -> Optional[float]:
    """Inverse-distance weighting over (distance_km, value) pairs."""
    num = den = 0.0
    for d, v in pairs:
        w = 1.0 / (max(d, _IDW_MIN_KM) ** _IDW_POWER)
        num += v * w
        den += w
    return num / den if den else None


# ─── Mapbox Directions ───────────────────────────────────────────────────────

async def _directions(
    client: httpx.AsyncClient,
    token: str,
    profile: str,
    coords: Sequence[Point],
    alternatives: bool,
) -> List[dict]:
    """One Directions call. Returns [] rather than raising on a failed variant."""
    path = ";".join(f"{p.lng:.6f},{p.lat:.6f}" for p in coords)
    params = {
        "geometries": "geojson",
        "overview": "full",
        "alternatives": "true" if alternatives else "false",
        "access_token": token,
    }
    try:
        resp = await client.get(f"{_DIRECTIONS_URL}/{profile}/{path}", params=params)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as e:
        # 401/403 is a configuration fault and worth surfacing; anything else
        # only costs this one candidate.
        if e.response.status_code in (401, 403):
            raise RoutingError("Mapbox rejected the configured token") from e
        logger.warning("Directions request failed (%s)", e)
        return []
    except Exception as e:
        logger.warning("Directions request failed: %s", e)
        return []

    if data.get("code") != "Ok":
        logger.debug("Directions returned %s", data.get("code"))
        return []
    return data.get("routes") or []


async def _fetch_candidates(
    token: str, profile: str, start: Point, end: Point
) -> List[Tuple[str, dict]]:
    """
    Every route worth scoring, fetched concurrently.

    Mapbox returns alternatives only when it happens to find genuinely distinct
    ones, and on short urban trips it usually finds none — which is why the
    detour requests exist. They force a spread of options through different
    parts of the city, and the distance cap in the ranking throws away the ones
    that overshoot.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        direct_task = _directions(client, token, profile, [start, end], alternatives=True)
        detour_tasks = [
            _directions(client, token, profile, [start, via, end], alternatives=False)
            for via in _via_points(start, end)
        ]
        direct, *detours = await asyncio.gather(direct_task, *detour_tasks)

    if not direct and not any(detours):
        raise RoutingError("No route found between these points")

    labelled: List[Tuple[str, dict]] = []
    for i, r in enumerate(direct):
        labelled.append(("direct" if i == 0 else "alternative", r))
    for routes in detours:
        for r in routes:
            labelled.append(("detour", r))

    # De-duplicate: a detour whose via-point sat on the direct line comes back
    # as the direct route, and scoring the same track four times would let it
    # dominate the candidate list.
    seen = set()
    unique = []
    for kind, r in labelled:
        key = (round(r.get("distance", 0.0)), round(r.get("duration", 0.0)))
        if key in seen:
            continue
        seen.add(key)
        unique.append((kind, r))
    return unique


# ─── Field fetch ─────────────────────────────────────────────────────────────

def _bounds(candidates: Sequence[Tuple[str, dict]]) -> Tuple[float, float, float, float]:
    lats, lngs = [], []
    for _, r in candidates:
        for lng, lat in r["geometry"]["coordinates"]:
            lats.append(lat)
            lngs.append(lng)
    pad_lat = _FIELD_PAD_KM / 111.0
    mid_lat = (min(lats) + max(lats)) / 2
    pad_lng = _FIELD_PAD_KM / _km_per_deg_lng(mid_lat)
    return (
        min(lats) - pad_lat,
        min(lngs) - pad_lng,
        max(lats) + pad_lat,
        max(lngs) + pad_lng,
    )


async def _fetch_field(
    bounds: Tuple[float, float, float, float]
) -> Tuple[ExposureField, Optional[float]]:
    min_lat, min_lng, max_lat, max_lng = bounds
    centre_lat = (min_lat + max_lat) / 2
    centre_lng = (min_lng + max_lng) / 2
    radius_km = max(
        1,
        min(
            200,
            math.ceil(
                math.hypot(
                    (max_lat - min_lat) / 2 * 111.0,
                    (max_lng - min_lng) / 2 * _km_per_deg_lng(centre_lat),
                )
            ),
        ),
    )

    grid_result, aq = await asyncio.gather(
        fetch_pm25_grid_bbox(min_lat, min_lng, max_lat, max_lng),
        fetch_air_quality(centre_lat, centre_lng, radius_km),
    )
    grid, step_deg = grid_result

    # Only physical monitors pull the field. The model entries in `stations` are
    # the same CAMS data as the grid, reported at the query coordinate — feeding
    # them in would put a zero-distance point at the map centre and drag every
    # route's score toward it.
    sensors = [s for s in aq.stations if s.kind == "sensor" and s.distance_km <= radius_km]

    grid_cell_km = step_deg * 111.0 if step_deg else None
    return ExposureField(grid, sensors), grid_cell_km


# ─── Scoring and ranking ─────────────────────────────────────────────────────

def _score(kind: str, route: dict, field: ExposureField) -> Optional[RouteCandidate]:
    geometry = route["geometry"]["coordinates"]
    samples = _sample_route(geometry)
    if not samples:
        return None

    total_w = 0.0
    weighted = 0.0
    peak = 0.0
    for lat, lng, w in samples:
        pm = field.pm25_at(lat, lng)
        if pm is None:
            continue
        weighted += pm * w
        total_w += w
        peak = max(peak, pm)

    if total_w <= 0:
        return None

    mean_pm25 = weighted / total_w
    duration_min = route["duration"] / 60.0

    return RouteCandidate(
        kind=kind,
        geometry=geometry,
        distance_km=round(route["distance"] / 1000.0, 3),
        duration_min=round(duration_min, 1),
        mean_pm25=round(mean_pm25, 1),
        max_pm25=round(peak, 1),
        aqi=pm25_to_aqi(mean_pm25),
        exposure=round(mean_pm25 * duration_min, 1),
    )


def _rank(candidates: List[RouteCandidate], max_detour_ratio: float) -> Tuple[int, int]:
    """Indices of (recommended, shortest)."""
    shortest = min(range(len(candidates)), key=lambda i: candidates[i].distance_km)
    limit = candidates[shortest].distance_km * max_detour_ratio

    eligible = [i for i in range(len(candidates)) if candidates[i].distance_km <= limit]
    # Ties on exposure break toward the shorter route: when the air is the same
    # either way there is no reason to send anyone the long way round.
    recommended = min(eligible, key=lambda i: (candidates[i].exposure, candidates[i].distance_km))
    return recommended, shortest


async def plan_route(
    token: str,
    start: Point,
    end: Point,
    profile: str = "walking",
    max_detour_ratio: float = 1.6,
) -> RouteResult:
    """
    Rank real routes from A to B by how much PM2.5 they make you breathe.

    Raises RoutingError when no route exists, the token is refused, or no air
    quality data could be attached — a route with no score is worse than none,
    because it looks like advice.
    """
    if not token:
        raise RoutingError("MAPBOX_TOKEN is not configured")
    if profile not in PROFILES:
        raise RoutingError(f"Unsupported profile: {profile}")

    raw = await _fetch_candidates(token, profile, start, end)
    field, grid_cell_km = await _fetch_field(_bounds(raw))
    if not field.usable:
        raise RoutingError("No air quality data available for this area")

    scored = [c for c in (_score(kind, r, field) for kind, r in raw) if c is not None]
    if not scored:
        raise RoutingError("Routes could not be scored against air quality data")

    recommended, shortest = _rank(scored, max_detour_ratio)
    best, base = scored[recommended], scored[shortest]

    spread = max(c.mean_pm25 for c in scored) - min(c.mean_pm25 for c in scored)

    logger.info(
        "[ROUTE] %d candidates | recommended %.2f km @ %.1f µg/m³ vs shortest "
        "%.2f km @ %.1f µg/m³ | %d sensors | spread %.1f",
        len(scored), best.distance_km, best.mean_pm25,
        base.distance_km, base.mean_pm25, len(field.sensors), spread,
    )

    return RouteResult(
        candidates=scored,
        recommended_index=recommended,
        shortest_index=shortest,
        exposure_reduction_pct=(
            round((base.exposure - best.exposure) / base.exposure * 100, 1)
            if base.exposure > 0
            else 0.0
        ),
        extra_distance_km=round(best.distance_km - base.distance_km, 3),
        extra_minutes=round(best.duration_min - base.duration_min, 1),
        differentiated=spread >= _DIFFERENTIATION_THRESHOLD,
        sensor_count=len(field.sensors),
        grid_cell_km=round(grid_cell_km, 1) if grid_cell_km else None,
    )
