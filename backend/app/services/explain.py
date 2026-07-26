"""
Why is PM2.5 at this level, here, right now?

An LLM handed a bare number ("PM2.5 is 14 µg/m³, explain") can only produce a
horoscope: it will recite generic causes of particulate pollution and attach
them to the location with no evidence. To get reasoning instead, this module
derives the quantities that actually discriminate between causes, and passes
those as the evidence base:

  * the spatial gradient of the modelled field — which way it gets worse, and
    how steeply, fitted across the whole grid rather than eyeballed
  * whether the dirty side is the upwind side, which separates "pollution is
    being carried here" from "it is being produced here"
  * the 24 h trajectory — overnight accumulation under a stable layer has a
    very different shape from a level that blew in this afternoon
  * ventilation (wind speed against a mixing reference) and elevation, the two
    terms that decide whether emissions disperse or pool
  * sensor-vs-model divergence, which is the signature of a local source too
    small for an ~11 km reanalysis cell to resolve

Gemini's job is to weigh those against what it knows about the region's
emission sources and meteorology. The numbers are ours; the synthesis is its.
"""

import json
import logging
import math
from typing import List, Literal, Optional

import httpx
from pydantic import BaseModel

from app.config import settings
from .grid import GridPoint, PointContext
from .schemas import StationData, WeatherData

logger = logging.getLogger("airq.services.explain")

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Wind speed at which mixing is considered normal; the same reference the
# fusion engine centres its wind correction on, kept consistent on purpose.
_WIND_REFERENCE = 3.0

_COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def _bearing_name(deg: float) -> str:
    return _COMPASS[int((deg % 360) / 22.5 + 0.5) % 16]


class GradientInfo(BaseModel):
    """Least-squares planar fit of PM2.5 over the grid."""

    per_km: float           # µg/m³ per km, magnitude of the gradient
    bearing_deg: float      # compass bearing in which concentration increases
    bearing_name: str
    spread_pct: float       # (max-min)/mean across the grid, as a percentage
    min_pm25: float
    max_pm25: float
    mean_pm25: float


class TrendInfo(BaseModel):
    # Always the modelled CAMS series at the query point, never the monitor
    # reading — labelled explicitly because the two can differ severalfold and
    # the model must not silently treat them as the same quantity.
    source: str = "modelled (CAMS reanalysis at this coordinate)"
    current: float
    min_24h: float
    max_24h: float
    peak_hour_local: Optional[str] = None
    change_6h_pct: Optional[float] = None
    direction: str          # "rising" | "falling" | "flat"


def compute_gradient(points: List[GridPoint], lat0: float, lng0: float) -> Optional[GradientInfo]:
    """
    Fit pm25 ≈ a·east + b·north + c over the grid and report the gradient.

    A planar fit uses every cell, so a single noisy one cannot swing the answer
    the way a simple max-cell search would.
    """
    if len(points) < 4:
        return None

    values = [p.pm25 for p in points]
    mean = sum(values) / len(values)
    lo, hi = min(values), max(values)

    # Local flat-earth projection to km. Accurate well beyond the ~100 km box.
    km_per_deg_lat = 111.0
    km_per_deg_lng = 111.0 * max(math.cos(math.radians(lat0)), 0.01)

    # Normal equations for the 3-parameter plane. Written out rather than pulling
    # in numpy so the failure mode (a degenerate grid) stays visible below.
    sxx = sxy = syy = sx = sy = sxz = syz = sz = 0.0
    n = float(len(points))
    for p in points:
        x = (p.lng - lng0) * km_per_deg_lng
        y = (p.lat - lat0) * km_per_deg_lat
        z = p.pm25
        sxx += x * x; sxy += x * y; syy += y * y
        sx += x; sy += y; sz += z
        sxz += x * z; syz += y * z

    # 3×3 symmetric system: [[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,n]] · [a,b,c] = [sxz,syz,sz]
    det = (sxx * (syy * n - sy * sy)
           - sxy * (sxy * n - sy * sx)
           + sx * (sxy * sy - syy * sx))
    if abs(det) < 1e-9:
        return None

    a = ((sxz * (syy * n - sy * sy)
          - sxy * (syz * n - sy * sz)
          + sx * (syz * sy - syy * sz)) / det)
    b = ((sxx * (syz * n - sy * sz)
          - sxz * (sxy * n - sy * sx)
          + sx * (sxy * sz - syz * sx)) / det)

    magnitude = math.hypot(a, b)
    # atan2(east, north) gives a compass bearing measured clockwise from north.
    bearing = math.degrees(math.atan2(a, b)) % 360

    return GradientInfo(
        per_km=round(magnitude, 3),
        bearing_deg=round(bearing, 1),
        bearing_name=_bearing_name(bearing),
        spread_pct=round((hi - lo) / mean * 100, 1) if mean > 0 else 0.0,
        min_pm25=round(lo, 1),
        max_pm25=round(hi, 1),
        mean_pm25=round(mean, 1),
    )


