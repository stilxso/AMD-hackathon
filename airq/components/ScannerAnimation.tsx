"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Props = { imageUrl: string };

export function ScannerAnimation({ imageUrl }: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % t.states.length), 900);
    return () => clearInterval(id);
  }, [t.states.length]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="glass-strong p-4 sm:p-6"
    >
      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-xl border border-emerald-400/20 shadow-glow-emerald-lg">
        {/* image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="uploaded sky" className="absolute inset-0 w-full h-full object-cover" />

        {/* dark green tint */}
        <div className="absolute inset-0 bg-emerald-950/30 mix-blend-multiply" />
        {/* corner brackets */}
        {[
          "top-2 left-2 border-t-2 border-l-2",
          "top-2 right-2 border-t-2 border-r-2",
          "bottom-2 left-2 border-b-2 border-l-2",
          "bottom-2 right-2 border-b-2 border-r-2",
        ].map((c, i) => (
          <span key={i} className={`pointer-events-none absolute ${c} border-emerald-400/80 w-6 h-6 rounded-md`} />
        ))}
        {/* animated grid */}
        <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-30 animate-grid-drift" />

        {/* sweeping scan line */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-0 right-0 h-24 -top-24 animate-scan-line">
            <div className="h-full w-full bg-gradient-to-b from-transparent via-emerald-400/60 to-transparent blur-[1px]" />
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.9)]" />
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="min-h-[24px] text-emerald-100/85 font-medium tabular-nums">
          <AnimatePresence mode="wait">
            <motion.span
              key={phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="inline-flex items-center gap-2"
            >
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-glow-emerald animate-pulse" />
              {t.states[phase]}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1.5">
          {t.states.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i <= phase ? "w-6 bg-emerald-400" : "w-2 bg-white/15"
              }`}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
