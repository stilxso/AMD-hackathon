export type AnalyzeResponse = {
  aqi_score: number;
  status_text: string;
  ai_confidence: number;
  dominant_pollutant: string;
  estimated_pm25?: number;
  raw_ai_pm25?: number;
  /** "nn_only" when the result is the network's own estimate, with no station
   *  blending or weather correction applied. */
  fusion_method?: string;
  stations_used?: number;
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

/** One cell of the modelled PM2.5 field. The station network is far too sparse
 *  to interpolate, so this lattice is what the density layer actually renders. */
export type GridPoint = {
  lat: number;
  lng: number;
  pm25: number;
  aqi: number;
};

/** Per-upstream outcome. "disabled" means no key was configured, "unauthorized"
 *  means the key was rejected — collapsing both to an empty list is what let a
 *  dead source look identical to a region with no monitors. */
export type SourceHealth = {
  name: string;
  status: "ok" | "empty" | "disabled" | "unauthorized" | "error";
  count: number;
  detail: string | null;
};

export type StationsResponse = {
  count: number;
  stations: Station[];
  grid: GridPoint[];
  /** Edge length of one model cell in degrees, measured from the returned
   *  lattice. Null when the grid is empty. */
  gridCellDeg: number | null;
  sources: SourceHealth[];
};

/** The account returned by /api/v1/auth/login, /register and /me. */
export type AuthUser = {
  id: number;
  username: string;
  created_at: string;
  /** Grants the location override panel. Set server-side from ADMIN_USERNAMES. */
  is_admin: boolean;
};

export type PresetLocation = {
  key: "astana" | "almaty" | "karaganda";
  label: string;
  coords: Coords;
};
