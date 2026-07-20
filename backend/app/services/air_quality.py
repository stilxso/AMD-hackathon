import math
import logging
import httpx
from typing import List
from .schemas import StationData
from app.config import settings

logger = logging.getLogger("airq.services.aq")

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points."""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

class WaqiClient:
    def __init__(self, token: str):
        self.token = token
        self.base_url = "https://api.waqi.info/feed"

    async def get_nearest(self, lat: float, lng: float) -> List[StationData]:
        if not self.token:
            return []
            
        url = f"{self.base_url}/geo:{lat};{lng}/?token={self.token}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                
                if data.get("status") != "ok":
                    logger.warning(f"WAQI returned status: {data.get('status')}")
                    return []
                    
                d = data.get("data", {})
                
                # Extract PM2.5 (might not be available at all stations)
                iaqi = d.get("iaqi", {})
                pm25_data = iaqi.get("pm25")
                if not pm25_data:
                    return []
                    
                pm25_val = float(pm25_data.get("v", 0))
                
                city = d.get("city", {})
                geo = city.get("geo", [0, 0])
                if len(geo) != 2:
                    return []
                    
                st_lat, st_lng = float(geo[0]), float(geo[1])
                name = city.get("name", "Unknown Station")
                
                dist = haversine(lat, lng, st_lat, st_lng)
                
                return [StationData(
                    lat=st_lat,
                    lng=st_lng,
                    pm25=pm25_val,
                    distance_km=dist,
                    name=name,
                    source="waqi"
                )]
        except Exception as e:
            logger.error(f"WAQI API error: {e}")
            return []

class OpenAQClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openaq.org/v3/locations"

    async def get_nearby(self, lat: float, lng: float, radius_km: int = 50) -> List[StationData]:
        if not self.api_key:
            return []
            
        radius_m = radius_km * 1000
        # parameter_id 2 is PM2.5
        url = f"{self.base_url}?coordinates={lat},{lng}&radius={radius_m}&parameters_id=2"
        headers = {"X-API-Key": self.api_key}
        
        stations = []
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                
                results = data.get("results", [])
                for r in results:
                    coords = r.get("coordinates", {})
                    st_lat = coords.get("latitude")
                    st_lng = coords.get("longitude")
                    
                    if st_lat is None or st_lng is None:
                        continue
                        
                    # Find PM2.5 sensor reading
                    sensors = r.get("sensors", [])
                    pm25_val = None
                    for s in sensors:
                        p = s.get("parameter", {})
                        if p.get("id") == 2:
                            # In v3, latest value might be in latest object
                            latest = s.get("latest", {})
                            if "value" in latest:
                                pm25_val = float(latest["value"])
                            break
                            
                    if pm25_val is None:
                        continue
                        
                    dist = haversine(lat, lng, st_lat, st_lng)
                    name = r.get("name", "Unknown OpenAQ")
                    
                    stations.append(StationData(
                        lat=st_lat,
                        lng=st_lng,
                        pm25=pm25_val,
                        distance_km=dist,
                        name=name,
                        source="openaq"
                    ))
        except Exception as e:
            logger.error(f"OpenAQ API error: {e}")
            
        return stations

async def fetch_all_stations(lat: float, lng: float) -> List[StationData]:
    """Fetch from both sources and combine."""
    waqi = WaqiClient(settings.waqi_api_token)
    openaq = OpenAQClient(settings.openaq_api_key)
    
    import asyncio
    w_res, o_res = await asyncio.gather(
        waqi.get_nearest(lat, lng),
        openaq.get_nearby(lat, lng),
        return_exceptions=True
    )
    
    stations = []
    if isinstance(w_res, list): stations.extend(w_res)
    if isinstance(o_res, list): stations.extend(o_res)
    
    # Sort by distance
    stations.sort(key=lambda x: x.distance_km)
    
    # Deduplicate rough coordinates
    seen = set()
    unique = []
    for s in stations:
        key = (round(s.lat, 3), round(s.lng, 3))
        if key not in seen:
            seen.add(key)
            unique.append(s)
            
    return unique
