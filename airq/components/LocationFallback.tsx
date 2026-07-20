"use client";

import { motion } from "framer-motion";
import { MapPinned } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { PresetLocation } from "@/types";

type Props = {
  onPick: (loc: PresetLocation) => void;
};

export function LocationFallback({ onPick }: Props) {
  const { t } = useI18n();

  const presets: PresetLocation[] = [
    { key: "astana",    label: t.fallbackAstana,    coords: { latitude: 51.128, longitude: 71.430 } },
    { key: "almaty",    label: t.fallbackAlmaty,    coords: { latitude: 43.2389, longitude: 76.8897 } },
    { key: "karaganda", label: t.fallbackKaraganda, coords: { latitude: 49.807, longitude: 73.088 } },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass p-4"
    >
      <div className="flex items-center gap-2 text-emerald-100/85 font-medium">
        <MapPinned className="w-4 h-4 text-emerald-300" />
        <div>{t.fallbackTitle}</div>
      </div>
      <div className="mt-1 text-emerald-100/60 text-xs">{t.fallbackPrompt}</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => onPick(p)}
            className="text-left px-3 py-2.5 rounded-xl bg-white/5 hover:bg-emerald-500/15 border border-white/10 hover:border-emerald-400/50 transition-colors text-sm text-white"
          >
            {p.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
