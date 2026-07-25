"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView } from "framer-motion";

const STATS = [
  { value: 4.2, suffix: "M", decimals: 1, label: "Deaths a year linked to ambient air pollution", src: "WHO" },
  { value: 99, suffix: "%", decimals: 0, label: "Of humanity breathing air above WHO guideline limits", src: "WHO" },
  { value: 2.5, suffix: "µm", decimals: 1, label: "Particle diameter small enough to cross into the blood", src: "EPA" },
  { value: 1, suffix: " photo", decimals: 0, label: "What it takes to turn a phone into a monitoring station", src: "AirQ" },
];

export function Stats() {
  return (
    <section className="border-y border-white/10 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <div key={s.label} className="bg-black p-8">
            <Counter {...s} delay={i * 0.08} />
            <p className="mt-5 max-w-[16rem] text-sm leading-relaxed text-white/55">{s.label}</p>
            <div className="lp-mono mt-6 text-white/30">SRC · {s.src}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Counter({
  value,
  suffix,
  decimals,
  delay,
}: {
  value: number;
  suffix: string;
  decimals: number;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.7,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v.toFixed(decimals)),
    });
    return () => controls.stop();
  }, [inView, value, decimals, delay]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15%" }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className="lp-display text-[clamp(3rem,5vw,4.6rem)] tabular-nums"
    >
      {display}
      {/* normal-case so "µm" survives the display face's uppercasing */}
      <span className="normal-case text-white/40">{suffix}</span>
    </motion.div>
  );
}
