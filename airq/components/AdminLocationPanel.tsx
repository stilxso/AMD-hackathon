"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { SwapAction } from "@/components/landing/magnetic";
import { useI18n } from "@/lib/i18n";
import { buildPresets } from "@/lib/presets";
import type { Coords } from "@/types";

type Props = {
  /** Coordinates currently in effect — the override if set, else the real fix. */
  current: Coords | null;
  overridden: boolean;
  onApply: (c: Coords) => void;
  onClear: () => void;
};

function parse(lat: string, lng: string): Coords | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (lat.trim() === "" || lng.trim() === "") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function AdminLocationPanel({ current, overridden, onApply, onClear }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  // Track whatever is in effect while the user is not editing, so opening the
  // panel starts from the current position rather than an empty form.
  useEffect(() => {
    if (open) return;
    setLat(current ? current.latitude.toFixed(4) : "");
    setLng(current ? current.longitude.toFixed(4) : "");
  }, [current, open]);

  const parsed = parse(lat, lng);
  const dirty = lat.trim() !== "" || lng.trim() !== "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="lp-panel px-5 py-4"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        data-cursor="grow"
        className="lp-mono flex w-full items-center gap-3 text-white/70 transition-colors hover:text-white"
      >
        <span className="flex-1 text-left">{t.adminLocationTitle}</span>
        {overridden && (
          <span className="border border-dashed border-white/40 px-2 py-0.5 text-white/70">
            {t.locationSimulated}
          </span>
        )}
        <ChevronDown className={"h-4 w-4 transition-transform duration-300 " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="mt-4">
          <div className="text-xs leading-relaxed text-white/40">{t.adminLocationHint}</div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="lp-mono text-white/35">{t.adminLat}</span>
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                inputMode="decimal"
                placeholder="51.1280"
                className="lp-field font-mono text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="lp-mono text-white/35">{t.adminLng}</span>
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                inputMode="decimal"
                placeholder="71.4300"
                className="lp-field font-mono text-sm tabular-nums"
              />
            </label>
          </div>

          {dirty && !parsed && (
            <div className="lp-mono mt-3" style={{ color: "var(--lp-alarm)" }}>
              {t.adminInvalidCoords}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <SwapAction
              label={t.adminApply}
              disabled={!parsed}
              onClick={() => parsed && onApply(parsed)}
            />
            {overridden && (
              <SwapAction label={t.adminResetLocation} variant="ghost" onClick={onClear} />
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {buildPresets(t).map((p) => (
              <button
                key={p.key}
                onClick={() => onApply(p.coords)}
                data-cursor="grow"
                className="lp-mono border border-white/15 px-3 py-2.5 text-left text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
