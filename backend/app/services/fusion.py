import math
import logging
from typing import List, Optional
from .schemas import StationData, WeatherData, FusionResult

logger = logging.getLogger("airq.services.fusion")

# ─── Physical / Tuning Constants ─────────────────────────────────────────────
# Weather correction (exponential decay)
_HUMIDITY_ONSET: float = 60.0        # % RH where correction begins
_HUMIDITY_LAMBDA: float = 0.008      # decay rate per % above onset
_WIND_LAMBDA: float = 0.015          # decay rate per m/s
_STD_PRESSURE: float = 1013.25       # hPa, standard atmosphere

# Station blending (sigmoid)
_SIGMOID_K: float = 0.5              # steepness of the logistic curve
_SIGMOID_D0: float = 5.0             # km – midpoint (equal AI / station trust)
_STATION_RADIUS_KM: float = 50.0     # max station range for IDW
_IDW_POWER: float = 2.0              # inverse-distance weighting exponent
_IDW_MIN_DIST: float = 0.1           # km – prevents division by zero

# Confidence model
_CONF_HUMIDITY_BETA: float = 0.005   # confidence decay per excess %RH
_CONF_WIND_BETA: float = 0.01        # confidence decay per m/s
_CONF_STATION_GAMMA: float = 0.03    # corroboration bonus per station
_CONF_AGREEMENT_BONUS: float = 0.10  # max bonus when AI ≈ station estimate
_CONF_AGREEMENT_THRESHOLD: float = 0.20  # relative error threshold for bonus
_CONF_MIN: float = 0.40
_CONF_MAX: float = 0.99
# ──────────────────────────────────────────────────────────────────────────────


def _pm25_to_aqi(pm25: float) -> int:
    """Calculate US EPA AQI from PM2.5 concentration."""
    breakpoints = [
        (0.0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500)
    ]

    pm = round(pm25, 1)
    for clow, chigh, ilow, ihigh in breakpoints:
        if clow <= pm <= chigh:
            return int(round(((ihigh - ilow) / (chigh - clow)) * (pm - clow) + ilow))

    if pm > 500.4: return 500
    return 0

def _get_status_text(aqi: int) -> str:
    if aqi <= 50: return "Good"
    if aqi <= 100: return "Moderate"
    if aqi <= 150: return "Unhealthy for Sensitive Groups"
    if aqi <= 200: return "Unhealthy"
    if aqi <= 300: return "Very Unhealthy"
    return "Hazardous"


# ─── Mathematical Helper Functions ───────────────────────────────────────────

def _weather_correction(pm25: float, weather: Optional[WeatherData]) -> float:
    """
    Apply continuous exponential weather correction.

    α_h = exp(-λ_h · max(0, H − H₀))     humidity: overcorrects hazy images
    α_w = exp(-λ_w · W)                   wind: disperses particulates
    α_p = P / P₀                           pressure: concentrates / disperses
    """
    if weather is None:
        return pm25

    alpha_h = math.exp(-_HUMIDITY_LAMBDA * max(0.0, weather.humidity - _HUMIDITY_ONSET))
    alpha_w = math.exp(-_WIND_LAMBDA * weather.wind_speed)
    alpha_p = weather.pressure / _STD_PRESSURE

    corrected = pm25 * alpha_h * alpha_w * alpha_p

    logger.debug(
        "[FUSION] weather_correction: α_h=%.4f (H=%.1f%%) | α_w=%.4f (W=%.1f m/s) | "
        "α_p=%.4f (P=%.1f hPa) | pm25 %.2f → %.2f",
        alpha_h, weather.humidity,
        alpha_w, weather.wind_speed,
        alpha_p, weather.pressure,
        pm25, corrected,
    )
    return corrected


def _station_idw(stations: List[StationData]) -> Optional[float]:
    """
    Inverse Distance Weighting interpolation of station PM2.5 readings.

    ŷ = Σ(w_i · y_i) / Σ(w_i)   where  w_i = 1 / d_i^p
    """
    valid = [s for s in stations if s.distance_km <= _STATION_RADIUS_KM]
    if not valid:
        return None

    numerator = 0.0
    denominator = 0.0
    for s in valid:
        d = max(s.distance_km, _IDW_MIN_DIST)
        w = 1.0 / (d ** _IDW_POWER)
        numerator += s.pm25 * w
        denominator += w

    idw_pm25 = numerator / denominator
    logger.debug(
        "[FUSION] station_idw: %d stations within %.0f km | idw_pm25=%.2f",
        len(valid), _STATION_RADIUS_KM, idw_pm25,
    )
    return idw_pm25


def _sigmoid_ai_weight(nearest_distance_km: float) -> float:
    """
    Smooth logistic AI trust weight based on nearest station distance.

    w_ai = 1 / (1 + exp(-k · (d − d₀)))

    Close station (d→0)  ⇒  w_ai ≈ 0.08  (trust station)
    Far station   (d→∞)  ⇒  w_ai ≈ 0.92  (trust AI)
    Midpoint      (d=d₀) ⇒  w_ai = 0.50
    """
    w = 1.0 / (1.0 + math.exp(-_SIGMOID_K * (nearest_distance_km - _SIGMOID_D0)))
    logger.debug(
        "[FUSION] sigmoid_ai_weight: nearest_dist=%.2f km | w_ai=%.4f | w_station=%.4f",
        nearest_distance_km, w, 1.0 - w,
    )
    return w


