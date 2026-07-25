"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Props = { imageUrl: string };

const BRACKETS = [
  "left-2 top-2 border-l border-t",
  "right-2 top-2 border-r border-t",
  "bottom-2 left-2 border-b border-l",
  "bottom-2 right-2 border-b border-r",
];

export function ScannerAnimation({ imageUrl }: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % t.states.length), 900);
    return () => clearInterval(id);
  }, [t.states.length]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="lp-panel-strong p-4 sm:p-5"
    >
      <div className="lp-scanlines relative aspect-[4/3] w-full overflow-hidden">
        {/* The photograph is desaturated on the way in: from here on it is
            evidence being measured, not a picture. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="uploaded sky"
          className="absolute inset-0 h-full w-full object-cover grayscale contrast-125"
        />
        <div className="absolute inset-0 bg-black/35" />

        {BRACKETS.map((c) => (
          <span key={c} aria-hidden className={`lp-bracket h-5 w-5 ${c}`} />
        ))}

        <div aria-hidden className="lp-lattice pointer-events-none absolute inset-0 opacity-50" />
        <div aria-hidden className="lp-sweep" />
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="lp-mono min-h-[18px] text-white/80">
          <AnimatePresence mode="wait">
            <motion.span
              key={phase}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="inline-flex items-center gap-2"
            >
              <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-white" />
              {t.states[phase]}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1.5">
          {t.states.map((_, i) => (
            <span
              key={i}
              className={`h-px transition-all duration-500 ${i <= phase ? "w-6 bg-white" : "w-3 bg-white/20"}`}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
