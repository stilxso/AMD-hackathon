"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";

/**
 * Counts up, then lifts off the screen and hands the hero its entrance.
 * `onDone` fires as the curtain starts moving, not after, so the two overlap.
 */
export function Preloader({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const controls = animate(0, 100, {
      duration: 1.9,
      ease: [0.7, 0, 0.2, 1],
      onUpdate: (v) => setCount(Math.round(v)),
      onComplete: () => {
        setTimeout(() => {
          setOpen(false);
          onDone();
        }, 260);
      },
    });
    return () => controls.stop();
  }, [onDone]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex flex-col justify-between bg-black p-6 md:p-10"
          exit={{ y: "-100%" }}
          transition={{ duration: 1.05, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="lp-mono flex justify-between text-white/45">
            <span>AirQ · Eco-monitoring</span>
            <span>Tech Vision 2026</span>
          </div>

          <div className="flex items-end justify-between">
            <motion.span
              className="lp-mono text-white/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Calibrating optical haze model
            </motion.span>
            <span className="lp-display text-[clamp(4rem,16vw,13rem)] tabular-nums leading-none">
              {String(count).padStart(3, "0")}
            </span>
          </div>

          <div className="h-px w-full bg-white/15">
            <motion.div
              className="h-px origin-left bg-white"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: count / 100 }}
              transition={{ duration: 0.1, ease: "linear" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