def compute_trend(context: PointContext) -> Optional[TrendInfo]:
    """Shape of the past 24 h, which is what separates accumulation from advection."""
    h = context.history
    if len(h) < 6:
        return None

    current = h[-1]
    lo, hi = min(h), max(h)
    peak_idx = h.index(hi)
    peak_hour = (
        context.history_times[peak_idx]
        if peak_idx < len(context.history_times)
        else None
    )

    six_ago = h[-7]
    change = ((current - six_ago) / six_ago * 100) if six_ago > 0 else None

    if change is None:
        direction = "flat"
    elif change > 15:
        direction = "rising"
    elif change < -15:
        direction = "falling"
    else:
        direction = "flat"

    return TrendInfo(
        current=round(current, 1),
        min_24h=round(lo, 1),
        max_24h=round(hi, 1),
        peak_hour_local=peak_hour,
        change_6h_pct=round(change, 1) if change is not None else None,
        direction=direction,
    )


def _advection_note(gradient: Optional[GradientInfo], weather: Optional[WeatherData]) -> str:
    """
    Is the dirtier air upwind or downwind?

    OpenWeather's wind_deg is the direction the wind blows *from*. When that
    coincides with the bearing of increasing concentration, the pollution
    upstream is being carried toward the point — imported. When it is opposite,
    the point is upwind of the dirty area, so the local level is locally
    produced. This single comparison does more to explain a reading than any
    amount of prose about particulates.
    """
    if gradient is None or weather is None or weather.wind_deg is None:
        return "unavailable (needs both the modelled field and wind direction)"

    # Angular difference between "where it gets dirtier" and "where wind comes from".
    delta = abs((gradient.bearing_deg - weather.wind_deg + 180) % 360 - 180)

    if gradient.per_km < 0.02:
        return (
            f"field is essentially flat ({gradient.per_km} µg/m³/km), so no "
            "meaningful horizontal transport signal either way"
        )
    if delta < 60:
        return (
            f"dirtier air lies UPWIND ({gradient.bearing_name}, {delta:.0f}° from "
            f"the wind source bearing) — consistent with pollution being advected "
            f"toward this point"
        )
    if delta > 120:
        return (
            f"dirtier air lies DOWNWIND ({gradient.bearing_name}, {delta:.0f}° from "
            f"the wind source bearing) — this point sits upwind of the worse area, "
            f"so its level is more likely locally produced than imported"
        )
    return (
        f"dirty sector is roughly CROSSWIND ({gradient.bearing_name}, {delta:.0f}° "
        f"from the wind source bearing) — transport is not the dominant term"
    )


