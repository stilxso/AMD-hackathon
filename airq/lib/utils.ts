import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function aqiColor(score: number): { text: string; bg: string; ring: string; hex: string } {
  if (score <= 50)  return { text: "text-emerald-300", bg: "bg-emerald-500/15", ring: "ring-emerald-400/50", hex: "#34d399" };
  if (score <= 100) return { text: "text-yellow-300",  bg: "bg-yellow-500/15",  ring: "ring-yellow-400/50",  hex: "#facc15" };
  if (score <= 150) return { text: "text-orange-300",  bg: "bg-orange-500/15",  ring: "ring-orange-400/50",  hex: "#fb923c" };
  if (score <= 200) return { text: "text-red-300",     bg: "bg-red-500/15",     ring: "ring-red-400/50",     hex: "#f87171" };
  if (score <= 300) return { text: "text-fuchsia-300", bg: "bg-fuchsia-500/15", ring: "ring-fuchsia-400/50", hex: "#e879f9" };
  return               { text: "text-rose-300",     bg: "bg-rose-600/20",    ring: "ring-rose-500/60",    hex: "#e11d48" };
}
