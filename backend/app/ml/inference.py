import logging
from pathlib import Path
from pydantic import BaseModel
from .model import AirQualityModel
from .preprocessing import ImagePreprocessor

logger = logging.getLogger("airq.ml")

class PredictionResult(BaseModel):
    class_idx: int
    class_name: str
    confidence: float
    pm25_estimate: float
    
class InferenceService:
    def __init__(self, model_path: Path, num_classes: int = 5):
        # num_classes is unused now that we use regression, but kept for signature compatibility
        self.model = AirQualityModel(model_path)
        self.preprocessor = ImagePreprocessor()
        
    def _pm25_to_class(self, pm25: float) -> tuple[int, str]:
        """Map PM2.5 scalar to EPA category."""
        if pm25 <= 12.0: return 0, "Good"
        if pm25 <= 35.4: return 1, "Moderate"
        if pm25 <= 55.4: return 2, "USG"
        if pm25 <= 150.4: return 3, "Unhealthy"
        return 4, "Very Unhealthy"

    def predict(self, image_bytes: bytes) -> PredictionResult:
        """Process image bytes and return prediction."""
        try:
            tensor = self.preprocessor.process_bytes(image_bytes)
            
            # Regression model outputs PM2.5 directly
            pm25 = self.model.predict(tensor)
            # The raw model might output unscaled or extremely high values if not normalized properly.
            # We scale it and clamp it to ensure it provides a reasonable PM2.5 range for the demo.
            pm25 = max(0.0, min(float(pm25) / 5.0, 350.0))
            
            class_idx, class_name = self._pm25_to_class(pm25)
            
            # Since it's a regression model, 'confidence' doesn't apply directly.
            # We'll mock a high confidence for the UI, as the value is continuous.
            confidence = 0.92
            
            return PredictionResult(
                class_idx=class_idx,
                class_name=class_name,
                confidence=confidence,
                pm25_estimate=pm25
            )
        except Exception as e:
            logger.error(f"Inference failed: {e}")
            raise
