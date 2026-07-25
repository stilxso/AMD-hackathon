"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * Link that leans toward the pointer while it is nearby, then springs back.
 */
export function MagneticLink({
  href,
  children,
  className = "",
  strength = 0.35,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.6 });

  function onMove(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }

  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.a
      // Next's Link keeps client-side navigation; motion.a supplies the spring.
      ref={ref}
      href={href}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={{ x: sx, y: sy }}
      data-cursor="grow"
      className={className}
    >
      {children}
    </motion.a>
  );
}

/** The label itself, wiped vertically out of a clipping mask on hover. */
function SwapLabel({ label }: { label: string }) {
  return (
    <span className="lp-mono relative block overflow-hidden">
      <span className="block transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-full">
        {label}
      </span>
      <span className="absolute inset-0 translate-y-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0">
        {label}
      </span>
    </span>
  );
}

const PILL =
  "group relative inline-flex items-center justify-center overflow-hidden rounded-full transition-colors duration-500";
const SOLID = "border border-white bg-white text-black hover:bg-black hover:text-white";
const GHOST = "border border-white/25 text-white hover:border-white hover:bg-white hover:text-black";

/** Filled pill whose label swaps on hover with a vertical wipe. */
export function SwapButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} data-cursor="grow" className={`${PILL} ${SOLID} h-14 px-9 md:h-16 md:px-12`}>
      <SwapLabel label={label} />
    </Link>
  );
}

/**
 * The same pill as a real button, for the app's actions. `ghost` is the
 * outlined variant that inverts on hover.
 */
export function SwapAction({
  label,
  onClick,
  variant = "solid",
  type = "button",
  disabled = false,
  title,
  className = "",
}: {
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "solid" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-cursor="grow"
      className={`${PILL} ${variant === "solid" ? SOLID : GHOST} h-12 px-7 disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      <SwapLabel label={label} />
    </button>
  );
}
