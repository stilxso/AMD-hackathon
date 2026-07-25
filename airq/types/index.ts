export type AnalyzeResponse = {
  aqi_score: number;
  status_text: string;
  ai_confidence: number;
  dominant_pollutant: string;
  estimated_pm25?: number;
  raw_ai_pm25?: number;
};

export type Coords = { latitude: number; longitude: number };

/** A reading from /api/v1/stations. `kind` separates physical monitors from
 *  modelled grid values, which are what cover areas with no monitor. */
export type Station = {
  lat: number;
  lng: number;
  pm25: number;
  aqi: number;
  distanceKm: number;
  name: string;
  source: string;
  kind: "sensor" | "model";
};

export type StationsResponse = { count: number; stations: Station[] };

export type PresetLocation = {
  key: "astana" | "almaty" | "karaganda";
  label: string;
  coords: Coords;
};
