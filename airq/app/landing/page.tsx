"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";

import { Cursor, Grain, ParticleField, ScrollProgress } from "@/components/landing/atmosphere";
import { MagneticLink, SwapButton } from "@/components/landing/magnetic";
import { Preloader } from "@/components/landing/preloader";
import { Spectrum } from "@/components/landing/spectrum";
import { Stats } from "@/components/landing/stats";
import { StickySteps } from "@/components/landing/steps";
import { Marquee, MaskLine, ScrollWords, SectionLabel } from "@/components/landing/type";

import "../mono.css";

export default function LandingPage() {
  const [ready, setReady] = useState(false);
  const onDone = useCallback(() => setReady(true), []);

  return (
    <div className="lp">
      <Preloader onDone={onDone} />
      <Grain />
      <Cursor />
      <ScrollProgress />
      <Nav />

      <main>
        <Hero ready={ready} />
        <Manifesto />
        <StickySteps />
        <Marquee items={["Scan the sky", "Read your air", "Map the haze"]} />
        <Spectrum />
        <Stats />
        <CallToAction />
      </main>

      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ nav */

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-6 py-5 mix-blend-difference md:px-12">
      <Link href="/landing" className="lp-display text-lg tracking-[-0.03em]" data-cursor="grow">
        AirQ
      </Link>
      <nav className="hidden gap-8 md:flex">
        {[
          ["Method", "#method"],
          ["Scale", "#scale"],
          ["Start", "#start"],
        ].map(([label, href]) => (
          <MagneticLink
            key={href}
            href={href}
            className="lp-mono text-white/70 transition-colors hover:text-white"
          >
            {label}
          </MagneticLink>
        ))}
      </nav>
      <Link href="/" className="lp-mono text-white/70 transition-colors hover:text-white" data-cursor="grow">
        Open app ↗
      </Link>
    </header>
  );
}

/* ----------------------------------------------------------------- hero */

function Hero({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // Scrolling clears the particulate haze — the page's central metaphor.
  const clear = useTransform(scrollYProgress, [0, 0.85], [0, 1]);

  const titleY = useTransform(scrollYProgress, [0, 1], ["0%", "38%"]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);

  const rise = {
    initial: { y: "110%" },
    animate: ready ? { y: "0%" } : { y: "110%" },
  };

  return (
    <section ref={ref} className="relative h-[100dvh] overflow-hidden">
      <motion.div style={{ scale }} className="absolute inset-0">
        <ParticleField clear={clear} />
      </motion.div>

      {/* vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(closest-side, transparent 40%, rgba(0,0,0,0.75) 100%)" }}
      />

      <motion.div
        style={{ y: titleY, opacity: titleOpacity }}
        className="relative flex h-full flex-col justify-center px-6 md:px-12"
      >
        <div className="lp-mono flex items-center gap-3 text-white/50">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Eco-monitoring · MVP · 2026
        </div>

        <h1 className="lp-display mt-6 text-[clamp(3.4rem,13.5vw,15rem)]">
          <span className="lp-mask">
            <motion.span
              className="block"
              {...rise}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
            >
              Read the
            </motion.span>
          </span>
          <span className="lp-mask">
            <motion.span
              className="block lp-outline"
              {...rise}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.14 }}
            >
              invisible
            </motion.span>
          </span>
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between"
        >
          <p className="max-w-md text-base leading-relaxed text-white/60 md:text-lg">
            One photograph of the sky. A vision model reads the haze, fuses it with ground
            stations and weather, and returns the air quality where you are standing.
          </p>
          <SwapButton href="/" label="Scan the sky" />
        </motion.div>
      </motion.div>

      <motion.div
        aria-hidden
        className="lp-mono absolute inset-x-0 bottom-6 flex items-center justify-between px-6 text-white/40 md:px-12"
        initial={{ opacity: 0 }}
        animate={ready ? { opacity: 1 } : {}}
        transition={{ duration: 1, delay: 0.9 }}
      >
        <span>PM2.5 · PM10 · NO₂ · O₃</span>
        <motion.span
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          Scroll to clear the air ↓
        </motion.span>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------ manifesto */

function Manifesto() {
  return (
    <section className="px-6 py-32 md:px-12 md:py-48">
      <div className="mx-auto max-w-6xl">
        <SectionLabel index="§ 01">The problem</SectionLabel>
        <ScrollWords
          className="lp-display mt-12 text-[clamp(1.9rem,5.4vw,4.4rem)]"
          text="Air quality is measured by a handful of stations, in a handful of cities, for a handful of people. Everyone else is guessing. A camera is a sensor — and there are five billion of them already out there."
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ cta */

function CallToAction() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const x1 = useTransform(scrollYProgress, [0, 1], ["-12%", "6%"]);
  const x2 = useTransform(scrollYProgress, [0, 1], ["10%", "-8%"]);

  return (
    <section ref={ref} id="start" className="relative overflow-hidden py-32 md:py-48">
      <div className="pointer-events-none select-none">
        <motion.div style={{ x: x1 }} className="lp-display whitespace-nowrap text-[clamp(4rem,16vw,15rem)] text-white/[0.07]">
          Scan the sky
        </motion.div>
        <motion.div style={{ x: x2 }} className="lp-display whitespace-nowrap text-[clamp(4rem,16vw,15rem)] lp-outline opacity-30">
          Read your air
        </motion.div>
      </div>

      <div className="relative mt-16 flex flex-col items-center gap-10 px-6 text-center md:px-12">
        <MaskLine
          text="Point. Shoot. Breathe."
          center
          className="lp-display text-[clamp(2rem,5vw,4rem)]"
        />
        <p className="max-w-md text-white/55">
          Works on any phone, in any city, with or without a nearby monitoring station.
        </p>
        <SwapButton href="/" label="Open AirQ" />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- footer */

function Footer() {
  return (
    <footer className="lp-hairline px-6 py-10 md:px-12">
      <div className="lp-mono flex flex-col gap-4 text-white/35 md:flex-row md:items-center md:justify-between">
        <span>AirQ · Eco-monitoring MVP</span>
        <span>Tech Vision 2026</span>
        <span>Data · WHO · EPA · OpenWeather</span>
      </div>
    </footer>
  );
}
