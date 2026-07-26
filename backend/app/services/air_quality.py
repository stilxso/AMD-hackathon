import asyncio
import math
import logging
import time
import httpx
from dataclasses import dataclass, field, replace
from typing import Awaitable, Callable, Dict, List, Literal, Optional, Tuple
from .schemas import StationData
from .fusion import aqi_to_pm25
from app.config import settings

logger = logging.getLogger("airq.services.aq")

# "disabled" means no credential was configured, "unauthorized" means the
# credential was rejected. Collapsing both to an empty list is what let a dead
# OpenAQ key look identical to a region with no monitors.
SourceStatus = Literal["ok", "empty", "disabled", "unauthorized", "error"]


class AirQualityUnavailable(Exception):
    """
    An upstream could not answer a single-station lookup.

    The fan-out fetchers degrade instead of raising — a dead source there just
    means fewer dots. The lookup endpoints have no other source to fall back on,
    so they surface the failure to the caller.
    """


@dataclass
class SourceResult:
    """One upstream's outcome, so the caller can report why data is missing."""

    name: str
    status: SourceStatus
    stations: List[StationData] = field(default_factory=list)
    detail: Optional[str] = None


@dataclass
class AirQualityResult:
    stations: List[StationData]
    sources: List[SourceResult]


def _classify_http_error(name: str, exc: Exception) -> SourceResult:
    """Map a request failure onto a status the UI can explain to the user."""
    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (401, 403):
        logger.error("%s rejected the configured credential (HTTP %s)", name, exc.response.status_code)
        return SourceResult(name=name, status="unauthorized", detail="API key rejected")
    logger.error("%s API error: %s", name, exc)
    return SourceResult(name=name, status="error", detail=str(exc)[:120])

