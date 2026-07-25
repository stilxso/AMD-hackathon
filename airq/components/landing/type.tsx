"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";

/**
 * A line of display type that slides up out of a clipping mask, word by word.
 */
export function MaskLine({
  text,
  delay = 0,
  center = false,
  className = "",
}: {
  text: string;
  delay?: number;
  center?: boolean;
  className?: string;
}) {
  const words = text.split(" ");
  return (
    <span className={`lp-mask ${className}`}>
      <span className={`flex flex-wrap gap-x-[0.24em] ${center ? "justify-center" : ""}`}>
        {words.map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            className="inline-block"
            initial={{ y: "110%", opacity: 0 }}
            whileInView={{ y: "0%", opacity: 1 }}
            viewport={{ once: true, margin: "-12%" }}
            transition={{
              duration: 1,
              delay: delay + i * 0.06,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {word}
          </motion.span>
        ))}
      </span>
    </span>
  );
}

/**
 * Paragraph whose words light up one at a time as the block crosses the screen.
 */
export function ScrollWords({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.35"],
  });
  const words = text.split(" ");

  return (
    <p ref={ref} className={`flex flex-wrap gap-x-[0.26em] gap-y-1 ${className}`}>
      {words.map((word, i) => (
        <Word key={`${word}-${i}`} progress={scrollYProgress} range={[i / words.length, (i + 1.6) / words.length]}>
          {word}
        </Word>
      ))}
    </p>
  );
}

function Word({
  children,
  progress,
  range,
}: {
  children: ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {children}
    </motion.span>
  );
}

/**
 * Inverted infinite band. Content is duplicated once; the CSS keyframe travels
 * exactly -50% so the seam is invisible.
 */
export function Marquee({
  items,
  dir = "ltr",
  invert = true,
}: {
  items: string[];
  dir?: "ltr" | "rtl";
  invert?: boolean;
}) {
  const row = (
    <div className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="flex items-center">
          <span className="lp-display px-6 text-[clamp(2rem,6vw,5rem)]">{item}</span>
          <span
            className={`h-2 w-2 rounded-full ${invert ? "bg-black" : "bg-white"}`}
            aria-hidden
          />
        </span>
      ))}
    </div>
  );

  return (
    <div
      className={`relative overflow-hidden py-5 ${
        invert ? "bg-white text-black" : "border-y border-white/10 bg-black text-white"
      }`}
    >
      <div className="lp-marquee-track" data-dir={dir}>
        {row}
        {row}
      </div>
    </div>
  );
}

/** Small uppercase label with a leading rule — used to number the sections. */
export function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 text-white/60">
      <span className="lp-mono">{index}</span>
      <span className="h-px w-10 bg-white/25" />
      <span className="lp-mono">{children}</span>
    </div>
  );
}
