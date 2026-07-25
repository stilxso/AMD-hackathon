from typing import List, Literal, Optional
from pydantic import BaseModel

class StationData(BaseModel):
    lat: float
    lng: float
    pm25: float
    distance_km: float
    name: str
    source: str  # "waqi" | "openaq" | "open-meteo" | "openweather"

    # "sensor" is a physical monitor at (lat, lng). "model" is a reanalysis grid
    # value interpolated to the query point — it always resolves, which is what
    # gives global coverage, but its distance_km is ~0 by construction and says
    # nothing about measurement proximity. Fusion treats the two differently.
    kind: Literal["sensor", "model"] = "sensor"

class WeatherData(BaseModel):
    temp_c: float
    humidity: float  # percentage
    wind_speed: float  # m/s
    pressure: float  # hPa

    # Both come free with the same OpenWeather response and are only consumed by
    # the explanation service: wind direction says which way pollution is being
    # carried from, and the place name anchors reasoning about local sources.
    # Optional so fusion, which ignores them, is unaffected when absent.
    wind_deg: Optional[float] = None
    place: Optional[str] = None

class RegisterRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: int
    username: str
    created_at: str
    is_admin: bool = False

class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # seconds
    user: UserOut

class FusionResult(BaseModel):
    aqi_score: int
    status_text: str
    pm25: float
    ai_confidence: float
    dominant_pollutant: str
    weather: Optional[WeatherData] = None
    stations_used: int
    contributing_stations: List[StationData] = []
    fusion_method: str = "composite_exponential_v2"
