import asyncio
import logging

from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Request

from app.services.air_quality import fetch_all_stations
from app.services.weather import WeatherClient
from app.services.fusion import FusionEngine, pm25_to_aqi
from app.config import settings

logger = logging.getLogger("airq.api")
router = APIRouter()

# Both are stateless and cheap to hold for the process lifetime.
fusion_engine = FusionEngine()
weather_client = WeatherClient(settings.openweather_api_key)


@router.post("/analyze")
async def analyze_image(
    request: Request,
    file: UploadFile = File(...),
    latitude: float = Form(..., ge=-90.0, le=90.0),
    longitude: float = Form(..., ge=-180.0, le=180.0),
):
    # content_type is absent when the client omits the part header, so this
    # cannot assume a string.
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds {settings.max_upload_bytes // (1024 * 1024)} MB limit",
        )

    ml_service = getattr(request.app.state, "ml_service", None)
    if not ml_service:
        raise HTTPException(status_code=503, detail="ML Service not available")

    # Start network I/O first so it overlaps the forward pass instead of
    # running after it.
    stations_task = asyncio.create_task(fetch_all_stations(latitude, longitude))
    weather_task = asyncio.create_task(weather_client.get_current(latitude, longitude))

    try:
        # 1. AI inference — synchronous PyTorch, so it must run off the event
        #    loop. Called inline it would block every other request, including
        #    health checks, for the duration of the forward pass.
        try:
            ml_result = await asyncio.to_thread(ml_service.predict, contents)
        except ValueError as e:
            # Undecodable image is a client error, not a server fault.
            raise HTTPException(status_code=400, detail=str(e))

        # 2. External data, already in flight
        stations, weather = await asyncio.gather(stations_task, weather_task)

        # 3. Fusion
        fusion = fusion_engine.blend(
            ai_pm25=ml_result.pm25_estimate,
            ai_confidence=ml_result.confidence,
            stations=stations,
            weather=weather,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Analysis failed: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error during analysis")
    finally:
        # Prevents "task exception was never retrieved" if the inference above
        # failed before the gather.
        for task in (stations_task, weather_task):
            if not task.done():
                task.cancel()

    response = {
        "aqi_score": fusion.aqi_score,
        "status_text": fusion.status_text,
        "dominant_pollutant": fusion.dominant_pollutant,
        "ai_confidence": fusion.ai_confidence,
        "estimated_pm25": fusion.pm25,
        "raw_ai_pm25": round(ml_result.pm25_estimate, 1),
        "pm25_uncertainty": round(ml_result.uncertainty, 1),
        "out_of_distribution": ml_result.out_of_distribution,
        "fusion_method": fusion.fusion_method,
        "stations_used": fusion.stations_used,
        # Only stations the fusion actually used. Reporting the unfiltered
        # list let the UI show a station hundreds of km away that contributed
        # nothing, next to a stations_used count that excluded it.
        "nearby_stations": [
            {
                "name": s.name,
                "distanceKm": round(s.distance_km, 1),
                "aqi": pm25_to_aqi(s.pm25),
            }
            for s in fusion.contributing_stations[:3]
        ],
    }

    if weather:
        response["weather"] = {
            "temperature": round(weather.temp_c),
            "humidity": round(weather.humidity),
            "windSpeed": round(weather.wind_speed, 1),
        }

    return response
