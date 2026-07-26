"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { PERCEIVED_COLOR, submitReport } from "@/lib/community";
import { perceivedLabel } from "@/components/cabinet/ReportsPanel";
import { SwapAction } from "@/components/landing/magnetic";
import { ALARM, cn } from "@/lib/utils";
import { PERCEIVED_LEVELS, type Coords, type PerceivedLevel } from "@/types";

/**
 * The crowdsourcing form: one judgement, and three optional details.
 *
 * Perceived level is the only required field. Everything else is optional
 * because a report that takes a minute to fill in is a report nobody files, and
 * a bare "the air here is bad" pin is already the signal worth collecting.
 */
export function ReportDialog({ coords, onClose }: { coords: Coords | null; onClose: () => void }) {
  const { t } = useI18n();
  const { authFetch } = useAuth();
  const [perceived, setPerceived] = useState<PerceivedLevel | null>(null);
  const [visibility, setVisibility] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function toggleSymptom(s: string) {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords || !perceived) return;
    setBusy(true);
    setError(null);
    try {
      const km = visibility.trim() === "" ? null : Number(visibility);
      await submitReport(authFetch, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        perceived,
        visibilityKm: km != null && Number.isFinite(km) ? km : null,
        symptoms,
        note: note.trim() || null,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="lp-panel-strong relative p-5 sm:p-6"
    >
      <button
        type="button"
        onClick={onClose}
        data-cursor="grow"
        aria-label={t.reportCancel}
        className="absolute right-4 top-4 text-white/35 transition-colors hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="lp-mono text-white/40">{t.reportTitle}</div>
      <p className="mt-2 pr-8 text-sm text-white/35">{t.reportSubtitle}</p>

      {done ? (
        <div className="mt-6 space-y-5">
          <p className="text-sm text-white/70">{t.reportSubmitted}</p>
          <SwapAction label={t.reportCancel} variant="ghost" onClick={onClose} className="w-full" />
        </div>
      ) : !coords ? (
        <p className="mt-6 text-sm text-white/40">{t.reportNeedsLocation}</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-6">
          <div>
            <span className="lp-mono text-white/35">{t.reportPerceived}</span>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PERCEIVED_LEVELS.map((level) => {
                const active = perceived === level;
                return (
                  <button
                    key={level}
                    type="button"
                    data-cursor="grow"
                    onClick={() => setPerceived(level)}
                    className={cn(
                      "lp-mono border px-2 py-2.5 transition-colors",
                      active ? "text-black" : "border-white/15 text-white/50 hover:text-white",
                    )}
                    style={
                      active
                        ? { background: PERCEIVED_COLOR[level], borderColor: PERCEIVED_COLOR[level] }
                        : undefined
                    }
                  >
                    {perceivedLabel(t, level)}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="lp-mono text-white/35">{t.reportVisibility}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.5}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="lp-field"
            />
            <span className="mt-2 block text-[11px] text-white/30">{t.reportVisibilityHint}</span>
          </label>

          <div>
            <span className="lp-mono text-white/35">{t.reportSymptoms}</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.symptoms.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-cursor="grow"
                  onClick={() => toggleSymptom(s)}
                  className={cn(
                    "lp-mono border px-2.5 py-1.5 transition-colors",
                    symptoms.includes(s)
                      ? "border-white bg-white text-black"
                      : "border-white/15 text-white/45 hover:border-white/40 hover:text-white",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="lp-mono text-white/35">{t.reportNote}</span>
            <input
              type="text"
              maxLength={280}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.reportNotePlaceholder}
              className="lp-field"
            />
          </label>

          {error && (
            <div className="lp-mono" style={{ color: ALARM }}>
              {t.reportFailed} · {error}
            </div>
          )}

          <SwapAction
            type="submit"
            label={busy ? t.reportSubmitting : t.reportSubmit}
            disabled={busy || !perceived}
            className="w-full"
          />

          <p className="text-[11px] leading-relaxed text-white/25">{t.communityDisclaimer}</p>
        </form>
      )}
    </motion.div>
  );
}
