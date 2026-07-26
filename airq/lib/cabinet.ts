import type {
  AnalysesResponse,
  AnalysisRecord,
  CabinetProfile,
  CommunityReport,
  SavedLocation,
} from "@/types";

export type AuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * ISO timestamp → a short local date and time.
 *
 * Formatted in the UI language rather than the browser's, so a page switched to
 * KZ does not show Russian month names next to Kazakh labels.
 */
export function formatDateTime(iso: string, lang: string): string {
  const locale = lang === "RU" ? "ru-RU" : lang === "KZ" ? "kk-KZ" : "en-GB";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Pull FastAPI's `detail` out of an error body.
 *
 * Same reasoning as lib/route.ts: "that name is already taken" (409) and "your
 * current password is wrong" (400) need different reactions from the user, and
 * "HTTP 409" tells them neither.
 */
async function fail(res: Response): Promise<never> {
  const detail = await res
    .json()
    .then((b) => {
      if (typeof b?.detail === "string") return b.detail;
      if (Array.isArray(b?.detail) && b.detail[0]?.msg) return b.detail[0].msg as string;
      return null;
    })
    .catch(() => null);
  throw new Error(detail ?? `HTTP ${res.status}`);
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) return fail(res);
  return (await res.json()) as T;
}

// ── Profile ──────────────────────────────────────────────────────────

export async function fetchProfile(authFetch: AuthFetch, signal?: AbortSignal) {
  return json<CabinetProfile>(await authFetch("/api/v1/me/profile", { signal }));
}

export async function changePassword(
  authFetch: AuthFetch,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await authFetch("/api/v1/me/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) await fail(res);
}

// ── History ──────────────────────────────────────────────────────────

export async function fetchAnalyses(
  authFetch: AuthFetch,
  limit = 30,
  offset = 0,
  signal?: AbortSignal,
) {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return json<AnalysesResponse>(await authFetch(`/api/v1/me/analyses?${qs}`, { signal }));
}

export async function deleteAnalysis(authFetch: AuthFetch, id: number): Promise<void> {
  const res = await authFetch(`/api/v1/me/analyses/${id}`, { method: "DELETE" });
  if (!res.ok) await fail(res);
}

export async function setAnalysisShared(authFetch: AuthFetch, id: number, isPublic: boolean) {
  return json<AnalysisRecord>(
    await authFetch(`/api/v1/me/analyses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_public: isPublic }),
    }),
  );
}

/**
 * Fetch a history thumbnail as an object URL.
 *
 * The endpoint requires the bearer token, and a plain `<img src>` is issued by
 * the browser without an Authorization header — it would 401 and render as a
 * broken image. Callers must revoke the returned URL on unmount.
 */
export async function fetchThumbnail(authFetch: AuthFetch, url: string, signal?: AbortSignal) {
  const res = await authFetch(url, { signal });
  if (!res.ok) return fail(res);
  return URL.createObjectURL(await res.blob());
}

// ── Saved locations ──────────────────────────────────────────────────

export async function fetchLocations(authFetch: AuthFetch, signal?: AbortSignal) {
  const data = await json<{ locations: SavedLocation[] }>(
    await authFetch("/api/v1/me/locations", { signal }),
  );
  return data.locations;
}

export async function addLocation(
  authFetch: AuthFetch,
  name: string,
  latitude: number,
  longitude: number,
) {
  return json<SavedLocation>(
    await authFetch("/api/v1/me/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, latitude, longitude }),
    }),
  );
}

export async function deleteLocation(authFetch: AuthFetch, id: number): Promise<void> {
  const res = await authFetch(`/api/v1/me/locations/${id}`, { method: "DELETE" });
  if (!res.ok) await fail(res);
}

// ── Own reports ──────────────────────────────────────────────────────

export async function fetchMyReports(authFetch: AuthFetch, signal?: AbortSignal) {
  const data = await json<{ reports: CommunityReport[] }>(
    await authFetch("/api/v1/me/reports", { signal }),
  );
  return data.reports;
}
