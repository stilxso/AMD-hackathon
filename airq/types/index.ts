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
  /** Row id of the scan in the user's history. Null when the write failed —
   *  history is a side effect of an analysis, never a precondition for one. */
  analysis_id?: number | null;
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
  /** WAQI station id, when the feed publishes one. Required by
   *  /api/v1/stations/detail; null for modelled points, which are not monitors. */
  uid: string | null;
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

// ── Personal cabinet ──────────────────────────────────────────────────

/** One past scan, as the owner sees it. Includes the model diagnostics that
 *  the community view deliberately omits. */
export type AnalysisRecord = {
  id: number;
  createdAt: string;
  latitude: number;
  longitude: number;
  aqi: number;
  pm25: number;
  rawAiPm25: number | null;
  uncertainty: number | null;
  confidence: number | null;
  skyScore: number | null;
  statusText: string | null;
  fusionMethod: string | null;
  stationsUsed: number;
  place: string | null;
  isPublic: boolean;
  hasThumbnail: boolean;
  /** Needs the bearer token — render it through an authorised blob fetch, not
   *  a bare <img src>, which the browser sends without the Authorization header. */
  thumbnailUrl: string | null;
};

export type AnalysesResponse = {
  total: number;
  count: number;
  limit: number;
  offset: number;
  analyses: AnalysisRecord[];
};

export type CabinetStats = {
  analyses: number;
  shared_analyses: number;
  reports: number;
  saved_locations: number;
  /** Null on a fresh account — no scans means no average, which is not zero. */
  avg_aqi: number | null;
  worst_aqi: number | null;
  best_aqi: number | null;
  last_analysis_at: string | null;
};

export type TrendPoint = { at: string; aqi: number; pm25: number };

export type CabinetProfile = {
  user: AuthUser;
  stats: CabinetStats;
  /** Oldest-first, for the sparkline. */
  trend: TrendPoint[];
};

export type SavedLocation = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  createdAt: string;
};

// ── Crowdsourcing ─────────────────────────────────────────────────────

/** How a reporter judges the air. Ordered worst-last, matching the backend. */
export type PerceivedLevel = "good" | "moderate" | "poor" | "severe";

export const PERCEIVED_LEVELS: PerceivedLevel[] = ["good", "moderate", "poor", "severe"];

export type CommunityReport = {
  id: number;
  username: string;
  createdAt: string;
  latitude: number;
  longitude: number;
  perceived: PerceivedLevel;
  visibilityKm: number | null;
  symptoms: string[];
  note: string | null;
};

/** A scan its owner published. Narrower than AnalysisRecord on purpose: the
 *  model diagnostics are for the person who took the photo, not for the map. */
export type SharedAnalysis = {
  id: number;
  username: string;
  createdAt: string;
  latitude: number;
  longitude: number;
  aqi: number;
  pm25: number;
  statusText: string | null;
  place: string | null;
  thumbnailUrl: string | null;
};

export type CommunitySummary = {
  hours: number;
  reports: number;
  sharedAnalyses: number;
  perceived: Record<PerceivedLevel, number>;
  /** Most-reported level, ties resolving to the more severe side. Null with no
   *  reports — do not render it as "good". */
  consensus: PerceivedLevel | null;
  meanVisibilityKm: number | null;
  sharedMeanPm25: number | null;
  sharedMeanAqi: number | null;
};

// ── Station lookups ───────────────────────────────────────────────────

export type StationSearchResult = {
  uid: string;
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  /** Null for a monitor that is currently offline — WAQI reports "-". */
  aqi: number | null;
  pm25: number | null;
  updatedAt: string | null;
};

export type StationDetail = {
  uid: string;
  name: string;
  url: string | null;
  lat: number | null;
  lng: number | null;
  aqi: number | null;
  pm25: number | null;
  dominantPollutant: string | null;
  updatedAt: string | null;
  /** Sub-indices, not concentrations — except pm25, which is converted. */
  pollutants: Record<string, number>;
  weather: Record<string, number>;
  attribution: Array<{ name: string | null; url: string | null }>;
  forecast: Record<string, Array<{ day: string; avg: number; min: number; max: number }>>;
};

export type HistoryPoint = {
  at: string;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  aqi: number | null;
};

/** Modelled, not measured — the station feeds publish only a current value.
 *  Anything showing this next to a monitor reading has to say so. */
export type StationHistory = {
  latitude: number;
  longitude: number;
  source: string;
  kind: "model";
  count: number;
  hours: HistoryPoint[];
  summary: {
    meanPm25: number | null;
    maxPm25: number | null;
    minPm25: number | null;
    meanAqi: number | null;
  };
};
