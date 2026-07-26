"use client";

import { useEffect, useState } from "react";
import { Eye, MessageSquarePlus, Users } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { fetchSummary, PERCEIVED_COLOR } from "@/lib/community";
import { perceivedLabel } from "@/components/cabinet/ReportsPanel";
import { ReportDialog } from "@/components/ReportDialog";
import { PERCEIVED_LEVELS, type CommunitySummary, type Coords } from "@/types";

/** Half-width of the box the summary covers, in degrees (~11 km per 0.1°). */
const NEARBY_DEG = 0.25;

/**
 * What people around here say about the air, next to what the instruments say.
 *
 * Kept visibly separate from the sensor and model readings: these are
 * impressions, and the value of showing them is precisely that they can
 * disagree with the measurement.
 */
export function CommunityPanel({
  coords,
  onReported,
}: {
  coords: Coords | null;
  /** Fired after the report dialog closes, so siblings that draw the same data
   *  — the map's crowd layer — can pick up a submission without a reload. */
  onReported?: () => void;
}) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [open, setOpen] = useState(false);
  // Bumped after a successful submission so the counts include it without a
  // page reload.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!coords) return;
    const ctrl = new AbortController();
    fetchSummary(
      {
        minLat: coords.latitude - NEARBY_DEG,
        minLng: coords.longitude - NEARBY_DEG,
        maxLat: coords.latitude + NEARBY_DEG,
        maxLng: coords.longitude + NEARBY_DEG,
      },
      24,
      ctrl.signal,
    )
      .then(setSummary)
      // A missing community summary is not worth an error state next to a
      // working reading — the panel simply shows "nobody has reported".
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [coords, version]);

  if (open) {
    return (
      <ReportDialog
        coords={coords}
        onClose={() => {
          setOpen(false);
          setVersion((v) => v + 1);
          onReported?.();
        }}
      />
    );
  }

  const total = summary?.reports ?? 0;

  return (
    <div className="lp-panel p-5 sm:p-6">
      <div className="lp-mono flex items-center gap-2 text-white/40">
        <Users className="h-3.5 w-3.5" />
        {t.communityTitle}
      </div>

      {total === 0 ? (
        <p className="mt-4 text-sm text-white/35">{t.communityNobody}</p>
      ) : (
        <>
          {summary?.consensus && (
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-sm text-white/45">{t.communityConsensus}</span>
              <span
                className="lp-display text-2xl leading-none"
                style={{ color: PERCEIVED_COLOR[summary.consensus] }}
              >
                {perceivedLabel(t, summary.consensus)}
              </span>
            </div>
          )}

          {/* One bar, split by how the reports fall. Proportion is the reading
              here — a 60/40 split and a unanimous verdict must not look alike. */}
          <div className="mt-4 flex h-1.5 w-full overflow-hidden">
            {PERCEIVED_LEVELS.map((level) => {
              const n = summary?.perceived[level] ?? 0;
              if (!n) return null;
              return (
                <span
                  key={level}
                  title={`${perceivedLabel(t, level)}: ${n}`}
                  style={{ background: PERCEIVED_COLOR[level], width: `${(n / total) * 100}%` }}
                />
              );
            })}
          </div>

          <div className="lp-mono mt-4 flex flex-wrap gap-x-5 gap-y-2 text-white/30">
            <span>
              {total} {t.communityReportsCount}
            </span>
            {(summary?.sharedAnalyses ?? 0) > 0 && (
              <span>
                {summary?.sharedAnalyses} {t.communitySharedCount}
              </span>
            )}
            {summary?.meanVisibilityKm != null && (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {t.communityVisibility} {summary.meanVisibilityKm} km
              </span>
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        data-cursor="grow"
        className="lp-mono mt-5 inline-flex w-full items-center justify-center gap-2 border border-white/15 px-4 py-2.5 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        {t.communityOpen}
      </button>
    </div>
  );
}
