import type { ChatTurn, Coords } from "@/types";

/**
 * Ask a follow-up about the air at a point.
 *
 * The whole transcript goes up each turn: the server keeps no session, it
 * refetches the evidence and replays the conversation on top, so the client is
 * the only place the thread lives.
 */
export async function askAir(
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  coords: Coords,
  messages: ChatTurn[],
  pm25: number | null,
  signal?: AbortSignal,
): Promise<string> {
  const res = await authFetch("/api/v1/explain/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      latitude: coords.latitude,
      longitude: coords.longitude,
      // Anchors the answer to the figure the user is looking at. Without it the
      // model explains the nearest monitor's reading, which after a photo scan
      // is a different number from the one on screen.
      pm25,
      messages,
    }),
  });

  if (!res.ok) {
    // 503 (no key configured) and 502 (the model could not answer) call for
    // different reactions, and the reason is in `detail`.
    const detail = await res
      .json()
      .then((b) => (typeof b?.detail === "string" ? b.detail : null))
      .catch(() => null);
    throw new Error(detail ?? `HTTP ${res.status}`);
  }

  const data = (await res.json()) as { reply: string };
  return data.reply;
}
