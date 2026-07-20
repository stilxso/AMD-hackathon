"use client";

import { Map as MapIcon } from "lucide-react";

export function MapSkeleton() {
  return (
    <div className="relative w-full h-full min-h-[360px] lg:min-h-[560px] glass overflow-hidden flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-40 animate-grid-drift" />
      <div className="relative z-10 flex flex-col items-center text-emerald-100/70">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center animate-pulse-glow">
          <MapIcon className="w-6 h-6 text-emerald-300" />
        </div>
        <div className="mt-3 text-sm">Loading map…</div>
      </div>
    </div>
  );
}
