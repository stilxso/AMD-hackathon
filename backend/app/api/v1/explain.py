import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import current_user
from app.config import settings
from app.services.air_quality import fetch_air_quality
from app.services.auth import User
from app.services.explain import (
    ChatMessage,
    ExplainError,
    build_evidence,
    chat_reply,
    generate_explanation,
)
from app.services.fusion import pm25_to_aqi
from app.services.grid import fetch_point_context, fetch_pm25_grid
from app.services.weather import WeatherClient

logger = logging.getLogger("airq.api")
router = APIRouter()

weather_client = WeatherClient(settings.openweather_api_key)

# Every chat turn needs the same evidence the previous turn used, and the
# upstreams behind it republish hourly at best. Rebuilding it per message would
# spend four fetches — one an uncached ~300-point grid request — to arrive at
# the same numbers, so it is held briefly per location. The TTL matches the
# station cache in air_quality.
_EVIDENCE_TTL_S = 300
_EVIDENCE_MAX = 128
_evidence_cache: dict[str, tuple[float, dict, list]] = {}


def _require_gemini() -> None:
    """Both endpoints bill a Gemini request, so both refuse without a key."""
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Explanations are unavailable: GEMINI_API_KEY is not configured.",
        )


async def _gather_evidence(
    latitude: float,
    longitude: float,
    radius_km: int,
    pm25: float | None,
) -> tuple[dict, list]:
    """
    Build the evidence base for a point, plus the per-source health behind it.

    Coordinates are rounded to ~1 km for the cache key — the same rounding the
    station cache uses — so a few metres of drift between turns is not a miss.
    """
    key = f"{latitude:.2f}:{longitude:.2f}:{radius_km}:{'' if pm25 is None else round(pm25)}"
    now = time.monotonic()
    hit = _evidence_cache.get(key)
    if hit and now - hit[0] < _EVIDENCE_TTL_S:
        return hit[1], hit[2]

    aq, grid_points, context, weather = await asyncio.gather(
        fetch_air_quality(latitude, longitude, radius_km),
        fetch_pm25_grid(latitude, longitude, radius_km),
        fetch_point_context(latitude, longitude),
        weather_client.get_current(latitude, longitude),
    )

    in_range = [s for s in aq.stations if s.distance_km <= radius_km]

    # Prefer the caller's fused figure when supplied, then a real monitor, then
    # the grid mean. Explaining a level nobody measured would be fiction.
    if pm25 is not None:
        observed = pm25
        basis = "caller-supplied (fused estimate)"
    else:
        sensors = [s for s in in_range if s.kind == "sensor"]
        if sensors:
            nearest = min(sensors, key=lambda s: s.distance_km)
            observed = nearest.pm25
            basis = f"nearest monitor: {nearest.name} ({nearest.distance_km:.1f} km)"
        elif grid_points:
            observed = sum(p.pm25 for p in grid_points) / len(grid_points)
            basis = "modelled grid mean (no monitor in range)"
        elif context.history:
            observed = context.history[-1]
            basis = "modelled point value"
        else:
            raise HTTPException(
                status_code=502,
                detail="No air quality data available for this location.",
            )

    evidence = build_evidence(
        lat=latitude,
        lng=longitude,
        pm25=observed,
        aqi=pm25_to_aqi(observed),
        stations=in_range,
        weather=weather,
        grid_points=grid_points,
        context=context,
    )
    evidence["reading"]["basis"] = basis

    sources = [
        {"name": s.name, "status": s.status, "count": len(s.stations), "detail": s.detail}
        for s in aq.sources
    ]

    if len(_evidence_cache) >= _EVIDENCE_MAX:
        cutoff = now - _EVIDENCE_TTL_S
        for k in [k for k, (ts, _, _) in _evidence_cache.items() if ts < cutoff]:
            del _evidence_cache[k]
    _evidence_cache[key] = (now, evidence, sources)

    return evidence, sources


@router.get("/explain")
async def explain_pollution(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_km: int = Query(50, ge=1, le=200),
    pm25: float | None = Query(
        None,
        ge=0.0,
        le=1000.0,
        description="Override the observed concentration, e.g. a fused photo estimate",
    ),
    # Gated: every call bills a Gemini request. /stations stays public so the
    # map still renders pre-login, but this one needs an account.
    user: User = Depends(current_user),
):
    """
    Reasoned explanation of why PM2.5 is at its current level at this point.

    Gathers the same data the map uses, derives the quantities that discriminate
    between causes (spatial gradient, 24 h trajectory, upwind/downwind,
    ventilation, sensor-vs-model divergence), and asks Gemini to reason over them.

    `evidence` is returned alongside the prose so the reasoning is auditable —
    every number the explanation cites is visible here.
    """
    _require_gemini()

    evidence, sources = await _gather_evidence(latitude, longitude, radius_km, pm25)

    try:
        explanation = await generate_explanation(evidence)
    except ExplainError as e:
        # 502: our request was fine, the upstream model could not answer.
        logger.warning("Explanation failed at (%s, %s): %s", latitude, longitude, e)
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "explanation": explanation,
        "evidence": evidence,
        "model": settings.gemini_model,
        "sources": sources,
    }


# Long enough for a real question, short enough that the request body cannot be
# used to smuggle a wall of text past the system instruction.
_MAX_MESSAGE_CHARS = 1000

# Turns kept from the client's history. Each one is replayed to Gemini and the
# evidence base is re-attached on top, so an unbounded transcript would grow the
# bill without improving the answer.
_MAX_TURNS = 20


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|model)$")
    text: str = Field(min_length=1, max_length=_MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    radius_km: int = Field(50, ge=1, le=200)
    pm25: float | None = Field(None, ge=0.0, le=1000.0)
    # The whole conversation, oldest first. The server holds no session state:
    # the evidence is refetched per turn and the transcript comes from the
    # client, which keeps this horizontally scalable and lets a user drop a
    # thread simply by not sending it.
    messages: list[ChatTurn] = Field(min_length=1, max_length=_MAX_TURNS)


@router.post("/explain/chat")
async def explain_chat(
    body: ChatRequest,
    user: User = Depends(current_user),
):
    """
    Follow-up questions about the air quality at one point.

    Same evidence base as `/explain`, re-attached to the latest question each
    turn so answers track the live numbers rather than the ones from whenever
    the conversation started.
    """
    _require_gemini()

    if body.messages[-1].role != "user":
        raise HTTPException(
            status_code=422,
            detail="The conversation must end with a user message.",
        )

    evidence, _ = await _gather_evidence(
        body.latitude, body.longitude, body.radius_km, body.pm25
    )

    try:
        reply = await chat_reply(
            evidence,
            [ChatMessage(role=m.role, text=m.text) for m in body.messages],
        )
    except ExplainError as e:
        logger.warning(
            "Chat reply failed at (%s, %s): %s", body.latitude, body.longitude, e
        )
        raise HTTPException(status_code=502, detail=str(e))

    return {"reply": reply, "model": settings.gemini_model}
