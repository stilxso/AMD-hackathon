"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

import { Header } from "@/components/Header";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ScannerAnimation } from "@/components/ScannerAnimation";
import { ResultsCard } from "@/components/ResultsCard";
import { LocationFallback } from "@/components/LocationFallback";
import { MapSkeleton } from "@/components/MapSkeleton";
import { useI18n } from "@/lib/i18n";
import { makeDemoImage } from "@/lib/demoImage";
import type { AnalyzeResponse, Coords, PresetLocation } from "@/types";

// CRITICAL: dynamic import with ssr:false so mapbox-gl never touches window server-side.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

type Phase = "idle" | "locating" | "scanning" | "done" | "error";

const DEMO_COORDS: Coords = { latitude: 43.2389, longitude: 76.8897 };

export default function Page() {
  const { t } = useI18n();

  const [phase, setPhase] = useState<Phase>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [errText, setErrText] = useState<string | null>(null);
  const [needsFallback, setNeedsFallback] = useState(false);
  const [locStatus, setLocStatus] = useState<"idle" | "prompting" | "granted" | "denied">("idle");

  useEffect(() => {
    return () => {
      if (imageUrl && imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  // Ask for position permission on load and keep a live watch so the map
  // tracks the user. Falls back to the manual city dropdown if denied.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocStatus("denied");
      setNeedsFallback(true);
      return;
    }
    setLocStatus("prompting");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocStatus("granted");
        setNeedsFallback(false);
      },
      () => {
        setLocStatus((s) => (s === "granted" ? s : "denied"));
        // Only surface the manual picker while still on the capture screen —
        // never yank it back up once the user has a scan / demo in flight.
        setPhase((p) => {
          if (p === "idle") setNeedsFallback(true);
          return p;
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  function reset() {
    if (imageUrl && imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    setPhase("idle");
    setImageUrl(null);
    setFile(null);
    setResult(null);
    setErrText(null);
  }

  async function getLocation(): Promise<Coords> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("no-geo"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => reject(new Error("denied")),
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 60_000 },
      );
    });
  }

  async function runAnalysis(f: File, c: Coords) {
    const form = new FormData();
    form.append("file", f);
    form.append("latitude", String(c.latitude));
    form.append("longitude", String(c.longitude));

    setPhase("scanning");
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AnalyzeResponse;
      setResult(data);
      setPhase("done");
    } catch (e: unknown) {
      setErrText(e instanceof Error ? e.message : "unknown");
      setPhase("error");
    }
  }

  async function handleFile(f: File, previewUrl: string) {
    setFile(f);
    setImageUrl(previewUrl);

    // Live watch may already have our position — use it and scan immediately.
    if (coords) {
      runAnalysis(f, coords);
      return;
    }

    setPhase("locating");
    try {
      const c = await getLocation();
      setCoords(c);
      setNeedsFallback(false);
      runAnalysis(f, c);
    } catch {
      setNeedsFallback(true);
      setPhase("idle");
    }
  }

  function handleDemo() {
    setNeedsFallback(false);
    setCoords(DEMO_COORDS);
    // Locally generated haze image — no network, works offline / on stage.
    // Synchronous so the whole transition happens in one React tick.
    const { file: f, url } = makeDemoImage();
    setFile(f);
    setImageUrl(url);
    runAnalysis(f, DEMO_COORDS);
  }

  function handleFallbackPick(loc: PresetLocation) {
    setCoords(loc.coords);
    setNeedsFallback(false);
    if (file) {
      runAnalysis(file, loc.coords);
    }
  }

  const showMap = phase === "done" || phase === "scanning" || coords != null;

  return (
    <main className="relative">
      <Header />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-2 pb-16">
        {/* headline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-2 mb-6 md:mb-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-emerald-100/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-glow-emerald animate-pulse" />
            ECO-MONITORING · MVP
          </div>
          <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight neon-text max-w-3xl">
            {t.tagline}
          </h1>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 md:gap-6">
          {/* LEFT: capture / scanning / results */}
          <div className="lg:col-span-2 space-y-4">
            {/* Keyed by phase so React remounts on each transition and replays
                the enter animation. We deliberately avoid <AnimatePresence>
                exit animations here — their completion callback can deadlock in
                some browsers, freezing the panel on the previous phase. */}
            <div className="space-y-4">
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="space-y-4"
              >
                {phase === "idle" && (
                  <>
                    <UploadDropzone onFile={handleFile} onDemo={handleDemo} />
                    {needsFallback && <LocationFallback onPick={handleFallbackPick} />}
                  </>
                )}

                {phase === "locating" && (
                  <div className="glass-strong p-8 flex flex-col items-center text-center">
                    <Loader2 className="w-8 h-8 text-emerald-300 animate-spin" />
                    <div className="mt-3 text-white font-medium">{t.locationRequest}</div>
                  </div>
                )}

                {phase === "scanning" && imageUrl && <ScannerAnimation imageUrl={imageUrl} />}

                {phase === "done" && result && imageUrl && coords && (
                  <ResultsCard result={result} imageUrl={imageUrl} coords={coords} onReset={reset} />
                )}

                {phase === "error" && (
                  <div className="glass-strong p-6 border-red-400/30">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-300 mt-0.5" />
                      <div>
                        <div className="font-medium text-white">{t.errorTitle}</div>
                        <div className="text-emerald-100/70 text-sm mt-1">{t.errorBody}</div>
                        {errText && (
                          <div className="mt-2 text-[11px] font-mono text-red-200/70">{errText}</div>
                        )}
                        <button
                          onClick={reset}
                          className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-forest-950 text-sm font-medium shadow-glow-emerald"
                        >
                          {t.tryAgain}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </div>

          {/* RIGHT: map */}
          <div className="lg:col-span-3">
            <div className="glass-strong p-3 sm:p-4">
              <div className="flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-2 text-emerald-100/85 font-medium">
                  {t.mapTitle}
                  <span
                    className={
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-normal border " +
                      (locStatus === "granted"
                        ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
                        : locStatus === "denied"
                          ? "bg-red-500/10 border-red-400/30 text-red-200"
                          : "bg-white/5 border-white/10 text-emerald-100/60")
                    }
                  >
                    <span
                      className={
                        "w-1.5 h-1.5 rounded-full " +
                        (locStatus === "granted"
                          ? "bg-emerald-400 shadow-glow-emerald animate-pulse"
                          : locStatus === "denied"
                            ? "bg-red-400"
                            : "bg-emerald-300 animate-pulse")
                      }
                    />
                    {locStatus === "granted"
                      ? t.locationLive
                      : locStatus === "denied"
                        ? t.locationDenied
                        : t.locationRequest}
                  </span>
                </div>
                {coords && (
                  <div className="text-[11px] font-mono text-emerald-100/50 tabular-nums">
                    {coords.latitude.toFixed(4)}°, {coords.longitude.toFixed(4)}°
                  </div>
                )}
              </div>
              {showMap && coords ? (
                <MapView coords={coords} aqi={result?.aqi_score} />
              ) : (
                <MapSkeleton />
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-4 sm:px-6 pb-10 text-center text-[12px] text-emerald-100/50">
        AirQ · ECO-MONITORING MVP · Tech Vision 2026
      </footer>
    </main>
  );
}
