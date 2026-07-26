import logging
import httpx
from typing import Optional
from .cache import TTLCache
from .schemas import WeatherData
from app.config import settings

logger = logging.getLogger("airq.services.weather")

# Conditions do not move on a shorter timescale than the station feeds, and
# /analyze and /explain each ask for the same point. Same 5-minute TTL and ~1 km
# key rounding as the air quality cache, and shared across clients since there
# is one configured key.
_CACHE_TTL_S = 300
_cache: TTLCache[Optional[WeatherData]] = TTLCache("weather", ttl_s=_CACHE_TTL_S, max_entries=256)

class WeatherClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openweathermap.org/data/2.5/weather"

    async def get_current(self, lat: float, lng: float) -> Optional[WeatherData]:
        if not self.api_key:
            return None

        key = f"{lat:.2f}:{lng:.2f}"
        hit = _cache.fresh(key)
        if hit is not None:
            return hit
        return await _cache.single_flight(key, lambda: self._fetch(key, lat, lng))

    async def _fetch(self, key: str, lat: float, lng: float) -> Optional[WeatherData]:
        url = f"{self.base_url}?lat={lat}&lon={lng}&appid={self.api_key}&units=metric"

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                main = data.get("main", {})
                wind = data.get("wind", {})

                weather = WeatherData(
                    temp_c=float(main.get("temp", 20.0)),
                    humidity=float(main.get("humidity", 50.0)),
                    wind_speed=float(wind.get("speed", 2.0)),
                    pressure=float(main.get("pressure", 1013.0)),
                    wind_deg=float(wind["deg"]) if wind.get("deg") is not None else None,
                    place=data.get("name") or None,
                )
        except Exception as e:
            logger.error(f"OpenWeatherMap API error: {e}")
            # Callers treat None as "no weather context" and drop the humidity
            # and wind correction entirely, so minutes-old conditions are a
            # better answer than nothing for a transient failure.
            stale = _cache.stale(key)
            if stale:
                logger.warning("Serving weather for %s from %d min ago", key, int(stale[1] / 60))
                return stale[0]
            return None

        _cache.store(key, weather)
        return weather
