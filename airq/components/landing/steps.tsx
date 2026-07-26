"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";

import { SectionLabel } from "./type";

const STEPS = [
  {
    n: "01",
    title: "Capture",
    body: "Point the camera at open sky and take one frame. No sensor, no subscription, no hardware to mount on a roof.",
    meta: "INPUT · 1 IMAGE + GPS FIX",
  },
  {
    n: "02",
    title: "Analyse",
    body: "A vision model reads haze density, scattering and horizon contrast, then fuses that estimate with ground stations and live weather.",
    meta: "MODEL · PM2.5 REGRESSION",
  },
  {
    n: "03",
    title: "Locate",
    body: "The reading is pinned to your coordinates and folded into a living map, so one photo makes the whole grid sharper.",
    meta: "OUTPUT · AQI + CONFIDENCE",
  },
];

export function StickySteps() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length));
    setActive((cur) => (cur === next ? cur : next));
  });

  const step = STEPS[active];

  return (
    <section ref={ref} className="relative h-[320vh]" id="method">
      <div className="sticky top-0 flex h-dvh flex-col justify-center overflow-hidden px-6 md:px-12">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-20">
          {/* copy */}
          <div className="order-2 md:order-1">
            <SectionLabel index="§ 02">The method</SectionLabel>

            <div className="relative mt-8 min-h-[19rem] md:min-h-[21rem]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step.n}
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -26 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="lp-mono text-white/40">{step.n}</div>
                  <h3 className="lp-display mt-3 text-[clamp(2.6rem,7vw,5.5rem)]">{step.title}</h3>
                  <p className="mt-6 max-w-md text-base leading-relaxed text-white/60 md:text-lg">
                    {step.body}
                  </p>
                  <div className="lp-mono mt-8 text-white/35">{step.meta}</div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* step rail */}
            <div className="mt-4 flex gap-2">
              {STEPS.map((s, i) => (
                <div key={s.n} className="h-px w-16 bg-white/15">
                  <motion.div
                    className="h-px origin-left bg-white"
                    initial={false}
                    animate={{ scaleX: i <= active ? 1 : 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* visual */}
          <div className="order-1 md:order-2">
            <StepVisual active={active} progress={scrollYProgress} />
          </div>
        </div>
      </div>
    </section>
  );
}

function StepVisual({
  active,
  progress,
}: {
  active: number;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  const rotate = useTransform(progress, [0, 1], [-4, 4]);
  const scale = useTransform(progress, [0, 0.5, 1], [0.94, 1, 0.94]);

  return (
    <motion.div
      style={{ scale }}
      className="lp-scanlines relative mx-auto aspect-square w-full max-w-[30rem] overflow-hidden border border-white/12"
    >
      {/* viewfinder corners */}
      {[
        "left-4 top-4 border-l border-t",
        "right-4 top-4 border-r border-t",
        "left-4 bottom-4 border-b border-l",
        "right-4 bottom-4 border-b border-r",
      ].map((cls) => (
        <span key={cls} className={`absolute h-6 w-6 border-white/45 ${cls}`} aria-hidden />
      ))}

      <motion.div style={{ rotate }} className="absolute inset-0">
        <AnimatePresence mode="wait">
          {active === 0 && <Aperture key="a" />}
          {active === 1 && <Analysis key="b" />}
          {active === 2 && <Grid key="c" />}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

const fade = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.08 },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
};

function Aperture() {
  return (
    <motion.svg {...fade} viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
      <g fill="none" stroke="currentColor">
        <circle cx="200" cy="200" r="150" strokeOpacity="0.15" />
        <circle cx="200" cy="200" r="112" strokeOpacity="0.3" strokeDasharray="2 10" className="lp-noise-ring" style={{ transformOrigin: "200px 200px" }} />
        <circle cx="200" cy="200" r="74" strokeOpacity="0.55" />
        <circle cx="200" cy="200" r="36" strokeOpacity="0.9" />
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={i}
            x1="200"
            y1="200"
            // Rounded: raw float output differs between server and client render.
            x2={(200 + 150 * Math.cos((i * Math.PI) / 3)).toFixed(2)}
            y2={(200 + 150 * Math.sin((i * Math.PI) / 3)).toFixed(2)}
            strokeOpacity="0.12"
          />
        ))}
        <path d="M200 20v40M200 340v40M20 200h40M340 200h40" strokeOpacity="0.7" />
      </g>
      <motion.circle
        cx="200"
        cy="200"
        r="8"
        fill="currentColor"
        animate={{ opacity: [1, 0.25, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.svg>
  );
}

function Analysis() {
  return (
    <motion.div {...fade} className="absolute inset-0 p-10">
      <div className="grid h-full grid-cols-8 grid-rows-8 gap-px bg-white/5">
        {Array.from({ length: 64 }).map((_, i) => (
          <motion.div
            key={i}
            className="bg-white"
            initial={{ opacity: 0.04 }}
            animate={{ opacity: [0.04, ((i * 37) % 11) / 14 + 0.05, 0.04] }}
            transition={{
              duration: 3.2,
              repeat: Infinity,
              delay: (i % 8) * 0.09 + Math.floor(i / 8) * 0.05,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <motion.div
        className="pointer-events-none absolute inset-x-10 h-px bg-white shadow-[0_0_24px_6px_rgb(var(--fg-rgb)_/_0.45)]"
        initial={{ top: "2.5rem" }}
        animate={{ top: ["2.5rem", "calc(100% - 2.5rem)", "2.5rem"] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

function Grid() {
  return (
    <motion.svg {...fade} viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
      <defs>
        <pattern id="lp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeOpacity="0.12" />
        </pattern>
      </defs>
      <rect width="400" height="400" fill="url(#lp-grid)" />
      <path d="M0 250q80-60 150-20t250-70" fill="none" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M0 300q110-40 190 10t210-30" fill="none" stroke="currentColor" strokeOpacity="0.18" />
      {[3, 2, 1].map((r, i) => (
        <motion.circle
          key={r}
          cx="200"
          cy="200"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.6"
          initial={{ scale: 0.4, opacity: 0.8 }}
          animate={{ scale: [0.4, 3.4], opacity: [0.8, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 1, ease: "easeOut" }}
          style={{ transformOrigin: "200px 200px" }}
        />
      ))}
      <circle cx="200" cy="200" r="6" fill="currentColor" />
      {[80, 200, 320].map((x) => (
        <text key={x} x={x} y="386" fill="currentColor" fillOpacity="0.3" fontSize="9" fontFamily="monospace" textAnchor="middle">
          {(43.2 + x / 200).toFixed(3)}°
        </text>
      ))}
    </motion.svg>
  );
}
