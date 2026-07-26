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

/** How a candidate was obtained: the plain A→B route, one of Mapbox's own
 *  alternatives, or a detour the backend forced through an offset via-point. */
export type RouteKind = "direct" | "alternative" | "detour";

export type PlannedRoute = {
  kind: RouteKind;
  /** [lng, lat] pairs, GeoJSON order. */
  geometry: [number, number][];
  distanceKm: number;
  durationMin: number;
  meanPm25: number;
  maxPm25: number;
  aqi: number;
  /** PM2.5 integrated over the time on the route, µg·min/m³ — what the routes
   *  are actually ranked by, since a longer clean route still costs breaths. */
  exposure: number;
};

export type RouteResponse = {
  profile: RouteProfile;
  routes: PlannedRoute[];
  recommendedIndex: number;
  shortestIndex: number;
  exposureReductionPct: number;
  extraDistanceKm: number;
  extraMinutes: number;
  /** False when every candidate scores within ~1 µg/m³ of the others, i.e. the
   *  data cannot tell them apart and the recommendation is just the shortest.
   *  Never present a detour as worthwhile without this. */
  differentiated: boolean;
  sensorCount: number;
  /** Resolution of the modelled field behind the scores, in km. */
  gridCellKm: number | null;
};

export type RouteProfile = "walking" | "cycling";

/** One turn of the explanation chat. "model" rather than "assistant" because
 *  the transcript is replayed to Gemini verbatim, in its role vocabulary. */
export type ChatTurn = {
  role: "user" | "model";
  text: string;
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
