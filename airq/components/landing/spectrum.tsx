"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

import { SectionLabel } from "./type";

/** AQI bands, rendered as luminance instead of the usual green→maroon ramp. */
const BANDS = [
  { range: "0 — 50", name: "Good", tone: 1, note: "Clear sky. Nothing to do but breathe." },
  { range: "51 — 100", name: "Moderate", tone: 0.76, note: "Unusually sensitive people should pace themselves." },
  { range: "101 — 150", name: "Sensitive", tone: 0.54, note: "Children, elders and asthmatics should limit exertion." },
  { range: "151 — 200", name: "Unhealthy", tone: 0.34, note: "Everyone begins to feel it. Close the windows." },
  { range: "201 — 300", name: "Very unhealthy", tone: 0.18, note: "Avoid outdoor activity. Filter the air indoors." },
  { range: "301 +", name: "Hazardous", tone: 0.07, note: "Emergency conditions. Stay inside." },
];

export function Spectrum() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Six panels, so the track travels five panel-widths minus the viewport slack.
  const x = useTransform(scrollYProgress, [0, 1], ["2vw", "-78vw"]);
  const line = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section ref={ref} className="relative h-[420vh]" id="scale">
      <div className="sticky top-0 flex h-dvh flex-col justify-center overflow-hidden">
        <div className="px-6 md:px-12">
          <SectionLabel index="§ 03">The scale</SectionLabel>
        </div>

        <motion.div style={{ x }} className="mt-10 flex gap-6 md:gap-8">
          {BANDS.map((b, i) => (
            <article
              key={b.name}
              className="relative flex h-[52vh] w-[76vw] shrink-0 flex-col justify-between overflow-hidden border border-white/12 p-7 md:w-[34vw] md:p-9"
            >
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(160deg, rgb(var(--fg-rgb) / ${b.tone * 0.16}), rgb(var(--fg-rgb) / 0.01))`,
                }}
              />
              <div className="relative flex items-start justify-between">
                <span className="lp-mono text-white/45">{String(i + 1).padStart(2, "0")}</span>
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: `rgb(var(--fg-rgb) / ${Math.max(b.tone, 0.12)})` }}
                  aria-hidden
                />
              </div>

              <div className="relative">
                <div className="lp-mono text-white/45">{b.range}</div>
                <h3
                  className="lp-display mt-3 text-[clamp(1.8rem,3.4vw,3rem)]"
                  style={{ color: `rgb(var(--fg-rgb) / ${0.35 + b.tone * 0.65})` }}
                >
                  {b.name}
                </h3>
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">{b.note}</p>
              </div>

              {/* luminance strip */}
              <div className="relative mt-6 flex h-8 gap-px">
                {Array.from({ length: 28 }).map((_, k) => (
                  <div
                    key={k}
                    className="flex-1"
                    style={{ backgroundColor: `rgb(var(--fg-rgb) / ${b.tone * (k / 27) * 0.9 + 0.03})` }}
                  />
                ))}
              </div>
            </article>
          ))}
        </motion.div>

        <div className="mt-10 px-6 md:px-12">
          <div className="h-px w-full bg-white/12">
            <motion.div style={{ width: line }} className="h-px bg-white" />
          </div>
        </div>
      </div>
    </section>
  );
}
