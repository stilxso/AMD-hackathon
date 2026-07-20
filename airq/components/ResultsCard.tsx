"use client";

import { motion } from "framer-motion";
import { Activity, Gauge, RefreshCw, MapPin, Sparkles } from "lucide-react";
import { aqiColor, cn } from "@/lib/utils";
import { aqiLabel, useI18n } from "@/lib/i18n";
import type { AnalyzeResponse, Coords } from "@/types";

type Props = {
  result: AnalyzeResponse;
  imageUrl: string;
  coords: Coords;
  onReset: () => void;
};

export function ResultsCard({ result, imageUrl, coords, onReset }: Props) {
  const { t } = useI18n();
  const c = aqiColor(result.aqi_score);
  const label = aqiLabel(t, result.aqi_score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      {/* Score panel */}
      <div className={cn("glass-strong p-5 sm:p-7 ring-1", c.ring)}>
        <div className="flex items-start gap-5">
          {/* thumbnail */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="scan"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover border border-white/10 shadow-xl"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-emerald-100/60 text-xs uppercase tracking-widest">
              <Gauge className="w-3.5 h-3.5" /> {t.aqi}
            </div>
            <div className="mt-1 flex items-end gap-3">
              <div className={cn("text-6xl sm:text-7xl font-semibold tabular-nums leading-none neon-text", c.text)}>
                {result.aqi_score}
              </div>
              <div className={cn("mb-2 px-2.5 py-1 rounded-full text-xs font-medium", c.bg, c.text)}>
                {label}
              </div>
            </div>
            <div className="mt-2 text-white/85 font-medium">{result.status_text}</div>
          </div>
          <button
            onClick={onReset}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-emerald-100 text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> {t.reset}
          </button>
        </div>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="glass p-4">
          <div className="text-emerald-100/60 text-xs uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> {t.confidence}
          </div>
          <div className="mt-2 text-2xl text-white font-semibold tabular-nums">
            {Math.round(result.ai_confidence * 100)}%
          </div>
          <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300"
              style={{ width: `${Math.round(result.ai_confidence * 100)}%` }}
            />
          </div>
        </div>
        <div className="glass p-4">
          <div className="text-emerald-100/60 text-xs uppercase tracking-widest flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> {t.pollutant}
          </div>
          <div className="mt-2 text-2xl text-white font-semibold">{result.dominant_pollutant}</div>
          <div className="mt-2 text-[11px] text-emerald-100/50">
            {result.estimated_pm25 ? (
              <>
                ~{(result.estimated_pm25 / 22.0).toFixed(1)} cigarettes / day <br />
                <span className="opacity-70">({result.estimated_pm25} µg/m³)</span>
              </>
            ) : (
              "Detected via AI vision model"
            )}
          </div>
        </div>
        <div className="glass p-4 col-span-2">
          <div className="text-emerald-100/60 text-xs uppercase tracking-widest flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {t.coordinates}
          </div>
          <div className="mt-2 font-mono text-white/90 text-sm sm:text-base tabular-nums">
            {coords.latitude.toFixed(4)}°, {coords.longitude.toFixed(4)}°
          </div>
        </div>
      </div>

      <button
        onClick={onReset}
        className="sm:hidden inline-flex w-full items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-forest-950 font-medium shadow-glow-emerald"
      >
        <RefreshCw className="w-4 h-4" /> {t.reset}
      </button>
    </motion.div>
  );
}