def _classify_waqi_body(name: str, data: dict) -> SourceResult:
    """
    WAQI reports failures in the body with HTTP 200, so they need their own
    triage. The status field is "nope" for a refused lookup, not "error".
    """
    detail = str(data.get("data") or data.get("status"))[:120]
    low = detail.lower()

    if "token" in low or "key" in low:
        logger.error("WAQI rejected the token: %s", detail)
        return SourceResult(name=name, status="unauthorized", detail=detail)

    # "can not connect" is the geo feed saying it cannot resolve a station for
    # this point. It is stable for a given area rather than transient, and
    # /map/bounds still covers the same box, so this is a gap in one feed and
    # not a fault worth alarming the user about.
    if "can not connect" in low or "unknown station" in low:
        logger.info("%s has no feed for this point: %s", name, detail)
        return SourceResult(name=name, status="empty", detail="no WAQI feed for this point")

    logger.warning("WAQI %s returned status %s: %s", name, data.get("status"), detail)
    return SourceResult(name=name, status="error", detail=detail)


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points."""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

class WaqiClient:
    def __init__(self, token: str):
        self.token = token
        self.base_url = "https://api.waqi.info"

    async def get_nearest(self, lat: float, lng: float) -> SourceResult:
        name_ = "waqi-nearest"
        if not self.token:
            return SourceResult(name=name_, status="disabled", detail="WAQI_API_TOKEN not set")

        url = f"{self.base_url}/feed/geo:{lat};{lng}/?token={self.token}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                # WAQI signals a bad token in the body, not the HTTP status.
                if data.get("status") != "ok":
                    return _classify_waqi_body(name_, data)

                d = data.get("data", {})

                # Extract PM2.5 (might not be available at all stations)
                iaqi = d.get("iaqi", {})
                pm25_data = iaqi.get("pm25")
                if not pm25_data:
                    return SourceResult(name=name_, status="empty", detail="station reports no PM2.5")

                pm25_val = float(pm25_data.get("v", 0))

                city = d.get("city", {})
                geo = city.get("geo", [0, 0])
                if len(geo) != 2:
                    return SourceResult(name=name_, status="empty", detail="no station coordinates")

                st_lat, st_lng = float(geo[0]), float(geo[1])
                name = city.get("name", "Unknown Station")

                dist = haversine(lat, lng, st_lat, st_lng)

                idx = d.get("idx")
                return SourceResult(name=name_, status="ok", stations=[StationData(
                    lat=st_lat,
                    lng=st_lng,
                    pm25=pm25_val,
                    distance_km=dist,
                    name=name,
                    source="waqi",
                    uid=str(idx) if idx is not None else None,
                )])
        except Exception as e:
            return _classify_http_error(name_, e)

    async def get_in_bounds(self, lat: float, lng: float, radius_km: int = 50) -> SourceResult:
        """
        Every WAQI station inside a bounding box around the point.

        /feed/geo returns exactly one station; this returns the whole local
        network, which is where most of the added coverage comes from. The
        trade-off is that the bounds feed publishes only a composite AQI per
        station, so concentrations here are reconstructed via aqi_to_pm25.
        """
        name_ = "waqi-bounds"
        if not self.token:
            return SourceResult(name=name_, status="disabled", detail="WAQI_API_TOKEN not set")

        # Degrees per km: latitude is constant, longitude shrinks toward the poles.
        d_lat = radius_km / 111.0
        d_lng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
        latlng = f"{lat - d_lat},{lng - d_lng},{lat + d_lat},{lng + d_lng}"
        url = f"{self.base_url}/map/bounds/?latlng={latlng}&networks=all&token={self.token}"

        stations = []
        offline = 0
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                if data.get("status") != "ok":
                    return _classify_waqi_body(name_, data)

                for r in data.get("data", []):
                    # Offline stations report "-" instead of a number.
                    try:
                        aqi_val = float(r.get("aqi"))
                    except (TypeError, ValueError):
                        offline += 1
                        continue

                    st_lat, st_lng = r.get("lat"), r.get("lon")
                    if st_lat is None or st_lng is None:
                        continue

                    st_lat, st_lng = float(st_lat), float(st_lng)
                    name = r.get("station", {}).get("name", "Unknown Station")

                    uid = r.get("uid")
                    stations.append(StationData(
                        lat=st_lat,
                        lng=st_lng,
                        pm25=aqi_to_pm25(aqi_val),
                        distance_km=haversine(lat, lng, st_lat, st_lng),
                        name=name,
                        source="waqi",
                        uid=str(uid) if uid is not None else None,
                    ))
        except Exception as e:
            return _classify_http_error(name_, e)

        # Roughly a third of the stations WAQI lists here report "-". Surfacing
        # the count explains a thin map in a city that looks well covered.
        detail = f"{offline} station(s) offline" if offline else None
        return SourceResult(
            name=name_,
            status="ok" if stations else "empty",
            stations=stations,
            detail=detail,
        )

    async def search(self, keyword: str, limit: int = 20) -> List[dict]:
        """
        Stations matching a free-text place name.

        The map only ever answers "what is near this point"; this is what lets a
        user look up a city they are not standing in. Returns raw-ish dicts
        rather than StationData because there is no query point to measure a
        distance from.
        """
        if not self.token:
            raise AirQualityUnavailable("WAQI_API_TOKEN is not configured")

        url = f"{self.base_url}/search/"
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url, params={"keyword": keyword, "token": self.token})
            resp.raise_for_status()
            data = resp.json()

        if data.get("status") != "ok":
            raise AirQualityUnavailable(str(data.get("data") or data.get("status"))[:120])

        out: List[dict] = []
        for r in data.get("data", [])[:limit]:
            station = r.get("station", {})
            geo = station.get("geo") or []
            try:
                aqi_val = float(r.get("aqi"))
            except (TypeError, ValueError):
                # Offline stations report "-"; they are still worth listing so a
                # search for a city does not look like the city is unmonitored.
                aqi_val = None

            out.append({
                "uid": str(r.get("uid")),
                "name": station.get("name", "Unknown Station"),
                "country": station.get("country"),
                "lat": float(geo[0]) if len(geo) == 2 else None,
                "lng": float(geo[1]) if len(geo) == 2 else None,
                "aqi": int(aqi_val) if aqi_val is not None else None,
                "pm25": round(aqi_to_pm25(aqi_val), 1) if aqi_val is not None else None,
                # The search feed puts the timestamp on the result, not on the
                # nested station object the way /feed does.
                "updatedAt": (r.get("time") or {}).get("stime"),
            })
        return out

    async def get_by_uid(self, uid: str) -> dict:
        """
        One station's full record: every pollutant it publishes, its weather
        readings and WAQI's own forecast series.

        /stations returns a single fused PM2.5 per dot. This is what a station
        popup needs to say what else that monitor measures.
        """
        if not self.token:
            raise AirQualityUnavailable("WAQI_API_TOKEN is not configured")

        url = f"{self.base_url}/feed/@{uid}/"
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url, params={"token": self.token})
            resp.raise_for_status()
            data = resp.json()

        if data.get("status") != "ok":
            raise AirQualityUnavailable(str(data.get("data") or data.get("status"))[:120])

        d = data.get("data", {})
        city = d.get("city", {})
        geo = city.get("geo") or []
        iaqi = d.get("iaqi", {})

        def _value(key: str) -> Optional[float]:
            entry = iaqi.get(key)
            if not isinstance(entry, dict) or "v" not in entry:
                return None
            try:
                return float(entry["v"])
            except (TypeError, ValueError):
                return None

        # iaqi values are sub-indices, not concentrations — except for the
        # meteorological keys, which are the raw measurements. Keeping the two
        # groups apart stops a temperature being read as an AQI.
        pollutant_keys = ("pm25", "pm10", "o3", "no2", "so2", "co")
        weather_keys = {"t": "temperature", "h": "humidity", "w": "windSpeed", "p": "pressure"}

        try:
            overall_aqi = int(float(d.get("aqi")))
        except (TypeError, ValueError):
            overall_aqi = None

        pm25_index = _value("pm25")
        return {
            "uid": str(d.get("idx", uid)),
            "name": city.get("name", "Unknown Station"),
            "url": city.get("url"),
            "lat": float(geo[0]) if len(geo) == 2 else None,
            "lng": float(geo[1]) if len(geo) == 2 else None,
            "aqi": overall_aqi,
            "pm25": round(aqi_to_pm25(pm25_index), 1) if pm25_index is not None else None,
            "dominantPollutant": d.get("dominentpol"),
            "updatedAt": (d.get("time") or {}).get("iso"),
            "pollutants": {k: _value(k) for k in pollutant_keys if _value(k) is not None},
            "weather": {
                label: _value(key) for key, label in weather_keys.items()
                if _value(key) is not None
            },
            "attribution": [
                {"name": a.get("name"), "url": a.get("url")}
                for a in d.get("attributions", [])
            ],
            # WAQI publishes a daily min/avg/max forecast per pollutant.
            "forecast": (d.get("forecast") or {}).get("daily", {}),
        }

class OpenAQClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openaq.org/v3/locations"

    async def get_nearby(self, lat: float, lng: float, radius_km: int = 50) -> SourceResult:
        name_ = "openaq"
        if not self.api_key:
            return SourceResult(name=name_, status="disabled", detail="OPENAQ_API_KEY not set")

        # OpenAQ caps the radius at 25 km regardless of what we ask for.
        radius_m = min(radius_km, 25) * 1000
        # parameter_id 2 is PM2.5
        url = f"{self.base_url}?coordinates={lat},{lng}&radius={radius_m}&parameters_id=2"
        headers = {"X-API-Key": self.api_key}

        stations = []
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()

                results = data.get("results", [])
                for r in results:
                    coords = r.get("coordinates", {})
                    st_lat = coords.get("latitude")
                    st_lng = coords.get("longitude")

                    if st_lat is None or st_lng is None:
                        continue

                    # Find PM2.5 sensor reading
                    sensors = r.get("sensors", [])
                    pm25_val = None
                    for s in sensors:
                        p = s.get("parameter", {})
                        if p.get("id") == 2:
                            # In v3, latest value might be in latest object
                            latest = s.get("latest", {})
                            if "value" in latest:
                                pm25_val = float(latest["value"])
                            break

                    if pm25_val is None:
                        continue

                    dist = haversine(lat, lng, st_lat, st_lng)
                    name = r.get("name", "Unknown OpenAQ")

                    stations.append(StationData(
                        lat=st_lat,
                        lng=st_lng,
                        pm25=pm25_val,
                        distance_km=dist,
                        name=name,
                        source="openaq"
                    ))
        except Exception as e:
            return _classify_http_error(name_, e)

        return SourceResult(
            name=name_,
            status="ok" if stations else "empty",
            stations=stations,
        )

class OpenMeteoClient:
    """
    CAMS reanalysis on an ~11 km global grid. Needs no API key and resolves at
    every coordinate on Earth, so it is the source that removes blank areas
    where no physical monitor exists.
    """

    def __init__(self):
        self.base_url = "https://air-quality-api.open-meteo.com/v1/air-quality"

    async def get_estimate(self, lat: float, lng: float) -> SourceResult:
        name_ = "open-meteo"
        url = f"{self.base_url}?latitude={lat}&longitude={lng}&current=pm2_5"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                pm25_val = data.get("current", {}).get("pm2_5")
                if pm25_val is None:
                    return SourceResult(name=name_, status="empty", detail="no pm2_5 in response")

                return SourceResult(name=name_, status="ok", stations=[StationData(
                    lat=lat,
                    lng=lng,
                    pm25=float(pm25_val),
                    distance_km=0.0,
                    name="Open-Meteo CAMS model",
                    source="open-meteo",
                    kind="model",
                )])
        except Exception as e:
            return _classify_http_error(name_, e)

class OpenWeatherAirClient:
    """
    OpenWeather's Air Pollution model, reusing the key already configured for
    weather. Also global, so it corroborates Open-Meteo in unmonitored areas.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openweathermap.org/data/2.5/air_pollution"

    async def get_estimate(self, lat: float, lng: float) -> SourceResult:
        name_ = "openweather"
        if not self.api_key:
            return SourceResult(name=name_, status="disabled", detail="OPENWEATHER_API_KEY not set")

        url = f"{self.base_url}?lat={lat}&lon={lng}&appid={self.api_key}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                entries = data.get("list", [])
                if not entries:
                    return SourceResult(name=name_, status="empty", detail="empty list")

                pm25_val = entries[0].get("components", {}).get("pm2_5")
                if pm25_val is None:
                    return SourceResult(name=name_, status="empty", detail="no pm2_5 component")

                return SourceResult(name=name_, status="ok", stations=[StationData(
                    lat=lat,
                    lng=lng,
                    pm25=float(pm25_val),
                    distance_km=0.0,
                    name="OpenWeather model",
                    source="openweather",
                    kind="model",
                )])
        except Exception as e:
            return _classify_http_error(name_, e)

