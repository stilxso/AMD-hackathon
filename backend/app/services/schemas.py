from typing import List, Optional
from pydantic import BaseModel

class StationData(BaseModel):
    lat: float
    lng: float
    pm25: float
    distance_km: float
    name: str
    source: str  # "waqi" or "openaq"
    
class WeatherData(BaseModel):
    temp_c: float
    humidity: float  # percentage
    wind_speed: float  # m/s
    pressure: float  # hPa
    
class FusionResult(BaseModel):
    aqi_score: int
    status_text: str
    pm25: float
    ai_confidence: float
    dominant_pollutant: str
    weather: Optional[WeatherData] = None
    stations_used: int
    fusion_method: str = "bayesian_exponential_v1"