def build_evidence(
    lat: float,
    lng: float,
    pm25: float,
    aqi: int,
    stations: List[StationData],
    weather: Optional[WeatherData],
    grid_points: List[GridPoint],
    context: PointContext,
) -> dict:
    """Assemble the derived, quantitative evidence base handed to the model."""
    sensors = [s for s in stations if s.kind == "sensor"]
    models = [s for s in stations if s.kind == "model"]

    gradient = compute_gradient(grid_points, lat, lng)
    trend = compute_trend(context)

    sensor_mean = sum(s.pm25 for s in sensors) / len(sensors) if sensors else None
    model_mean = sum(s.pm25 for s in models) / len(models) if models else None

    divergence = None
    if sensor_mean is not None and model_mean is not None and model_mean > 0:
        divergence = round((sensor_mean - model_mean) / model_mean * 100, 1)

    ventilation = None
    if weather is not None:
        # Ratio to the mixing reference: <1 means stagnant, >1 well ventilated.
        ventilation = round(weather.wind_speed / _WIND_REFERENCE, 2)

    # The headline reading and the trend series come from different instruments,
    # and over a WAQI station they can disagree severalfold — that feed publishes
    # a composite AQI which is back-converted to PM2.5, so it is unreliable
    # whenever PM2.5 was not the pollutant driving the composite. Stating the
    # disagreement outright stops the model inventing a reconciliation.
    consistency = None
    if trend is not None and trend.current > 0:
        ratio = pm25 / trend.current
        if ratio > 2.0 or ratio < 0.5:
            # Report the factor as a magnitude — "differ by 0.2×" reads as agreement.
            factor = ratio if ratio > 1 else 1 / ratio
            consistency = (
                f"CONFLICT: the headline reading ({pm25:.1f} µg/m³) and the modelled "
                f"series ({trend.current:.1f} µg/m³) differ by {factor:.1f}×. Treat the "
                "absolute level as uncertain and lower your confidence accordingly. "
                "Monitor-derived values here are back-converted from a composite AQI, "
                "so they understate PM2.5 when another pollutant drove that composite."
            )
        else:
            consistency = (
                f"consistent: headline reading and modelled series agree within "
                f"{abs(1 - ratio) * 100:.0f}%"
            )

    return {
        "location": {
            "latitude": round(lat, 4),
            "longitude": round(lng, 4),
            "place": weather.place if weather else None,
            "elevation_m": context.elevation_m,
            "timezone": context.timezone,
        },
        "reading": {
            "pm25_ugm3": round(pm25, 1),
            "us_aqi": aqi,
            # WHO 2021 24-hour guideline, the reference most people mean by "safe".
            "who_24h_guideline_ugm3": 15,
            "times_who_guideline": round(pm25 / 15.0, 2),
        },
        "spatial_field": gradient.model_dump() if gradient else None,
        "trend_24h": trend.model_dump() if trend else None,
        "data_consistency": consistency,
        "advection": _advection_note(gradient, weather),
        "meteorology": (
            {
                "temp_c": round(weather.temp_c, 1),
                "humidity_pct": round(weather.humidity),
                "wind_speed_ms": round(weather.wind_speed, 1),
                "wind_from_deg": weather.wind_deg,
                "wind_from_name": _bearing_name(weather.wind_deg) if weather.wind_deg is not None else None,
                "pressure_hpa": round(weather.pressure),
                "ventilation_index": ventilation,
                "ventilation_note": (
                    "stagnant — emissions accumulate" if ventilation and ventilation < 0.7
                    else "well ventilated — emissions disperse" if ventilation and ventilation > 1.5
                    else "moderate mixing"
                ),
            }
            if weather
            else None
        ),
        "monitors": {
            "sensor_count": len(sensors),
            "sensor_mean_pm25": round(sensor_mean, 1) if sensor_mean is not None else None,
            "model_mean_pm25": round(model_mean, 1) if model_mean is not None else None,
            "sensor_vs_model_pct": divergence,
            "divergence_note": (
                "sensors read materially higher than the ~11 km reanalysis — "
                "suggests a local source the model grid cannot resolve"
                if divergence is not None and divergence > 30
                else "sensors read lower than the reanalysis — the grid cell may be "
                     "dominated by conditions outside the immediate area"
                if divergence is not None and divergence < -30
                else "sensors and reanalysis broadly agree"
                if divergence is not None
                else "no physical monitor in range to cross-check the model"
            ),
            "nearest_km": round(min((s.distance_km for s in sensors), default=0.0), 1) if sensors else None,
        },
    }