# Every request fans out to five upstreams, and panning the map issues a lot of
# requests over nearly the same point. Open-Meteo's free tier rate-limits that
# burst with a 429. Since CAMS republishes hourly on an ~11 km grid and the
# station feeds update at most hourly too, coordinates are rounded to ~1 km and
# results reused for a few minutes.
_CACHE_TTL_S = 300
_CACHE_MAX = 512
_cache: Dict[str, Tuple[float, SourceResult]] = {}


def _cache_key(name: str, lat: float, lng: float, radius_km: int) -> str:
    return f"{name}:{lat:.2f}:{lng:.2f}:{radius_km}"


async def _cached(key: str, fetch: Callable[[], Awaitable[SourceResult]]) -> SourceResult:
    """Reuse a recent result, and fall back to a stale one when fetching fails."""
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and now - hit[0] < _CACHE_TTL_S:
        return hit[1]

    result = await fetch()

    if result.status in ("ok", "empty"):
        if len(_cache) >= _CACHE_MAX:
            # Stale entries are still useful as fallbacks, so only the ones too
            # old to be worth serving are dropped.
            cutoff = now - 3600
            for k in [k for k, (ts, _) in _cache.items() if ts < cutoff]:
                del _cache[k]
        _cache[key] = (now, result)
        return result

    # The upstream is rate-limiting us or is down. A reading from minutes ago
    # beats a hole in the map and a "degraded" banner for what is a transient
    # 429, so serve the stale copy and say so in the detail line.
    if hit:
        age_min = int((now - hit[0]) / 60)
        logger.warning("%s failed (%s), serving cached result from %d min ago", key, result.detail, age_min)
        return replace(hit[1], detail=f"cached {age_min} min ago — live fetch: {result.detail}")

    return result


