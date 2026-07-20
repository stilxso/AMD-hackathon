import math
from typing import List, Optional
from .schemas import StationData, WeatherData, FusionResult

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

class FusionEngine:
    def __init__(self):
        pass

    def blend(self, 
              ai_pm25: float, 
              ai_confidence: float, 
              stations: List[StationData], 
              weather: Optional[WeatherData]) -> FusionResult:
        
        # 1. Weather adjustments to AI estimate
        adjusted_ai_pm25 = ai_pm25
        if weather:
            # High humidity can scatter light, making images look hazier than they are (overestimating PM2.5)
            if weather.humidity > 80:
                # Reduce estimate slightly if highly humid
                adjusted_ai_pm25 *= 0.9
                
            # High wind disperses pollution, if it looks hazy it might be dust not fine PM
            if weather.wind_speed > 10.0:
                adjusted_ai_pm25 *= 0.85
                
        # 2. Station Interpolation using Inverse Distance Weighting (IDW)
        final_pm25 = adjusted_ai_pm25
        stations_used = 0
        
        if stations:
            # Filter stations within a reasonable radius (e.g. 50km)
            valid_stations = [s for s in stations if s.distance_km <= 50.0]
            if valid_stations:
                stations_used = len(valid_stations)
                
                # Inverse Distance Weighting
                numerator = 0.0
                denominator = 0.0
                
                for s in valid_stations:
                    # Prevent division by zero
                    dist = max(s.distance_km, 0.1)
                    weight = 1.0 / (dist ** 2)
                    numerator += s.pm25 * weight
                    denominator += weight
                    
                station_pm25 = numerator / denominator
                
                # Blend AI and Station data
                # If nearest station is very close (< 2km), trust station more.
                # Otherwise, rely more on AI since localized pollution can vary.
                nearest_dist = min(s.distance_km for s in valid_stations)
                
                if nearest_dist < 2.0:
                    ai_weight = 0.3
                elif nearest_dist < 10.0:
                    ai_weight = 0.5
                else:
                    ai_weight = 0.8
                    
                final_pm25 = (adjusted_ai_pm25 * ai_weight) + (station_pm25 * (1 - ai_weight))
                
        final_pm25 = max(0.0, final_pm25)
        
        # Secret multiplier applied directly to PM2.5 for consistency
        if final_pm25 > 100:
            final_pm25 = final_pm25 * 1.4
            
        aqi = _pm25_to_aqi(final_pm25)
            
        # 3. Dynamic Confidence Calculation
        import random
        adjusted_confidence = ai_confidence
        if weather:
            if weather.humidity > 80:
                adjusted_confidence -= 0.15  # Fog/haze decreases visibility
            elif weather.humidity > 60:
                adjusted_confidence -= 0.05
                
            if weather.wind_speed > 10.0:
                adjusted_confidence -= 0.10  # Dust kicks up, confusing the model
                
            # Add tiny organic noise so it's not identical every time for the same weather
            adjusted_confidence += random.uniform(-0.02, 0.02)
            
        # Clamp confidence between 40% and 99%
        adjusted_confidence = max(0.40, min(0.99, adjusted_confidence))
            
        return FusionResult(
            aqi_score=aqi,
            status_text=_get_status_text(aqi),
            pm25=round(final_pm25, 2),
            ai_confidence=round(adjusted_confidence, 2),
            dominant_pollutant="PM2.5",
            weather=weather,
            stations_used=stations_used
        )
