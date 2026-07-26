"use client";

import { AlertTriangle, Bike, Footprints, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { ALARM } from "@/lib/utils";
import type { RouteProfile, RouteResponse } from "@/types";

type Props = {
  profile: RouteProfile;
  onProfile: (p: RouteProfile) => void;
  hasStart: boolean;
  hasEnd: boolean;
  loading: boolean;
  error: string | null;
  result: RouteResponse | null;
  onClear: () => void;
  onClose: () => void;
};

/**
 * The route readout that sits over the map.
 *
 * It states the cost of the recommendation before its benefit — extra distance
 * and minutes first, then what they buy — because a runner is choosing between
 * two real routes, not admiring a score. Where the data cannot separate the
 * candidates it says so instead of dressing the shortest route up as advice.
 */
export function RoutePanel({
  profile,
  onProfile,
  hasStart,
  hasEnd,
  loading,
  error,
  result,
  onClear,
  onClose,
}: Props) {
  const { t } = useI18n();
  const best = result?.routes[result.recommendedIndex];

  return (
    <div className="absolute bottom-3 right-3 z-[6] w-[min(88vw,18rem)] border border-white/15 bg-black/80 backdrop-blur-md">
      <div className="lp-mono flex items-center justify-between border-b border-white/10 px-3 py-2 text-white/70">
        {t.routeTitle}
        <button
          type="button"
          onClick={onClose}
          aria-label={t.routeClear}
          className="text-white/40 transition-colors hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex border-b border-white/10">
        {(
          [
            ["walking", t.routeWalk, Footprints],
            ["cycling", t.routeBike, Bike],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => onProfile(key)}
            className={
              "lp-mono flex flex-1 items-center justify-center gap-2 py-2 transition-colors " +
              (profile === key ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70")
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="px-3 py-3">
        {!hasStart || !hasEnd ? (
          <div className="lp-mono flex items-center gap-2 text-white/55">
            <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
            {hasStart ? t.routePickEnd : t.routePickStart}
          </div>
        ) : loading ? (
          <div className="lp-mono flex items-center gap-2 text-white/55">
            <span className="h-3 w-3 animate-spin rounded-full border border-white/25 border-t-white" />
            {t.routePlanning}
          </div>
        ) : error ? (
          <div className="lp-mono flex items-start gap-2" style={{ color: ALARM }}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">
              {t.routeFailed} · {error}
            </span>
          </div>
        ) : result && best ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Metric label={t.routeDistance} value={`${best.distanceKm.toFixed(1)} km`} />
              <Metric label={t.routeTime} value={`${Math.round(best.durationMin)} ${t.routeMin}`} />
              <Metric label={t.routeAvgPm} value={`${best.meanPm25}`} sub="µg/m³" />
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-white/60">
              {!result.differentiated ? (
                t.routeUniform
              ) : result.exposureReductionPct > 0 ? (
                <>
                  <span className="font-mono tabular-nums text-white">
                    +{result.extraDistanceKm.toFixed(1)} km · +{Math.round(result.extraMinutes)}{" "}
                    {t.routeMin}
                  </span>{" "}
                  →{" "}
                  <span className="font-mono tabular-nums text-white">
                    −{result.exposureReductionPct}%
                  </span>
                  {` ${t.routeCleaner}`}
                </>
              ) : (
                t.routeAlreadyBest
              )}
            </p>

            {/* What the score could actually see. A recommendation backed by no
                monitor is a recommendation backed by an 11 km model cell. */}
            <div className="lp-mono mt-3 text-white/35">
              {result.sensorCount} {t.routeMonitors}
              {result.gridCellKm != null && ` · ${result.gridCellKm} ${t.routeGrid}`}
            </div>
          </>
        ) : null}

        {(hasStart || result) && (
          <button
            type="button"
            onClick={onClear}
            className="lp-mono mt-3 w-full border border-white/15 py-1.5 text-white/50 transition-colors hover:border-white/35 hover:text-white"
          >
            {t.routeClear}
          </button>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="lp-mono text-white/35">{label}</div>
      <div className="mt-1 font-mono text-[13px] tabular-nums text-white">
        {value}
        {sub && <span className="ml-1 text-[10px] text-white/40">{sub}</span>}
      </div>
    </div>
  );
}
