import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ALARM = "#ff3b30";

export type AqiTone = {
  /** Ramp colour, used identically by the readout, the map field and the legend. */
  hex: string;
  /** 0–5. Drives bar fill and how loud the type is allowed to be. */
  step: number;
  /** True for the two worst bands, the only place colour is spent. */
  alarm: boolean;
};

/**
 * Severity as density, not hue.
 *
 * The page is white particulate on black, so dirtier air is *brighter* — clean
 * air is a quiet grey that barely lifts off the background, and by the time the
 * number is pure white it is already unhealthy. Beyond 200 the ramp breaks into
 * the single alarm colour, which appears nowhere else in the product.
 */
export function aqiTone(score: number, theme: "dark" | "light" = "dark"): AqiTone {
  // Same idea on the light theme, mirrored: contrast against the page is what
  // carries severity, so there the ramp darkens instead of brightening.
  const ramp = theme === "light"
    ? ["#a3a3a3", "#737373", "#3f3f3f", "#0c0c0c"]
    : ["#6f6f6f", "#9c9c9c", "#cfcfcf", "#ffffff"];

  if (score <= 50)  return { hex: ramp[0], step: 1, alarm: false };
  if (score <= 100) return { hex: ramp[1], step: 2, alarm: false };
  if (score <= 150) return { hex: ramp[2], step: 3, alarm: false };
  if (score <= 200) return { hex: ramp[3], step: 4, alarm: false };
  if (score <= 300) return { hex: ALARM,   step: 5, alarm: true };
  return              { hex: "#ff1f10",    step: 6, alarm: true };
}

/** The ramp as CSS, shared by every gradient that shows the scale. */
export const AQI_GRADIENT =
  `linear-gradient(90deg,#6f6f6f,#9c9c9c,#cfcfcf,#ffffff,${ALARM},#ff1f10)`;
