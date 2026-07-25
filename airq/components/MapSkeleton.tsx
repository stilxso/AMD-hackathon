"use client";

export function MapSkeleton() {
  return (
    <div className="relative flex h-full min-h-[360px] w-full items-center justify-center overflow-hidden border border-white/10 lg:min-h-[560px]">
      <div aria-hidden className="lp-lattice pointer-events-none absolute inset-0 opacity-70" />
      <div className="lp-mono relative flex items-center gap-3 text-white/40">
        <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
        Loading map…
      </div>
    </div>
  );
}