_SYSTEM_INSTRUCTION = """You are an atmospheric scientist explaining a specific \
air quality reading to a non-specialist.

You are given a derived evidence base: a measured PM2.5 level, the spatial \
gradient of the modelled pollution field, a 24-hour trajectory, an upwind/downwind \
determination, ventilation conditions, and how far physical monitors diverge from \
the reanalysis. Reason from that evidence.

Rules:
- Ground every claim in a specific number from the evidence. Cite it inline.
- Reason causally: connect the meteorology and the field geometry to the level. \
Do not list generic sources of particulate pollution.
- Use your knowledge of the named region's actual emission sources (industry, \
heating fuel, traffic patterns, topography, agricultural or wildfire seasonality) \
but only where the evidence supports that source being active right now.
- Distinguish clearly between what the data shows and what you are inferring.
- If the evidence is weak or contradictory, say so rather than inventing a story.
- Never restate a number as a different number. Never invent data not present.
- If data_consistency reports a CONFLICT, lead with that uncertainty, explain the \
level as a range rather than a point value, and do not report confidence above "low".

Return JSON matching this shape exactly:
{
  "headline": "one sentence, under 15 words, stating the dominant cause",
  "severity_context": "1-2 sentences putting the level in human terms vs the WHO guideline",
  "drivers": [
    {"factor": "short label", "evidence": "the specific numbers", "explanation": "why this raises or lowers the level"}
  ],
  "reasoning": "2-4 paragraphs of connected causal reasoning",
  "what_would_change_it": "1-2 sentences on what would make this better or worse in the next 24h",
  "confidence": "high | medium | low",
  "confidence_note": "why that confidence, referencing data quality/coverage"
}
Provide 2-4 drivers, ordered by how much they matter."""


_CHAT_SYSTEM_INSTRUCTION = """You are an atmospheric scientist answering a \
non-specialist's questions about the air quality at one specific place, right now.

Every message you receive carries the same derived evidence base: the measured \
PM2.5 level, the spatial gradient of the modelled pollution field, a 24-hour \
trajectory, an upwind/downwind determination, ventilation conditions, and how far \
physical monitors diverge from the reanalysis. That evidence is the only data you \
have about this location — you cannot fetch more, and it refreshes on its own \
between turns.

Rules:
- Answer the question that was asked. Do not deliver the full briefing again \
unless that is what was asked for.
- Ground quantitative claims in a specific number from the evidence, cited inline.
- Reason causally from the meteorology and field geometry. Do not recite generic \
causes of particulate pollution.
- You may use what you know about the named region's emission sources, topography \
and seasonality, but only where the evidence supports that source being active now, \
and say plainly when you are inferring rather than reading off the data.
- If the evidence cannot answer the question — it asks about a pollutant other than \
PM2.5, another location, a forecast beyond the 24 h series — say what is missing \
instead of guessing.
- If data_consistency reports a CONFLICT, treat the absolute level as uncertain and \
answer in ranges.
- Never restate a number as a different number. Never invent data not present.
- Health advice stays general and non-clinical: exposure guidance, not diagnosis or \
treatment. Point anyone describing symptoms toward a doctor.

Write plain conversational prose, 2-5 sentences for a simple question and at most \
three short paragraphs for a broad one. No markdown headings, no bullet lists, no \
JSON."""


class ExplainError(Exception):
    """Raised when the explanation could not be produced."""


