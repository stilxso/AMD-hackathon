import logging
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Request
from app.services.air_quality import fetch_all_stations
from app.services.weather import WeatherClient
from app.services.fusion import FusionEngine
from app.config import settings

logger = logging.getLogger("airq.api")
router = APIRouter()

# Note: We do not instantiate FusionEngine once globally if it doesn't hold state, 
# but it's lightweight so it's fine.
fusion_engine = FusionEngine()
weather_client = WeatherClient(settings.openweather_api_key)

@router.post("/analyze")
async def analyze_image(
    request: Request,
    file: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
        
    try:
        contents = await file.read()
    except Exception as e:
        logger.error(f"Failed to read file: {e}")
        raise HTTPException(status_code=400, detail="Invalid file upload")
        
    ml_service = getattr(request.app.state, "ml_service", None)
    if not ml_service:
        raise HTTPException(status_code=503, detail="ML Service not available")
        
    try:
        # 1. AI Inference
        ml_result = ml_service.predict(contents)
        
        # 2. Fetch external data concurrently
        import asyncio
        stations_task = asyncio.create_task(fetch_all_stations(latitude, longitude))
        weather_task = asyncio.create_task(weather_client.get_current(latitude, longitude))
        
        stations, weather = await asyncio.gather(stations_task, weather_task)
        
        # 3. Fusion
        fusion = fusion_engine.blend(
            ai_pm25=ml_result.pm25_estimate,
            ai_confidence=ml_result.confidence,
            stations=stations,
            weather=weather
        )
        
        # Construct response matching frontend contract
        from app.services.fusion import _pm25_to_aqi
        response = {
            "aqi_score": fusion.aqi_score,
            "status_text": fusion.status_text,
            "dominant_pollutant": fusion.dominant_pollutant,
            "ai_confidence": fusion.ai_confidence,
            "estimated_pm25": fusion.pm25,
            "nearby_stations": [
                {
                    "name": s.name,
                    "distanceKm": round(s.distance_km, 1),
                    "aqi": _pm25_to_aqi(s.pm25)  # Map PM2.5 to AQI
                } for s in stations[:3]  # Return top 3 closest
            ]
        }
        
        if weather:
            response["weather"] = {
                "temperature": round(weather.temp_c),
                "humidity": round(weather.humidity),
                "windSpeed": round(weather.wind_speed, 1)
            }
            
        return response
        
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during analysis")
