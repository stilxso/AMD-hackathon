export type AnalyzeResponse = {
  aqi_score: number;
  status_text: string;
  ai_confidence: number;
  dominant_pollutant: string;
};

export type Coords = { latitude: number; longitude: number };

export type PresetLocation = {
  key: "astana" | "almaty" | "karaganda";
  label: string;
  coords: Coords;
};