class ChatMessage(BaseModel):
    """One turn of the explanation chat, in Gemini's role vocabulary."""

    role: Literal["user", "model"]
    text: str


async def _call_gemini(
    system_instruction: str,
    contents: list[dict],
    generation_config: dict,
) -> str:
    """
    POST to Gemini and return the candidate's text.

    Shared by the one-shot explanation and the chat so both fail the same way:
    the interesting errors here (rejected key, rate limit, a thinking model that
    burns its whole budget and returns empty text) are worth reporting precisely
    exactly once.
    """
    if not settings.gemini_api_key:
        raise ExplainError("GEMINI_API_KEY is not configured")

    url = _ENDPOINT.format(model=settings.gemini_model)
    payload = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
        "generationConfig": generation_config,
    }

    try:
        # Generous timeout: this is a reasoning model and the call is user-initiated.
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"x-goog-api-key": settings.gemini_api_key},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        body = e.response.text[:300]
        logger.error("Gemini HTTP %s: %s", e.response.status_code, body)
        if e.response.status_code in (401, 403):
            raise ExplainError("Gemini rejected the API key") from e
        if e.response.status_code == 429:
            raise ExplainError("Gemini rate limit reached — try again shortly") from e
        raise ExplainError(f"Gemini returned HTTP {e.response.status_code}") from e
    except Exception as e:
        logger.error("Gemini request failed: %s", e)
        raise ExplainError(f"Gemini request failed: {e}") from e

    candidates = data.get("candidates") or []
    if not candidates:
        # A prompt-level block has no candidates at all, only feedback.
        reason = (data.get("promptFeedback") or {}).get("blockReason", "no candidates")
        raise ExplainError(f"Gemini returned no output ({reason})")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        # A thinking model that exhausts its budget returns MAX_TOKENS with the
        # visible part empty, which is otherwise a confusing silent failure.
        raise ExplainError(
            f"Gemini returned empty text (finishReason="
            f"{candidates[0].get('finishReason', 'unknown')})"
        )

    return text


async def generate_explanation(evidence: dict) -> dict:
    """Call Gemini with the evidence base and return the parsed explanation."""
    text = await _call_gemini(
        _SYSTEM_INSTRUCTION,
        [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "Explain why PM2.5 is at this level here, now.\n\n"
                            "EVIDENCE BASE:\n"
                            + json.dumps(evidence, indent=2, ensure_ascii=False)
                        )
                    }
                ],
            }
        ],
        # JSON mode, so the response is parseable without scraping code fences.
        {"temperature": 0.4, "responseMimeType": "application/json"},
    )

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Gemini returned non-JSON despite JSON mode: %s", text[:300])
        raise ExplainError("Gemini returned malformed JSON") from e


async def chat_reply(evidence: dict, messages: List[ChatMessage]) -> str:
    """
    Answer a follow-up question about this location's air quality.

    The evidence base is re-attached to the latest user turn rather than sent
    once at the start of the conversation: it is refetched every turn and the
    numbers move, so a copy pinned to the first message would have the model
    answering "has it changed?" against the reading it was already given.
    """
    if not messages or messages[-1].role != "user":
        raise ExplainError("The conversation must end with a user message")

    contents: list[dict] = [
        {"role": m.role, "parts": [{"text": m.text}]} for m in messages
    ]
    contents[-1]["parts"].append(
        {
            "text": (
                "\n\n[CURRENT EVIDENCE BASE for this location, refreshed now — "
                "answer from it, and do not quote this block back verbatim]\n"
                + json.dumps(evidence, indent=2, ensure_ascii=False)
            )
        }
    )

    return await _call_gemini(
        _CHAT_SYSTEM_INSTRUCTION,
        contents,
        # Prose, not JSON. Slightly warmer than the briefing since this is
        # conversation, but low enough that the numbers stay put.
        {"temperature": 0.6},
    )
