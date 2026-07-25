import math
import logging
from typing import List, Optional
from .schemas import StationData, WeatherData, FusionResult

logger = logging.getLogger("airq.services.fusion")

# ─── Physical / Tuning Constants ─────────────────────────────────────────────
# Weather correction (exponential)
_HUMIDITY_ONSET: float = 60.0        # % RH where correction begins
_HUMIDITY_LAMBDA: float = 0.008      # decay rate per % above onset
_WIND_LAMBDA: float = 0.015          # rate per m/s away from the reference
_WIND_REFERENCE: float = 3.0         # m/s – typical mixing conditions
#
# The pressure term (P / 1013.25) was removed: across real weather it spans
# roughly 0.97–1.03, a ±3% nudge sitting beside humidity and wind terms worth
# ±30%. It added a tunable parameter without contributing usable signal.

# Station blending (sigmoid)
_SIGMOID_K: float = 0.5              # steepness of the logistic curve
_SIGMOID_D0: float = 5.0             # km – midpoint (equal AI / station trust)
_STATION_RADIUS_KM: float = 50.0     # max station range for IDW
# Lower bound on the AI weight. Unfloored, the logistic term drops to ~0.08
# whenever a monitor sits close, so in a well-monitored city the uploaded photo
# moved the result barely at all and every scan returned roughly the station
# reading. The floor keeps the vision estimate materially represented at any
# distance while still letting nearby monitors carry the majority.
_AI_WEIGHT_FLOOR: float = 0.35
_IDW_POWER: float = 2.0              # inverse-distance weighting exponent
_IDW_MIN_DIST: float = 0.1           # km – prevents division by zero

# Weight given to the AI estimate when only modelled (reanalysis) data is
# available. A model value sits on the query coordinate, so routing it through
# _sigmoid_ai_weight would score it d≈0 — the "monitor in the same street"
# case — and suppress the vision model to ~8%. It deserves neither that trust
# nor none at all: it is an independent estimate on an ~11 km grid that cannot
# see local sources, so the two are weighted equally.
_MODEL_AI_WEIGHT: float = 0.5

# Confidence model
_CONF_HUMIDITY_BETA: float = 0.005   # confidence decay per excess %RH
_CONF_WIND_BETA: float = 0.01        # confidence decay per m/s
_CONF_STATION_GAMMA_MAX: float = 0.15  # max corroboration bonus (saturating)
_CONF_STATION_SCALE: float = 3.0     # stations at which ~63% of bonus is earned
_CONF_AGREEMENT_BONUS: float = 0.10  # max bonus when AI ≈ station estimate
_CONF_AGREEMENT_THRESHOLD: float = 0.20  # relative error threshold for bonus
# The floor must stay reachable. The previous 0.40 was dead code: with a
# hard-coded 0.92 base it required ~166% RH or ~83 m/s wind to trigger.
# Confidence now starts from measured model uncertainty, which genuinely
# approaches zero on out-of-distribution input.
_CONF_MIN: float = 0.05
_CONF_MAX: float = 0.95
# ──────────────────────────────────────────────────────────────────────────────


# EPA PM2.5 breakpoints, May 2024 NAAQS revision: (C_low, C_high, I_low, I_high).
# The revision lowered the Good ceiling from 12.0 to 9.0 µg/m³ and rescaled the
# upper categories — the pre-2024 table reported 9.1–12.0 µg/m³ as "Good" when
# it is now "Moderate".
_PM25_BREAKPOINTS = [
    (0.0, 9.0, 0, 50),
    (9.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 125.4, 151, 200),
    (125.5, 225.4, 201, 300),
    (225.5, 325.4, 301, 500),
]


def pm25_to_aqi(pm25: float) -> int:
    """Calculate US EPA AQI from PM2.5 concentration."""
    pm = round(pm25, 1)
    for clow, chigh, ilow, ihigh in _PM25_BREAKPOINTS:
        if clow <= pm <= chigh:
            return int(round(((ihigh - ilow) / (chigh - clow)) * (pm - clow) + ilow))

    if pm > 325.4: return 500
    return 0


def aqi_to_pm25(aqi: float) -> float:
    """
    Invert the EPA piecewise-linear curve to recover a PM2.5 concentration.

    Needed because some feeds publish only a station's composite AQI. That
    composite is driven by whichever pollutant scores highest, so when PM2.5 is
    not the dominant one this over-estimates the particulate concentration.
    Prefer a directly reported pm25 value whenever a feed offers one.
    """
    a = max(0.0, min(500.0, aqi))
    for clow, chigh, ilow, ihigh in _PM25_BREAKPOINTS:
        if ilow <= a <= ihigh:
            return ((chigh - clow) / (ihigh - ilow)) * (a - ilow) + clow
    return 325.4

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

    α_h = exp(-λ_h · max(0, H − H₀))      humidity: haze inflates the estimate
    α_w = exp(-λ_w · (W − W_ref))         wind: relative to typical mixing

    The wind term is centred on a reference speed rather than on zero. Anchored
    at zero it could only ever reduce the estimate, so stagnant air — precisely
    when particulates accumulate — received no correction at all. Centred, calm
    conditions raise the estimate slightly and strong winds lower it.
    """
    if weather is None:
        return pm25

    alpha_h = math.exp(-_HUMIDITY_LAMBDA * max(0.0, weather.humidity - _HUMIDITY_ONSET))
    alpha_w = math.exp(-_WIND_LAMBDA * (weather.wind_speed - _WIND_REFERENCE))

    corrected = pm25 * alpha_h * alpha_w

    logger.debug(
        "[FUSION] weather_correction: α_h=%.4f (H=%.1f%%) | α_w=%.4f (W=%.1f m/s) | "
        "pm25 %.2f → %.2f",
        alpha_h, weather.humidity,
        alpha_w, weather.wind_speed,
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

    w = max(w_floor, 1 / (1 + exp(-k · (d − d₀))))

    Close station (d=0)   ⇒  w_ai = floor  (station leads, photo still counts)
    Midpoint      (d=d₀)  ⇒  w_ai = 0.50
    d = 10 km             ⇒  w_ai ≈ 0.92  (trust AI)
    Far station   (d→∞)   ⇒  w_ai → 1.00  (station contributes nothing)
    """
    w = 1.0 / (1.0 + math.exp(-_SIGMOID_K * (nearest_distance_km - _SIGMOID_D0)))
    w = max(_AI_WEIGHT_FLOOR, w)
    logger.debug(
        "[FUSION] sigmoid_ai_weight: nearest_dist=%.2f km | w_ai=%.4f | w_station=%.4f",
        nearest_distance_km, w, 1.0 - w,
    )
    return w


