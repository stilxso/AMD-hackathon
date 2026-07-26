"use client";

import { useEffect, useState } from "react";
import { Eye, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { fetchMyReports, formatDateTime } from "@/lib/cabinet";
import { deleteReport, PERCEIVED_COLOR } from "@/lib/community";
import { ALARM } from "@/lib/utils";
import type { CommunityReport, PerceivedLevel } from "@/types";
import type { Dict } from "@/lib/i18n";

/** The label for a perceived level, in the current language. */
export function perceivedLabel(t: Dict, level: PerceivedLevel): string {
  return {
    good: t.perceivedGood,
    moderate: t.perceivedModerate,
    poor: t.perceivedPoor,
    severe: t.perceivedSevere,
  }[level];
}

export function ReportsPanel({ onChanged }: { onChanged: () => void }) {
  const { t, lang } = useI18n();
  const { authFetch } = useAuth();
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMyReports(authFetch, ctrl.signal)
      .then((rows) => {
        setReports(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [authFetch]);

  async function remove(id: number) {
    try {
      await deleteReport(authFetch, id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return <div className="lp-mono py-16 text-center text-white/35">{t.cabinetLoading}</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="lp-mono border border-white/20 px-3 py-2" style={{ color: ALARM }}>
          {error}
        </div>
      )}

      {reports.length === 0 ? (
        <div className="lp-panel px-5 py-14 text-center">
          <div className="lp-mono text-white/50">{t.reportsEmpty}</div>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li key={report.id} className="lp-panel p-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: PERCEIVED_COLOR[report.perceived] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className="lp-mono"
                      style={{ color: PERCEIVED_COLOR[report.perceived] }}
                    >
                      {perceivedLabel(t, report.perceived)}
                    </span>
                    <span className="lp-mono text-white/30">
                      {formatDateTime(report.createdAt, lang)}
                    </span>
                    {report.visibilityKm != null && (
                      <span className="lp-mono inline-flex items-center gap-1 text-white/30">
                        <Eye className="h-3 w-3" />
                        {report.visibilityKm} km
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 font-mono text-[11px] tabular-nums text-white/25">
                    {report.latitude.toFixed(3)}°, {report.longitude.toFixed(3)}°
                  </div>

                  {report.symptoms.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {report.symptoms.map((s) => (
                        <span
                          key={s}
                          className="lp-mono border border-white/12 px-1.5 py-0.5 text-white/45"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {report.note && (
                    <p className="mt-2.5 text-sm leading-relaxed text-white/60">{report.note}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => remove(report.id)}
                  data-cursor="grow"
                  aria-label={t.reportDelete}
                  title={t.reportDelete}
                  className="border border-white/15 p-1.5 text-white/40 transition-colors hover:border-white/40 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