async def fetch_air_quality(lat: float, lng: float, radius_km: int = 50) -> AirQualityResult:
    """
    Fetch from every configured source and combine.

    Returns the per-source outcome alongside the readings so a caller can say
    *why* coverage is thin instead of presenting an empty map as a healthy one.
    """
    waqi = WaqiClient(settings.waqi_api_token)
    openaq = OpenAQClient(settings.openaq_api_key)
    open_meteo = OpenMeteoClient()
    openweather_air = OpenWeatherAirClient(settings.openweather_api_key)

    names = ["waqi-bounds", "waqi-nearest", "openaq", "open-meteo", "openweather"]
    results = await asyncio.gather(
        _cached(_cache_key("waqi-bounds", lat, lng, radius_km), lambda: waqi.get_in_bounds(lat, lng, radius_km)),
        _cached(_cache_key("waqi-nearest", lat, lng, 0), lambda: waqi.get_nearest(lat, lng)),
        _cached(_cache_key("openaq", lat, lng, radius_km), lambda: openaq.get_nearby(lat, lng, radius_km)),
        _cached(_cache_key("open-meteo", lat, lng, 0), lambda: open_meteo.get_estimate(lat, lng)),
        _cached(_cache_key("openweather", lat, lng, 0), lambda: openweather_air.get_estimate(lat, lng)),
        return_exceptions=True,
    )

    stations = []
    sources: List[SourceResult] = []
    for name, res in zip(names, results):
        if isinstance(res, SourceResult):
            sources.append(res)
            stations.extend(res.stations)
        else:
            # gather(return_exceptions=True) surfaces anything the clients did
            # not catch themselves.
            logger.error("Air quality source %s failed: %s", name, res)
            sources.append(SourceResult(name=name, status="error", detail=str(res)[:120]))

    # Sort by distance
    stations.sort(key=lambda x: x.distance_km)

    # Deduplicate rough coordinates. Sensors are compared first so a real
    # monitor is never dropped in favour of a model value sharing its cell,
    # and the two model sources are kept apart by source name since both sit
    # on the query coordinate.
    seen = set()
    unique = []
    for s in sorted(stations, key=lambda x: (x.kind != "sensor", x.distance_km)):
        key = (round(s.lat, 3), round(s.lng, 3), s.source if s.kind == "model" else "sensor")
        if key not in seen:
            seen.add(key)
            unique.append(s)

    unique.sort(key=lambda x: x.distance_km)

    logger.debug(
        "[AQ] %d unique readings (%d sensors, %d model) | sources: %s",
        len(unique),
        sum(1 for s in unique if s.kind == "sensor"),
        sum(1 for s in unique if s.kind == "model"),
        ", ".join(f"{s.name}={s.status}({len(s.stations)})" for s in sources),
    )

    # A degraded source is worth a warning even when others covered for it —
    # this is the log line that was missing when OpenAQ silently stopped working.
    for s in sources:
        if s.status in ("unauthorized", "error"):
            logger.warning("[AQ] source %s is %s: %s", s.name, s.status, s.detail)

    return AirQualityResult(stations=unique, sources=sources)


async def fetch_all_stations(lat: float, lng: float, radius_km: int = 50) -> List[StationData]:
    """Readings only, for callers that do not report source health."""
    result = await fetch_air_quality(lat, lng, radius_km)
    return result.stations