def _composite_confidence(
    base_confidence: float,
    weather: Optional[WeatherData],
    stations_used: int,
    ai_pm25: float,
    station_pm25: Optional[float],
) -> float:
    """
    Multi-factor confidence model.

    C = C_model · exp(-β_h · ΔH) · exp(-β_w · W) · β_stations · agreement_bonus

    Factors:
      - C_model is the measured Monte-Carlo dropout confidence of the vision
        model, penalised for out-of-distribution input. This is the term that
        carries actual information about whether the *image* was readable.
      - Weather degradation (humidity, wind) reduces confidence continuously
      - Station corroboration increases confidence, saturating so that a dense
        station network cannot pin the output at the ceiling
      - AI-station agreement gives a bonus when estimates converge

    Deliberately not called "Bayesian": there is no prior, likelihood or
    posterior here. It is a bounded multiplicative heuristic, and naming it
    accurately keeps that visible.
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

    # ── Station corroboration (saturating) ──
    # Previously 1 + 0.03·S, unbounded: ten nearby stations produced a 1.30×
    # multiplier that pushed almost every result to the clamp ceiling. The
    # exponential form caps the total corroboration bonus at γ_max, so extra
    # stations add sharply diminishing returns rather than saturating the score.
    station_factor = 1.0 + _CONF_STATION_GAMMA_MAX * (
        1.0 - math.exp(-stations_used / _CONF_STATION_SCALE)
    )
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
        # Only physical sensors are interpolated. Modelled grid values are held
        # back as a fallback: they report at the query coordinate, so mixing
        # them into IDW would give them a near-infinite inverse-distance weight
        # and drown out every real monitor.
        sensors = [s for s in stations if s.kind == "sensor"]
        models = [s for s in stations if s.kind == "model"]

        station_pm25 = _station_idw(sensors)
        valid_stations = [s for s in sensors if s.distance_km <= _STATION_RADIUS_KM]
        # Corroboration is a property of independent physical monitors, so the
        # confidence model counts sensors only — never the model fallback.
        sensor_count = len(valid_stations)

        # ── Step 3: Sigmoid-weighted AI ↔ Station blending ──
        if station_pm25 is not None and valid_stations:
            nearest_dist = min(s.distance_km for s in valid_stations)
            w_ai = _sigmoid_ai_weight(nearest_dist)
            final_pm25 = adjusted_ai_pm25 * w_ai + station_pm25 * (1.0 - w_ai)
            logger.debug(
                "[FUSION] blended: ai_adj=%.2f × %.4f + station=%.2f × %.4f = %.2f",
                adjusted_ai_pm25, w_ai, station_pm25, 1.0 - w_ai, final_pm25,
            )
        elif models:
            # No monitor in range — fall back to the modelled estimate rather
            # than the image alone. This is the case that used to leave large
            # areas uncovered.
            station_pm25 = sum(m.pm25 for m in models) / len(models)
            valid_stations = models
            w_ai = _MODEL_AI_WEIGHT
            final_pm25 = adjusted_ai_pm25 * w_ai + station_pm25 * (1.0 - w_ai)
            logger.debug(
                "[FUSION] no sensors in range — %d model source(s): ai_adj=%.2f × %.2f "
                "+ model=%.2f × %.2f = %.2f",
                len(models), adjusted_ai_pm25, w_ai, station_pm25, 1.0 - w_ai, final_pm25,
            )
        else:
            final_pm25 = adjusted_ai_pm25
            logger.debug("[FUSION] no station or model data — using AI estimate only: %.2f", final_pm25)

        final_pm25 = max(0.0, final_pm25)

        # ── Step 4: AQI mapping ──
        aqi = pm25_to_aqi(final_pm25)

        # ── Step 5: Composite confidence ──
        adjusted_confidence = _composite_confidence(
            base_confidence=ai_confidence,
            weather=weather,
            stations_used=sensor_count,
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
            # Readings that actually contributed to the blend — sensors when
            # any were in range, otherwise the model sources that replaced them.
            stations_used=len(valid_stations),
            # Returned so the API cannot report a station the fusion excluded.
            contributing_stations=valid_stations,
            fusion_method="composite_exponential_v2",
        )
