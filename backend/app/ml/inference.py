import math
import logging
from pathlib import Path
from pydantic import BaseModel
from .model import AirQualityModel
from .preprocessing import ImagePreprocessor

logger = logging.getLogger("airq.ml")

# Maps Monte-Carlo dropout spread to a confidence score: C = exp(-λ · CV).
# λ = 6 was chosen against measured behaviour of this checkpoint, whose
# coefficient of variation spans roughly 0.04 (confident) to 0.08 (uncertain)
# on sky photographs, giving a usable 0.6–0.8 range.
_CONF_UNCERTAINTY_LAMBDA: float = 6.0

# Floor on the out-of-distribution penalty so a single absurd output cannot
# drive confidence to exactly zero (which would read as a bug, not a signal).
_OOD_PENALTY_FLOOR: float = 0.05


class PredictionResult(BaseModel):
    class_idx: int
    class_name: str
    confidence: float
    pm25_estimate: float
    uncertainty: float  # std of the MC-dropout samples, in calibrated µg/m³
    out_of_distribution: bool


class InferenceService:
    def __init__(self, model_path: Path, calibration_divisor: float,
                 pm25_max: float, mc_samples: int):
        self.model = AirQualityModel(model_path)
        self.preprocessor = ImagePreprocessor()
        self.calibration_divisor = calibration_divisor
        self.pm25_max = pm25_max
        self.mc_samples = mc_samples

    def _pm25_to_class(self, pm25: float) -> tuple[int, str]:
        """Map PM2.5 scalar to EPA category (2024 revised breakpoints)."""
        if pm25 <= 9.0: return 0, "Good"
        if pm25 <= 35.4: return 1, "Moderate"
        if pm25 <= 55.4: return 2, "USG"
        if pm25 <= 125.4: return 3, "Unhealthy"
        if pm25 <= 225.4: return 4, "Very Unhealthy"
        return 5, "Hazardous"

    def predict(self, image_bytes: bytes) -> PredictionResult:
        """Process image bytes and return a PM2.5 estimate with real uncertainty."""
        tensor = self.preprocessor.process_bytes(image_bytes)

        raw_mean, raw_std = self.model.predict_with_uncertainty(tensor, self.mc_samples)
        logger.debug("[MODEL_PREDICTION] raw_mean=%.4f raw_std=%.4f", raw_mean, raw_std)

        # Convert the raw head output to µg/m³ using the empirical calibration
        # constant (see config.pm25_calibration_divisor for its caveats).
        uncalibrated = raw_mean / self.calibration_divisor
        pm25 = max(0.0, min(uncalibrated, self.pm25_max))
        uncertainty = raw_std / self.calibration_divisor

        # ── Confidence signal 1: Monte-Carlo dropout spread ──
        # A wide spread across stochastic passes means the head is not settled
        # on these features.
        cv = raw_std / max(abs(raw_mean), 1e-6)
        confidence = math.exp(-_CONF_UNCERTAINTY_LAMBDA * cv)

        # ── Confidence signal 2: out-of-distribution magnitude ──
        # MC spread alone does not catch OOD input — random noise yields a
        # confident-looking CV alongside a physically impossible estimate.
        # An output that had to be clamped is direct evidence the image is
        # outside anything the model was trained on.
        out_of_distribution = uncalibrated > self.pm25_max or uncalibrated < 0.0
        if out_of_distribution:
            penalty = max(_OOD_PENALTY_FLOOR, self.pm25_max / max(uncalibrated, 1e-6))
            confidence *= penalty
            logger.warning(
                "[MODEL_PREDICTION] out-of-distribution: uncalibrated=%.1f µg/m³ "
                "exceeds max=%.1f — confidence penalised by %.3f",
                uncalibrated, self.pm25_max, penalty,
            )

        confidence = max(0.0, min(confidence, 1.0))
        class_idx, class_name = self._pm25_to_class(pm25)

        logger.debug(
            "[MODEL_PREDICTION] pm25=%.2f | uncertainty=±%.2f | cv=%.4f | "
            "confidence=%.3f | class=%s | ood=%s",
            pm25, uncertainty, cv, confidence, class_name, out_of_distribution,
        )

        return PredictionResult(
            class_idx=class_idx,
            class_name=class_name,
            confidence=confidence,
            pm25_estimate=pm25,
            uncertainty=uncertainty,
            out_of_distribution=out_of_distribution,
        )
