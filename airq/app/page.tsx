"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { Header } from "@/components/Header";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ScannerAnimation } from "@/components/ScannerAnimation";
import { ResultsCard } from "@/components/ResultsCard";
import { LocationFallback } from "@/components/LocationFallback";
import { MapSkeleton } from "@/components/MapSkeleton";
import { useI18n } from "@/lib/i18n";
import type { AnalyzeResponse, Coords, PresetLocation } from "@/types";

// CRITICAL: dynamic import with ssr:false so leaflet never touches window server-side.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

type Phase = "idle" | "locating" | "scanning" | "done" | "error";

const DEMO_IMAGE =
  // Almaty haze from Unsplash (no login required, direct hotlink)
  "https://images.unsplash.com/photo-1573599852326-2d4da0bbe613?auto=format&fit=crop&w=1600&q=80";
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

  useEffect(() => {
    return () => {
      if (imageUrl && imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

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

  async function handleDemo() {
    setNeedsFallback(false);
    setPhase("locating");
    setImageUrl(DEMO_IMAGE);
    setCoords(DEMO_COORDS);
    try {
      // materialize the remote demo image as a File for the mock API contract
      const res = await fetch(DEMO_IMAGE, { mode: "cors" });
      const blob = await res.blob();
      const f = new File([blob], "almaty-haze-demo.jpg", { type: blob.type || "image/jpeg" });
      setFile(f);
      runAnalysis(f, DEMO_COORDS);
    } catch {
      // even if the fetch fails, still surface a mocked flow with an empty blob
      const f = new File([new Blob([""], { type: "image/jpeg" })], "demo.jpg", { type: "image/jpeg" });
      setFile(f);
      runAnalysis(f, DEMO_COORDS);
    }
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
            <AnimatePresence mode="wait">
              {phase === "idle" && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <UploadDropzone onFile={handleFile} onDemo={handleDemo} />
                  {needsFallback && <LocationFallback onPick={handleFallbackPick} />}
                </motion.div>
              )}

              {phase === "locating" && (
                <motion.div
                  key="loc"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="glass-strong p-8 flex flex-col items-center text-center"
                >
                  <Loader2 className="w-8 h-8 text-emerald-300 animate-spin" />
                  <div className="mt-3 text-white font-medium">{t.locationRequest}</div>
                </motion.div>
              )}

              {phase === "scanning" && imageUrl && (
                <motion.div
                  key="scan"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <ScannerAnimation imageUrl={imageUrl} />
                </motion.div>
              )}

              {phase === "done" && result && imageUrl && coords && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <ResultsCard result={result} imageUrl={imageUrl} coords={coords} onReset={reset} />
                </motion.div>
              )}

              {phase === "error" && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="glass-strong p-6 border-red-400/30"
                >
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT: map */}
          <div className="lg:col-span-3">
            <div className="glass-strong p-3 sm:p-4">
              <div className="flex items-center justify-between px-1 pb-3">
                <div className="text-emerald-100/85 font-medium">{t.mapTitle}</div>
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
