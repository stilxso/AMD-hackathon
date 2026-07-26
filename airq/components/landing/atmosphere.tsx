"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useScroll, useSpring, type MotionValue } from "framer-motion";

import { useTheme } from "@/lib/theme";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Drifting particulate field — the visual thesis of the page: those specks are
 * PM2.5. `clear` (0..1) thins them out, so scrolling literally cleans the air.
 */
export function ParticleField({ clear }: { clear?: MotionValue<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The loop reads a ref, so scrolling never re-renders React.
  const clearRef = useRef(0);
  // Canvas can't read a CSS token, so the theme is mirrored into a ref the
  // draw loop samples — same reason as above: no re-render per frame.
  const { theme } = useTheme();
  const fillRef = useRef("#ffffff");
  fillRef.current = theme === "light" ? "#0c0c0c" : "#ffffff";

  useEffect(() => {
    if (!clear) return;
    clearRef.current = clear.get();
    return clear.on("change", (v) => {
      clearRef.current = v;
    });
  }, [clear]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const still = prefersReducedMotion();
    const pointer = { x: -9999, y: -9999 };
    let w = 0;
    let h = 0;
    let raf = 0;

    type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; phase: number };
    let particles: P[] = [];

    function seed() {
      const density = Math.min(1, (w * h) / (1920 * 1080));
      const count = Math.round(340 * density) + 90;
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.9 + 0.35,
        vx: (Math.random() - 0.5) * 0.16,
        vy: -Math.random() * 0.22 - 0.03,
        a: Math.random() * 0.55 + 0.12,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, w, h);
      const clarity = clearRef.current;
      const visible = Math.round(particles.length * (1 - clarity * 0.88));

      for (let i = 0; i < visible; i++) {
        const p = particles[i];

        // Cursor pushes the haze around like a hand through smoke.
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 26_000) {
          const f = (1 - d2 / 26_000) * 0.9;
          const d = Math.sqrt(d2) || 1;
          p.x += (dx / d) * f * 2.4;
          p.y += (dy / d) * f * 2.4;
        }

        p.x += p.vx + Math.sin(t * 0.0004 + p.phase) * 0.22;
        p.y += p.vy;

        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        ctx!.globalAlpha = p.a * (1 - clarity * 0.5);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = fillRef.current;
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function loop(t: number) {
      draw(t);
      raf = requestAnimationFrame(loop);
    }

    function onPointer(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    }

    resize();
    window.addEventListener("resize", resize);
    if (still) {
      draw(0);
    } else {
      window.addEventListener("pointermove", onPointer);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
    };
    // `theme` is a dependency for the reduced-motion path only: it draws a
    // single frame, so a colour change has to re-run the effect to be seen.
  }, [theme]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />;
}

/**
 * Difference-blended dot. Grows over anything marked `data-cursor="grow"`.
 */
export function Cursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 900, damping: 60, mass: 0.35 });
  const sy = useSpring(y, { stiffness: 900, damping: 60, mass: 0.35 });
  const [size, setSize] = useState(12);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion() || window.matchMedia("(pointer: coarse)").matches) return;

    function move(e: PointerEvent) {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
      const target = e.target as HTMLElement | null;
      setSize(target?.closest("[data-cursor='grow']") ? 64 : 12);
    }
    function leave() {
      setVisible(false);
    }

    window.addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, [x, y]);

  return (
    <motion.div
      className="lp-cursor hidden md:block"
      aria-hidden
      style={{ x: sx, y: sy }}
      animate={{ opacity: visible ? 1 : 0 }}
    >
      {/* Size lives on a child so the spring transform above stays untouched. */}
      <div
        className="lp-cursor-dot rounded-full transition-[width,height] duration-300 ease-out"
        style={{ width: size, height: size, transform: "translate(-50%, -50%)" }}
      />
    </motion.div>
  );
}

export function Grain() {
  return <div className="lp-grain" aria-hidden />;
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 40, mass: 0.4 });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-px origin-left bg-white"
    />
  );
}
