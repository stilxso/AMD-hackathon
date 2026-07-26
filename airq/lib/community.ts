import type {
  CommunityReport,
  CommunitySummary,
  PerceivedLevel,
  SharedAnalysis,
} from "@/types";

import type { AuthFetch } from "@/lib/cabinet";

export type Box = { minLat: number; minLng: number; maxLat: number; maxLng: number };

function boxParams(box: Box, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    min_lat: box.minLat.toFixed(4),
    min_lng: box.minLng.toFixed(4),
    max_lat: box.maxLat.toFixed(4),
    max_lng: box.maxLng.toFixed(4),
    ...extra,
  });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b) => (typeof b?.detail === "string" ? b.detail : null))
      .catch(() => null);
    throw new Error(detail ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export type NewReport = {
  latitude: number;
  longitude: number;
  perceived: PerceivedLevel;
  visibilityKm?: number | null;
  symptoms?: string[];
  note?: string | null;
};

/** Filing a report needs an account — every pin on the public map has an author. */
export async function submitReport(authFetch: AuthFetch, report: NewReport) {
  return json<CommunityReport>(
    await authFetch("/api/v1/community/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: report.latitude,
        longitude: report.longitude,
        perceived: report.perceived,
        visibility_km: report.visibilityKm ?? null,
        symptoms: report.symptoms ?? [],
        note: report.note ?? null,
      }),
    }),
  );
}

export async function deleteReport(authFetch: AuthFetch, id: number): Promise<void> {
  const res = await authFetch(`/api/v1/community/reports/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Reading the community layer is unauthenticated, like /stations — the map
// draws it before anyone signs in, so these take a plain fetch.

export async function fetchReports(box: Box, hours = 24, signal?: AbortSignal) {
  const data = await json<{ reports: CommunityReport[] }>(
    await fetch(`/api/v1/community/reports?${boxParams(box, { hours: String(hours) })}`, { signal }),
  );
  return data.reports;
}

export async function fetchSharedAnalyses(box: Box, hours = 48, signal?: AbortSignal) {
  const data = await json<{ analyses: SharedAnalysis[] }>(
    await fetch(`/api/v1/community/analyses?${boxParams(box, { hours: String(hours) })}`, { signal }),
  );
  return data.analyses;
}

export async function fetchSummary(box: Box, hours = 24, signal?: AbortSignal) {
  return json<CommunitySummary>(
    await fetch(`/api/v1/community/summary?${boxParams(box, { hours: String(hours) })}`, { signal }),
  );
}

/**
 * Map colour for a perceived level.
 *
 * Deliberately the map's green→red ramp rather than the page's density ramp:
 * these pins sit over the basemap next to the station dots, and a white pin is
 * the one colour that disappears into roads and labels there.
 */
export const PERCEIVED_COLOR: Record<PerceivedLevel, string> = {
  good: "#12c06a",
  moderate: "#f2c200",
  poor: "#ff8a00",
  severe: "#ff3b30",
};
