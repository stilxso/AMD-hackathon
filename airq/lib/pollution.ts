import type { Coords } from "@/types";

export type PollutionPoint = { lng: number; lat: number; aqi: number };

/**
 * Generate a realistic scatter of pollution readings around a center point.
 * Denser + higher near the center and a couple of offset "hotspots" so the
 * heatmap reads like real monitoring data. `baseAqi` scales the whole field —
 * pass the measured AQI once a scan completes so the map reflects the verdict.
 */
export function generatePollution(center: Coords, baseAqi: number, count = 70): PollutionPoint[] {
  const pts: PollutionPoint[] = [];
  const hotspots = [
    { dx: 0.0, dy: 0.0, boost: 1.0 },
    { dx: 0.028, dy: 0.018, boost: 1.28 },
    { dx: -0.024, dy: 0.026, boost: 0.82 },
    { dx: 0.012, dy: -0.03, boost: 1.1 },
  ];
  for (let i = 0; i < count; i++) {
    const h = hotspots[i % hotspots.length];
    // bias radius toward the center so density falls off outward
    const r = Math.pow(Math.random(), 1.7) * 0.055;
    const theta = Math.random() * Math.PI * 2;
    const lng = center.longitude + h.dx + Math.cos(theta) * r;
    const lat = center.latitude + h.dy + Math.sin(theta) * r * 0.7;
    const falloff = 1 - r / 0.055;
    const noise = (Math.random() - 0.5) * 24;
    const aqi = Math.max(8, Math.round(baseAqi * h.boost * (0.62 + 0.5 * falloff) + noise));
    pts.push({ lng, lat, aqi });
  }
  return pts;
}

export function toGeoJSON(points: PollutionPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      properties: { aqi: p.aqi },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  };
}
