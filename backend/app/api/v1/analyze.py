import asyncio
import logging

from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, Request

from app.api.deps import current_user
from app.services import store
from app.services.auth import User
from app.services.air_quality import fetch_all_stations
from app.services.weather import WeatherClient
from app.services.fusion import FusionEngine, pm25_to_aqi, _get_status_text
from app.config import settings

logger = logging.getLogger("airq.api")
router = APIRouter()

# Both are stateless and cheap to hold for the process lifetime.
fusion_engine = FusionEngine()
weather_client = WeatherClient(settings.openweather_api_key)


async def _record_history(
    *,
    user: User,
    response: dict,
    latitude: float,
    longitude: float,
    image_bytes: bytes,
    place: str | None,
) -> int | None:
    """
    Persist a finished scan for the user's cabinet.

    History is a side effect of a successful analysis, never a precondition for
    one: a write failure is logged and the estimate is returned regardless. The
    thumbnail encode and the insert are both blocking, so they run off the event
    loop like every other synchronous call in this module.
    """
    try:
        thumbnail = await asyncio.to_thread(store.make_thumbnail, image_bytes)
        return await asyncio.to_thread(
            store.save_analysis,
            user_id=user.id,
            latitude=latitude,
            longitude=longitude,
            aqi=response["aqi_score"],
            pm25=response["estimated_pm25"],
            raw_ai_pm25=response.get("raw_ai_pm25"),
            uncertainty=response.get("pm25_uncertainty"),
            confidence=response.get("ai_confidence"),
            sky_score=response.get("sky_score"),
            status_text=response.get("status_text"),
            fusion_method=response.get("fusion_method"),
            stations_used=response.get("stations_used", 0),
            place=place,
            thumbnail=thumbnail,
        )
    except Exception as exc:
        logger.warning("Could not record analysis history for %r: %s", user.username, exc)
        return None


@router.post("/analyze")
async def analyze_image(
    request: Request,
    file: UploadFile = File(...),
    latitude: float = Form(..., ge=-90.0, le=90.0),
    longitude: float = Form(..., ge=-180.0, le=180.0),
    nn_only: bool = Form(False),
    user: User = Depends(current_user),
):
    """
    Estimate air quality from a sky photograph.

    By default the vision estimate is fused with nearby monitors and weather.
    With `nn_only`, the network's own output is returned untouched — no station
    blending, no weather correction — which is what isolates what the model
    alone sees.
    """
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
    # running after it. In nn_only mode there is nothing to overlap: the
    # upstreams are not consulted at all, which is the point of the mode.
    tasks = (
        ()
        if nn_only
        else (
            asyncio.create_task(fetch_all_stations(latitude, longitude)),
            asyncio.create_task(weather_client.get_current(latitude, longitude)),
        )
    )

    try:
        # 1. AI inference — synchronous PyTorch, so it must run off the event
        #    loop. Called inline it would block every other request, including
        #    health checks, for the duration of the forward pass.
        try:
            ml_result = await asyncio.to_thread(ml_service.predict, contents)
        except ValueError as e:
            # Undecodable image is a client error, not a server fault.
            raise HTTPException(status_code=400, detail=str(e))

        # The regressor has no reject option, so a carpet or a keyboard maps to
        # a perfectly ordinary PM2.5 number. Refuse here rather than hand back
        # an estimate the user has no way to recognise as meaningless. This
        # applies in nn_only mode too: that mode exists to show the model's own
        # answer, and its own answer for a non-sky photo is "I can't tell".
        if not ml_result.is_sky:
            logger.info(
                "Rejected non-sky upload: sky_score=%.3f", ml_result.sky_score,
            )
            raise HTTPException(
                status_code=422,
                detail="This photo doesn't look like the sky. Point the camera "
                       "upward at open sky or a skyline and try again.",
            )

        if nn_only:
            weather = None
            fusion = None
        else:
            # 2. External data, already in flight
            stations, weather = await asyncio.gather(*tasks)

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
        for task in tasks:
            if not task.done():
                task.cancel()

    if fusion is None:
        # The network's own estimate, mapped straight to AQI. Confidence is the
        # model's measured MC-dropout confidence, with none of the corroboration
        # or weather terms the composite model applies.
        raw_pm25 = round(ml_result.pm25_estimate, 1)
        aqi = pm25_to_aqi(ml_result.pm25_estimate)
        response = {
            "aqi_score": aqi,
            "status_text": _get_status_text(aqi),
            "dominant_pollutant": "PM2.5",
            "ai_confidence": round(ml_result.confidence, 2),
            "estimated_pm25": raw_pm25,
            "raw_ai_pm25": raw_pm25,
            "pm25_uncertainty": round(ml_result.uncertainty, 1),
            "out_of_distribution": ml_result.out_of_distribution,
            "sky_score": round(ml_result.sky_score, 2),
            "fusion_method": "nn_only",
            "stations_used": 0,
            "nearby_stations": [],
        }
        response["analysis_id"] = await _record_history(
            user=user,
            response=response,
            latitude=latitude,
            longitude=longitude,
            image_bytes=contents,
            place=None,
        )
        return response

    response = {
        "aqi_score": fusion.aqi_score,
        "status_text": fusion.status_text,
        "dominant_pollutant": fusion.dominant_pollutant,
        "ai_confidence": fusion.ai_confidence,
        "estimated_pm25": fusion.pm25,
        "raw_ai_pm25": round(ml_result.pm25_estimate, 1),
        "pm25_uncertainty": round(ml_result.uncertainty, 1),
        "out_of_distribution": ml_result.out_of_distribution,
        "sky_score": round(ml_result.sky_score, 2),
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

    response["analysis_id"] = await _record_history(
        user=user,
        response=response,
        latitude=latitude,
        longitude=longitude,
        image_bytes=contents,
        place=weather.place if weather else None,
    )

    return response
