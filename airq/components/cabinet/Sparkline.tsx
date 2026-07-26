"use client";

import { aqiTone } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import type { TrendPoint } from "@/types";

/**
 * The user's recent AQI readings as one line.
 *
 * Scaled against the AQI bands rather than the data's own min/max: a run of
 * readings between 140 and 150 auto-scaled to fill the box would look like a
 * dramatic swing, when it is one band of consistently unhealthy air. The
 * baseline is 0 and the top is the worst band the user actually reached, so the
 * height of the line means the same thing every time it is drawn.
 */
export function Sparkline({ points, className }: { points: TrendPoint[]; className?: string }) {
  const { theme } = useTheme();
  if (points.length < 2) return null;

  const W = 100;
  const H = 28;
  const peak = Math.max(50, ...points.map((p) => p.aqi));
  const step = W / (points.length - 1);

  const coords = points.map((p, i) => [i * step, H - (p.aqi / peak) * H] as const);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  const last = points[points.length - 1];
  const tone = aqiTone(last.aqi, theme);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`AQI trend, latest ${last.aqi}`}
    >
      <path d={area} fill={tone.hex} opacity={0.12} />
      <path d={line} fill="none" stroke={tone.hex} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <circle cx={W} cy={coords[coords.length - 1][1]} r={1.6} fill={tone.hex} />
    </svg>
  );
}
