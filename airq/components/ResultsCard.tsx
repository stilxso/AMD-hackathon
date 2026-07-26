"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { SwapAction } from "@/components/landing/magnetic";
import { aqiTone, cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { aqiLabel, useI18n } from "@/lib/i18n";
import type { AnalyzeResponse, Coords } from "@/types";

type Props = {
  result: AnalyzeResponse;
  imageUrl: string;
  coords: Coords;
  onReset: () => void;
};

const SEGMENTS = 6;

export function ResultsCard({ result, imageUrl, coords, onReset }: Props) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const tone = aqiTone(result.aqi_score, theme);
  const label = aqiLabel(t, result.aqi_score);
  // Without this the two modes produce visually identical cards, and a raw
  // model score is easy to mistake for a corroborated one.
  const nnOnly = result.fusion_method === "nn_only";
  const confidence = Math.round(result.ai_confidence * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      {/* Score */}
      <div
        className="lp-panel-strong overflow-hidden p-5 sm:p-6"
        style={tone.alarm ? { borderColor: "rgba(255,59,48,0.55)" } : undefined}
      >
        <div className="lp-mono flex items-center justify-between text-white/40">
          <span>{t.aqi}</span>
          <span>{label}</span>
        </div>

        <div className="mt-3 flex items-end gap-5">
          <Counter value={result.aqi_score} hex={tone.hex} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="scan"
            className="mb-2 ml-auto h-20 w-20 shrink-0 border border-white/15 object-cover grayscale sm:h-24 sm:w-24"
          />
        </div>

        {/* Density ramp: how much of the scale this reading fills. */}
        <div className="mt-5 flex gap-1">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <motion.span
              key={i}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.25 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="h-1 flex-1 origin-left"
              style={{ background: i < tone.step ? tone.hex : "rgb(var(--fg-rgb) / 0.1)" }}
            />
          ))}
        </div>

        <div className="mt-4 text-sm leading-relaxed text-white/70">{result.status_text}</div>

        {nnOnly && (
          <div
            title={t.nnOnlyHint}
            className="lp-mono mt-4 inline-flex items-center gap-2 border border-dashed border-white/35 px-2 py-1 text-white/60"
          >
            {t.nnOnlyBadge}
          </div>
        )}
      </div>

      {/* Detail — ruled rows rather than boxes, so the number above stays loud */}
      <div className="lp-panel px-5">
        <Row label={t.confidence}>
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-white">{confidence}%</span>
            <span className="h-px w-20 bg-white/15">
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: confidence / 100 }}
                transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="block h-px origin-left bg-white"
              />
            </span>
          </div>
        </Row>

        <Row label={t.pollutant}>
          <span className="text-white">{result.dominant_pollutant}</span>
        </Row>

        {result.estimated_pm25 ? (
          <>
            {/* In nn_only mode the fused and raw values are the same number, so
                listing both twice would just look like a bug. */}
            {!nnOnly && (
              <Row label="Fused (final)">
                <span className="tabular-nums text-white">
                  ~{result.aqi_score < 100 ? "0" : (result.estimated_pm25 / 22.0).toFixed(1)} 🚬 / day
                </span>
              </Row>
            )}
            {result.raw_ai_pm25 !== undefined && (
              <Row label="AI vision only">
                <span className="tabular-nums text-white/60">
                  ~{result.aqi_score < 100 ? "0" : (result.raw_ai_pm25 / 22.0).toFixed(1)} 🚬 / day
                </span>
              </Row>
            )}
          </>
        ) : (
          <Row label="Source">
            <span className="text-white/60">Detected via AI vision model</span>
          </Row>
        )}

        <Row label={t.coordinates} last>
          <span className="font-mono text-[13px] tabular-nums text-white">
            {coords.latitude.toFixed(4)}°, {coords.longitude.toFixed(4)}°
          </span>
        </Row>
      </div>

      <SwapAction label={t.reset} variant="ghost" onClick={onReset} className="w-full" />
    </motion.div>
  );
}

/** The AQI itself, counting up to its value so the reading lands rather than appears. */
function Counter({ value, hex }: { value: number; hex: string }) {
  const raw = useMotionValue(0);
  const shown = useTransform(raw, (v) => Math.round(v));

  useEffect(() => {
    const anim = animate(raw, value, { duration: 1.2, ease: [0.16, 1, 0.3, 1] });
    return () => anim.stop();
  }, [value, raw]);

  return (
    <motion.div
      className="lp-display text-[clamp(4rem,14vw,7rem)] tabular-nums leading-[0.8]"
      style={{ color: hex }}
    >
      {shown}
    </motion.div>
  );
}

function Row({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-3.5 text-sm",
        !last && "border-b border-white/[0.08]",
      )}
    >
      <span className="lp-mono text-white/35">{label}</span>
      {children}
    </div>
  );
}
