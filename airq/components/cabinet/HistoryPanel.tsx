"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, ImageOff, Lock, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { aqiLabel, useI18n } from "@/lib/i18n";
import {
  deleteAnalysis,
  fetchAnalyses,
  formatDateTime,
  setAnalysisShared,
} from "@/lib/cabinet";
import { useTheme } from "@/lib/theme";
import { ALARM, aqiTone, cn } from "@/lib/utils";
import { AuthImage } from "./AuthImage";
import type { AnalysisRecord } from "@/types";

const PAGE = 12;

export function HistoryPanel({ onChanged }: { onChanged: () => void }) {
  const { t, lang } = useI18n();
  const { authFetch } = useAuth();
  const [items, setItems] = useState<AnalysisRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which row is mid-request, so its own buttons disable without freezing the
  // whole list — deleting one scan should not block sharing another.
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(
    async (offset: number, signal?: AbortSignal) => {
      const data = await fetchAnalyses(authFetch, PAGE, offset, signal);
      setTotal(data.total);
      setItems((prev) => (offset === 0 ? data.analyses : [...prev, ...data.analyses]));
    },
    [authFetch],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    load(0, ctrl.signal)
      .then(() => setLoading(false))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [load]);

  async function toggleShare(record: AnalysisRecord) {
    setBusy(record.id);
    try {
      const updated = await setAnalysisShared(authFetch, record.id, !record.isPublic);
      setItems((prev) => prev.map((r) => (r.id === record.id ? updated : r)));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(record: AnalysisRecord) {
    if (!window.confirm(t.historyDeleteConfirm)) return;
    setBusy(record.id);
    try {
      await deleteAnalysis(authFetch, record.id);
      setItems((prev) => prev.filter((r) => r.id !== record.id));
      setTotal((n) => Math.max(0, n - 1));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
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

      {items.length === 0 ? (
        <div className="lp-panel px-5 py-14 text-center">
          <div className="lp-mono text-white/50">{t.historyEmpty}</div>
          <p className="mt-3 text-sm text-white/30">{t.historyEmptyHint}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((record) => (
              <HistoryCard
                key={record.id}
                record={record}
                busy={busy === record.id}
                onShare={() => toggleShare(record)}
                onDelete={() => remove(record)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="lp-mono text-white/30">
              {items.length} {t.historyShowing} {total}
            </span>
            {items.length < total && (
              <button
                type="button"
                data-cursor="grow"
                onClick={() => load(items.length).catch((e) => setError(String(e)))}
                className="lp-mono border border-white/15 px-4 py-2 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
              >
                {t.historyLoadMore}
              </button>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-white/25">{t.historyShareHint}</p>
        </>
      )}
    </div>
  );
}

function HistoryCard({
  record,
  busy,
  onShare,
  onDelete,
}: {
  record: AnalysisRecord;
  busy: boolean;
  onShare: () => void;
  onDelete: () => void;
}) {
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const tone = aqiTone(record.aqi, theme);

  return (
    <div
      className="lp-panel flex gap-4 p-3"
      style={tone.alarm ? { borderColor: "rgba(255,59,48,0.4)" } : undefined}
    >
      <AuthImage
        url={record.thumbnailUrl}
        alt={`Scan from ${record.createdAt}`}
        className="h-24 w-24 shrink-0 border border-white/10 grayscale"
        fallback={
          <div className="flex flex-col items-center gap-1.5 text-white/25">
            <ImageOff className="h-4 w-4" />
            <span className="lp-mono text-[9px]">{t.historyNoImage}</span>
          </div>
        }
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span className="lp-display text-3xl tabular-nums leading-none" style={{ color: tone.hex }}>
            {record.aqi}
          </span>
          <span className="lp-mono truncate text-white/40">{aqiLabel(t, record.aqi)}</span>
        </div>

        <div className="lp-mono mt-2 truncate text-white/30">
          {formatDateTime(record.createdAt, lang)}
          {record.place ? ` · ${record.place}` : ""}
        </div>
        <div className="mt-1 font-mono text-[11px] tabular-nums text-white/25">
          {record.latitude.toFixed(3)}°, {record.longitude.toFixed(3)}° · {record.pm25} µg/m³
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            disabled={busy}
            data-cursor="grow"
            title={t.historyShareHint}
            className={cn(
              "lp-mono inline-flex items-center gap-1.5 border px-2 py-1 transition-colors disabled:opacity-40",
              record.isPublic
                ? "border-white/60 text-white"
                : "border-white/15 text-white/45 hover:border-white/40 hover:text-white/80",
            )}
          >
            {record.isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {record.isPublic ? t.historyShared : t.historyPrivate}
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            data-cursor="grow"
            aria-label={t.historyDelete}
            title={t.historyDelete}
            className="lp-mono ml-auto border border-white/15 p-1.5 text-white/40 transition-colors hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
