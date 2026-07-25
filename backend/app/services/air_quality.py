import asyncio
import math
import logging
import httpx
from typing import List
from .schemas import StationData
from .fusion import aqi_to_pm25
from app.config import settings

logger = logging.getLogger("airq.services.aq")

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

    async def get_nearest(self, lat: float, lng: float) -> List[StationData]:
        if not self.token:
            return []

        url = f"{self.base_url}/feed/geo:{lat};{lng}/?token={self.token}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                if data.get("status") != "ok":
                    logger.warning(f"WAQI returned status: {data.get('status')}")
                    return []

                d = data.get("data", {})

                # Extract PM2.5 (might not be available at all stations)
                iaqi = d.get("iaqi", {})
                pm25_data = iaqi.get("pm25")
                if not pm25_data:
                    return []

                pm25_val = float(pm25_data.get("v", 0))

                city = d.get("city", {})
                geo = city.get("geo", [0, 0])
                if len(geo) != 2:
                    return []

                st_lat, st_lng = float(geo[0]), float(geo[1])
                name = city.get("name", "Unknown Station")

                dist = haversine(lat, lng, st_lat, st_lng)

                return [StationData(
                    lat=st_lat,
                    lng=st_lng,
                    pm25=pm25_val,
                    distance_km=dist,
                    name=name,
                    source="waqi"
                )]
        except Exception as e:
            logger.error(f"WAQI API error: {e}")
            return []

    async def get_in_bounds(self, lat: float, lng: float, radius_km: int = 50) -> List[StationData]:
        """
        Every WAQI station inside a bounding box around the point.

        /feed/geo returns exactly one station; this returns the whole local
        network, which is where most of the added coverage comes from. The
        trade-off is that the bounds feed publishes only a composite AQI per
        station, so concentrations here are reconstructed via aqi_to_pm25.
        """
        if not self.token:
            return []

        # Degrees per km: latitude is constant, longitude shrinks toward the poles.
        d_lat = radius_km / 111.0
        d_lng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
        latlng = f"{lat - d_lat},{lng - d_lng},{lat + d_lat},{lng + d_lng}"
        url = f"{self.base_url}/map/bounds/?latlng={latlng}&networks=all&token={self.token}"

        stations = []
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                if data.get("status") != "ok":
                    logger.warning(f"WAQI bounds returned status: {data.get('status')}")
                    return []

                for r in data.get("data", []):
                    # Offline stations report "-" instead of a number.
                    try:
                        aqi_val = float(r.get("aqi"))
                    except (TypeError, ValueError):
                        continue

                    st_lat, st_lng = r.get("lat"), r.get("lon")
                    if st_lat is None or st_lng is None:
                        continue

                    st_lat, st_lng = float(st_lat), float(st_lng)
                    name = r.get("station", {}).get("name", "Unknown Station")

                    stations.append(StationData(
                        lat=st_lat,
                        lng=st_lng,
                        pm25=aqi_to_pm25(aqi_val),
                        distance_km=haversine(lat, lng, st_lat, st_lng),
                        name=name,
                        source="waqi"
                    ))
        except Exception as e:
            logger.error(f"WAQI bounds API error: {e}")

        return stations

class OpenAQClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openaq.org/v3/locations"

    async def get_nearby(self, lat: float, lng: float, radius_km: int = 50) -> List[StationData]:
        if not self.api_key:
            return []

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
            logger.error(f"OpenAQ API error: {e}")

        return stations

class OpenMeteoClient:
    """
    CAMS reanalysis on an ~11 km global grid. Needs no API key and resolves at
    every coordinate on Earth, so it is the source that removes blank areas
    where no physical monitor exists.
    """

    def __init__(self):
        self.base_url = "https://air-quality-api.open-meteo.com/v1/air-quality"

    async def get_estimate(self, lat: float, lng: float) -> List[StationData]:
        url = f"{self.base_url}?latitude={lat}&longitude={lng}&current=pm2_5"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                pm25_val = data.get("current", {}).get("pm2_5")
                if pm25_val is None:
                    return []

                return [StationData(
                    lat=lat,
                    lng=lng,
                    pm25=float(pm25_val),
                    distance_km=0.0,
                    name="Open-Meteo CAMS model",
                    source="open-meteo",
                    kind="model",
                )]
        except Exception as e:
            logger.error(f"Open-Meteo API error: {e}")
            return []

class OpenWeatherAirClient:
    """
    OpenWeather's Air Pollution model, reusing the key already configured for
    weather. Also global, so it corroborates Open-Meteo in unmonitored areas.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openweathermap.org/data/2.5/air_pollution"

    async def get_estimate(self, lat: float, lng: float) -> List[StationData]:
        if not self.api_key:
            return []

        url = f"{self.base_url}?lat={lat}&lon={lng}&appid={self.api_key}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                entries = data.get("list", [])
                if not entries:
                    return []

                pm25_val = entries[0].get("components", {}).get("pm2_5")
                if pm25_val is None:
                    return []

                return [StationData(
                    lat=lat,
                    lng=lng,
                    pm25=float(pm25_val),
                    distance_km=0.0,
                    name="OpenWeather model",
                    source="openweather",
                    kind="model",
                )]
        except Exception as e:
            logger.error(f"OpenWeather Air Pollution API error: {e}")
            return []

async def fetch_all_stations(lat: float, lng: float, radius_km: int = 50) -> List[StationData]:
    """Fetch from every configured source and combine."""
    waqi = WaqiClient(settings.waqi_api_token)
    openaq = OpenAQClient(settings.openaq_api_key)
    open_meteo = OpenMeteoClient()
    openweather_air = OpenWeatherAirClient(settings.openweather_api_key)

    results = await asyncio.gather(
        waqi.get_in_bounds(lat, lng, radius_km),
        waqi.get_nearest(lat, lng),
        openaq.get_nearby(lat, lng, radius_km),
        open_meteo.get_estimate(lat, lng),
        openweather_air.get_estimate(lat, lng),
        return_exceptions=True,
    )

    stations = []
    for res in results:
        if isinstance(res, list):
            stations.extend(res)
        else:
            logger.error(f"Air quality source failed: {res}")

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
        "[AQ] %d unique readings (%d sensors, %d model) from sources: %s",
        len(unique),
        sum(1 for s in unique if s.kind == "sensor"),
        sum(1 for s in unique if s.kind == "model"),
        sorted({s.source for s in unique}),
    )

    return unique
