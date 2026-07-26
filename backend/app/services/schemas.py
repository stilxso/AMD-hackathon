from typing import List, Literal, Optional
from pydantic import BaseModel, Field

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

    # WAQI's station id, when the reading came from a feed that publishes one.
    # It is what /stations/detail needs to pull a station's full pollutant
    # breakdown and forecast, so without it the detail endpoint is unreachable
    # from the map.
    uid: Optional[str] = None

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

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class SaveLocationRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)

class ShareAnalysisRequest(BaseModel):
    is_public: bool

class ReportRequest(BaseModel):
    """A subjective observation of the air, submitted by a user."""

    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    perceived: Literal["good", "moderate", "poor", "severe"]

    # How far the reporter can see. It is the one field here that correlates
    # with particulate directly, which is why it is worth collecting alongside
    # the categorical judgement.
    visibility_km: Optional[float] = Field(None, ge=0.0, le=100.0)
    symptoms: List[str] = Field(default_factory=list, max_length=8)
    note: Optional[str] = Field(None, max_length=280)

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
