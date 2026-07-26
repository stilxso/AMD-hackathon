import type { Coords, PlannedRoute, RouteProfile, RouteResponse } from "@/types";

/** Which line a candidate gets on the map. */
export type RouteRole = "recommended" | "shortest" | "other";

export async function planRoute(
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  start: Coords,
  end: Coords,
  profile: RouteProfile,
  signal?: AbortSignal,
): Promise<RouteResponse> {
  const res = await authFetch("/api/v1/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      start: { lat: start.latitude, lng: start.longitude },
      end: { lat: end.latitude, lng: end.longitude },
      profile,
    }),
  });

  if (!res.ok) {
    // The backend says *why* in `detail` — a missing Mapbox token (503) and
    // "no route between these points" (502) need different reactions from the
    // user, and "HTTP 502" tells them neither.
    const detail = await res
      .json()
      .then((b) => (typeof b?.detail === "string" ? b.detail : null))
      .catch(() => null);
    throw new Error(detail ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as RouteResponse;
}

export function roleOf(index: number, r: RouteResponse): RouteRole {
  // Recommended wins the tie: when the shortest route is also the cleanest
  // there is one line, not two stacked on identical coordinates.
  if (index === r.recommendedIndex) return "recommended";
  if (index === r.shortestIndex) return "shortest";
  return "other";
}

/**
 * Candidates as one collection, tagged with the role each line draws in.
 *
 * Every candidate is drawn, not only the winner: the rejected detours are what
 * make the recommendation legible — seeing the route that swings through the
 * dirtier side of town is the argument for the one that doesn't.
 */
export function routesToGeoJSON(r: RouteResponse): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: r.routes.map((route: PlannedRoute, i) => ({
      type: "Feature",
      properties: {
        role: roleOf(i, r),
        aqi: route.aqi,
        pm25: route.meanPm25,
        distanceKm: route.distanceKm,
      },
      geometry: { type: "LineString", coordinates: route.geometry },
    })),
  };
}