def _bayesian_confidence(
    base_confidence: float,
    weather: Optional[WeatherData],
    stations_used: int,
    ai_pm25: float,
    station_pm25: Optional[float],
) -> float:
    """
    Bayesian-inspired multi-factor confidence model.

    C = C_base · exp(-β_h · ΔH) · exp(-β_w · W) · (1 + γ · S) · agreement_bonus

    Factors:
      - Weather degradation (humidity, wind) reduces confidence continuously
      - Station corroboration increases confidence with more data sources
      - AI-station agreement gives a bonus when estimates converge
    """
    c = base_confidence

    # ── Weather degradation ──
    if weather is not None:
        humidity_factor = math.exp(
            -_CONF_HUMIDITY_BETA * max(0.0, weather.humidity - _HUMIDITY_ONSET)
        )
        wind_factor = math.exp(-_CONF_WIND_BETA * weather.wind_speed)
        c *= humidity_factor * wind_factor
        logger.debug(
            "[FUSION] confidence: humidity_factor=%.4f | wind_factor=%.4f",
            humidity_factor, wind_factor,
        )

    # ── Station corroboration ──
    station_factor = 1.0 + _CONF_STATION_GAMMA * stations_used
    c *= station_factor

    # ── AI-station agreement bonus ──
    agreement_bonus = 1.0
    if station_pm25 is not None and station_pm25 > 0:
        relative_error = abs(ai_pm25 - station_pm25) / station_pm25
        if relative_error < _CONF_AGREEMENT_THRESHOLD:
            # Linear interpolation: full bonus at 0% error, zero bonus at threshold
            agreement_bonus = 1.0 + _CONF_AGREEMENT_BONUS * (
                1.0 - relative_error / _CONF_AGREEMENT_THRESHOLD
            )
        logger.debug(
            "[FUSION] confidence: relative_error=%.4f | agreement_bonus=%.4f",
            relative_error, agreement_bonus,
        )
    c *= agreement_bonus

    c = max(_CONF_MIN, min(_CONF_MAX, c))
    logger.debug(
        "[FUSION] confidence: base=%.2f | stations=%d | final=%.4f",
        base_confidence, stations_used, c,
    )
    return round(c, 2)


# ─── Fusion Engine ───────────────────────────────────────────────────────────

class FusionEngine:
    def __init__(self):
        pass

    def blend(self,
              ai_pm25: float,
              ai_confidence: float,
              stations: List[StationData],
              weather: Optional[WeatherData]) -> FusionResult:

        logger.debug(
            "[FUSION] ── blend start ── ai_pm25=%.2f | ai_confidence=%.2f | "
            "stations=%d | weather=%s",
            ai_pm25, ai_confidence, len(stations),
            "present" if weather else "absent",
        )

        # ── Step 1: Continuous weather correction on AI estimate ──
        adjusted_ai_pm25 = _weather_correction(ai_pm25, weather)

        # ── Step 2: Station IDW interpolation ──
        station_pm25 = _station_idw(stations)
        valid_stations = [s for s in stations if s.distance_km <= _STATION_RADIUS_KM]
        stations_used = len(valid_stations)

        # ── Step 3: Sigmoid-weighted AI ↔ Station blending ──
        if station_pm25 is not None and valid_stations:
            nearest_dist = min(s.distance_km for s in valid_stations)
            w_ai = _sigmoid_ai_weight(nearest_dist)
            final_pm25 = adjusted_ai_pm25 * w_ai + station_pm25 * (1.0 - w_ai)
            logger.debug(
                "[FUSION] blended: ai_adj=%.2f × %.4f + station=%.2f × %.4f = %.2f",
                adjusted_ai_pm25, w_ai, station_pm25, 1.0 - w_ai, final_pm25,
            )
        else:
            final_pm25 = adjusted_ai_pm25
            logger.debug("[FUSION] no valid stations — using AI estimate only: %.2f", final_pm25)

        final_pm25 = max(0.0, final_pm25)

        # ── Step 4: AQI mapping ──
        aqi = _pm25_to_aqi(final_pm25)

        # ── Step 5: Bayesian confidence ──
        adjusted_confidence = _bayesian_confidence(
            base_confidence=ai_confidence,
            weather=weather,
            stations_used=stations_used,
            ai_pm25=adjusted_ai_pm25,
            station_pm25=station_pm25,
        )

        logger.debug(
            "[FUSION] ── blend done ── pm25=%.2f | aqi=%d | confidence=%.2f",
            final_pm25, aqi, adjusted_confidence,
        )

        return FusionResult(
            aqi_score=aqi,
            status_text=_get_status_text(aqi),
            pm25=round(final_pm25, 2),
            ai_confidence=adjusted_confidence,
            dominant_pollutant="PM2.5",
            weather=weather,
            stations_used=stations_used,
            fusion_method="bayesian_exponential_v1",
        )
