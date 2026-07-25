"use client";

import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { buildPresets } from "@/lib/presets";
import type { PresetLocation } from "@/types";

type Props = {
  onPick: (loc: PresetLocation) => void;
};

export function LocationFallback({ onPick }: Props) {
  const { t } = useI18n();

  const presets = buildPresets(t);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="lp-panel p-5"
    >
      <div className="lp-mono text-white/70">{t.fallbackTitle}</div>
      <div className="mt-2 text-sm text-white/40">{t.fallbackPrompt}</div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => onPick(p)}
            data-cursor="grow"
            className="lp-mono border border-white/15 px-3 py-3 text-left text-white/70 transition-colors hover:border-white hover:bg-white hover:text-black"
          >
            {p.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
