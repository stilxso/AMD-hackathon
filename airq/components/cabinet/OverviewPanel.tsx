"use client";

import { aqiLabel, useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/cabinet";
import { aqiTone } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { Sparkline } from "./Sparkline";
import type { CabinetProfile } from "@/types";

export function OverviewPanel({ profile }: { profile: CabinetProfile }) {
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const { stats, trend } = profile;

  // A fresh account has no average AQI. Rendering the null as 0 would read as
  // pristine air, which is the opposite of "we have nothing to show yet".
  const avgTone = stats.avg_aqi != null ? aqiTone(stats.avg_aqi, theme) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px bg-white/[0.08] sm:grid-cols-4">
        <Stat label={t.statScans} value={stats.analyses} />
        <Stat
          label={t.statAvgAqi}
          value={stats.avg_aqi ?? t.statNone}
          hex={avgTone?.hex}
          hint={stats.avg_aqi != null ? aqiLabel(t, stats.avg_aqi) : undefined}
        />
        <Stat label={t.statWorst} value={stats.worst_aqi ?? t.statNone} />
        <Stat label={t.statBest} value={stats.best_aqi ?? t.statNone} />
        <Stat label={t.statShared} value={stats.shared_analyses} />
        <Stat label={t.statReports} value={stats.reports} />
        <Stat label={t.statSaved} value={stats.saved_locations} />
        <Stat
          label={t.statLastScan}
          value={stats.last_analysis_at ? formatDateTime(stats.last_analysis_at, lang) : t.statNone}
          small
        />
      </div>

      <div className="lp-panel p-5 sm:p-6">
        <div className="lp-mono flex items-baseline justify-between text-white/40">
          <span>{t.trendTitle}</span>
          {trend.length > 1 && <span>{trend.length}</span>}
        </div>

        {trend.length > 1 ? (
          <>
            <Sparkline points={trend} className="mt-5 h-24 w-full" />
            <p className="mt-4 text-[11px] text-white/30">{t.trendHint}</p>
          </>
        ) : (
          <p className="mt-4 text-sm text-white/40">{t.trendEmpty}</p>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hex,
  hint,
  small = false,
}: {
  label: string;
  value: string | number;
  hex?: string;
  hint?: string;
  small?: boolean;
}) {
  return (
    <div className="bg-black px-4 py-4">
      <div className="lp-mono text-white/35">{label}</div>
      <div
        className={
          small
            ? "mt-2 font-mono text-[13px] tabular-nums text-white/85"
            : "lp-display mt-1.5 text-3xl tabular-nums leading-none"
        }
        style={hex ? { color: hex } : undefined}
      >
        {value}
      </div>
      {hint && <div className="lp-mono mt-1.5 text-white/30">{hint}</div>}
    </div>
  );
}
