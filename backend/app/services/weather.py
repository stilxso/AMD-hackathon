import logging
import httpx
from typing import Optional
from .schemas import WeatherData
from app.config import settings

logger = logging.getLogger("airq.services.weather")

class WeatherClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openweathermap.org/data/2.5/weather"

    async def get_current(self, lat: float, lng: float) -> Optional[WeatherData]:
        if not self.api_key:
            return None
            
        url = f"{self.base_url}?lat={lat}&lon={lng}&appid={self.api_key}&units=metric"
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                
                main = data.get("main", {})
                wind = data.get("wind", {})
                
                return WeatherData(
                    temp_c=float(main.get("temp", 20.0)),
                    humidity=float(main.get("humidity", 50.0)),
                    wind_speed=float(wind.get("speed", 2.0)),
                    pressure=float(main.get("pressure", 1013.0))
                )
        except Exception as e:
            logger.error(f"OpenWeatherMap API error: {e}")
            return None
