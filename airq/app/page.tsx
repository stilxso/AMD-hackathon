"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { animate, motion, useMotionValue } from "framer-motion";

import { AdminLocationPanel } from "@/components/AdminLocationPanel";
import { AuthScreen } from "@/components/AuthScreen";
import { Header } from "@/components/Header";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ScannerAnimation } from "@/components/ScannerAnimation";
import { ResultsCard } from "@/components/ResultsCard";
import { LocationFallback } from "@/components/LocationFallback";
import { MapSkeleton } from "@/components/MapSkeleton";
import { Cursor, Grain, ParticleField } from "@/components/landing/atmosphere";
import { SwapAction } from "@/components/landing/magnetic";
import { MaskLine } from "@/components/landing/type";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { AnalyzeResponse, Coords, PresetLocation } from "@/types";

import "./mono.css";

// CRITICAL: dynamic import with ssr:false so mapbox-gl never touches window server-side.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

type Phase = "idle" | "locating" | "scanning" | "done" | "error";

/**
 * Auth gate. AirQApp is mounted only once signed in, so its geolocation watch
 * does not fire a browser permission prompt behind the login screen.
 */
export default function Page() {
  const { t } = useI18n();
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="lp flex min-h-dvh flex-col items-center justify-center gap-5">
        <Grain />
        <span className="h-8 w-8 animate-spin rounded-full border border-white/20 border-t-white" />
        <div className="lp-mono text-white/50">{t.authChecking}</div>
      </div>
    );
  }

  if (status === "anonymous") return <AuthScreen />;

  return <AirQApp />;
}

const OVERRIDE_KEY = "airq.admin.coordsOverride";

function AirQApp() {
  const { t } = useI18n();
  const { authFetch, user } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [errText, setErrText] = useState<string | null>(null);
  const [nnOnly, setNnOnly] = useState(false);
  const [needsFallback, setNeedsFallback] = useState(false);
  const [locStatus, setLocStatus] = useState<"idle" | "prompting" | "granted" | "denied">("idle");
  // Admin-set coordinates. Wins over the geolocation watch while set; the watch
  // keeps running underneath so clearing snaps back without a re-prompt.
  const [override, setOverride] = useState<Coords | null>(null);

  // How much particulate hangs behind the whole page (1 = clean air). Idle sits
  // in a deliberate haze; a finished scan animates it to the measured value, so
  // the background *is* the reading before you have read the number.
  const clarity = useMotionValue(0.45);

  useEffect(() => {
    const target =
      phase === "done" && result
        ? Math.max(0.04, 1 - Math.min(result.aqi_score, 260) / 260)
        : phase === "scanning"
          ? 0.2
          : 0.45;
    const anim = animate(clarity, target, { duration: 1.8, ease: [0.16, 1, 0.3, 1] });
    return () => anim.stop();
  }, [phase, result, clarity]);

  useEffect(() => {
    if (!user?.is_admin) return;
    try {
      const raw = window.localStorage.getItem(OVERRIDE_KEY);
      if (raw) setOverride(JSON.parse(raw) as Coords);
    } catch {
      /* absent or malformed — just start with no override */
    }
  }, [user?.is_admin]);

  function applyOverride(c: Coords) {
    setOverride(c);
    setNeedsFallback(false);
    try { window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(c)); } catch {}
  }

  function clearOverride() {
    setOverride(null);
    try { window.localStorage.removeItem(OVERRIDE_KEY); } catch {}
  }

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
        // never yank it back up once the user has a scan in flight.
        setPhase((p) => {
          if (p === "idle") setNeedsFallback(true);
          return p;
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Everything downstream — map, analysis, readout — reads this, not `coords`.
  const effectiveCoords = override ?? coords;

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

  async function runAnalysis(f: File, c: Coords, nnOnly: boolean) {
    const form = new FormData();
    form.append("file", f);
    form.append("latitude", String(c.latitude));
    form.append("longitude", String(c.longitude));
    form.append("nn_only", String(nnOnly));

    setPhase("scanning");
    try {
      const res = await authFetch("/api/v1/analyze", { method: "POST", body: form });
      if (!res.ok) {
        // The server explains rejections in `detail` — most importantly a 422
        // for a photo that isn't the sky. Showing "HTTP 422" instead would
        // leave the user with no idea what to do differently.
        const detail = await res
          .json()
          .then((b) => (typeof b?.detail === "string" ? b.detail : null))
          .catch(() => null);
        throw new Error(detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AnalyzeResponse;
      setResult(data);
      setPhase("done");
    } catch (e: unknown) {
      setErrText(e instanceof Error ? e.message : "unknown");
      setPhase("error");
    }
  }

  async function handleFile(f: File, previewUrl: string, nnOnly: boolean) {
    setFile(f);
    setImageUrl(previewUrl);
    // Remembered so a scan resumed via the city picker keeps the mode the user
    // actually chose.
    setNnOnly(nnOnly);

    // An override, or a live watch that already has our position — either way
    // we can scan immediately without prompting.
    if (effectiveCoords) {
      runAnalysis(f, effectiveCoords, nnOnly);
      return;
    }

    setPhase("locating");
    try {
      const c = await getLocation();
      setCoords(c);
      setNeedsFallback(false);
      runAnalysis(f, c, nnOnly);
    } catch {
      setNeedsFallback(true);
      setPhase("idle");
    }
  }

  function handleFallbackPick(loc: PresetLocation) {
    setCoords(loc.coords);
    setNeedsFallback(false);
    if (file) {
      runAnalysis(file, loc.coords, nnOnly);
    }
  }

  const showMap = phase === "done" || phase === "scanning" || effectiveCoords != null;

  return (
    <div className="lp min-h-dvh">
      <Grain />
      <Cursor />

      {/* The haze sits behind the entire app, not just a hero band. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <ParticleField clear={clarity} />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(closest-side, transparent 30%, rgba(0,0,0,0.85) 100%)" }}
        />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
          {/* headline */}
          <div className="pb-10 pt-10 md:pb-16 md:pt-16">
            <div className="lp-mono flex items-center gap-3 text-white/45">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Eco-monitoring · MVP · 2026
              <Link
                href="/landing"
                data-cursor="grow"
                className="ml-auto hidden text-white/45 transition-colors hover:text-white md:inline"
              >
                ← Back to intro
              </Link>
            </div>

            <h1 className="lp-display mt-6 max-w-4xl text-[clamp(2rem,5.6vw,4.6rem)]">
              <MaskLine text={t.tagline} />
            </h1>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
            {/* LEFT: capture / scanning / results */}
            <div className="space-y-4 lg:col-span-2">
              {user?.is_admin && (
                <AdminLocationPanel
                  current={effectiveCoords}
                  overridden={override != null}
                  onApply={applyOverride}
                  onClear={clearOverride}
                />
              )}

              {/* Keyed by phase so React remounts on each transition and replays
                  the enter animation. We deliberately avoid <AnimatePresence>
                  exit animations here — their completion callback can deadlock in
                  some browsers, freezing the panel on the previous phase. */}
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-4"
              >
                {phase === "idle" && (
                  <>
                    <UploadDropzone onFile={handleFile} />
                    {needsFallback && <LocationFallback onPick={handleFallbackPick} />}
                  </>
                )}

                {phase === "locating" && (
                  <div className="lp-panel-strong flex min-h-[340px] flex-col items-center justify-center gap-5 px-8 text-center">
                    <span className="h-9 w-9 animate-spin rounded-full border border-white/20 border-t-white" />
                    <div className="lp-mono text-white/60">{t.locationRequest}</div>
                  </div>
                )}

                {phase === "scanning" && imageUrl && <ScannerAnimation imageUrl={imageUrl} />}

                {phase === "done" && result && imageUrl && effectiveCoords && (
                  <ResultsCard result={result} imageUrl={imageUrl} coords={effectiveCoords} onReset={reset} />
                )}

                {phase === "error" && (
                  <div
                    className="lp-panel-strong p-6"
                    style={{ borderColor: "rgba(255,59,48,0.5)" }}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--lp-alarm)" }} />
                      <div className="min-w-0 flex-1">
                        <div className="lp-mono" style={{ color: "var(--lp-alarm)" }}>
                          {t.errorTitle}
                        </div>
                        <div className="mt-2 text-sm text-white/60">{t.errorBody}</div>
                        {errText && (
                          <div className="mt-3 break-all font-mono text-[11px] text-white/35">{errText}</div>
                        )}
                        <SwapAction label={t.tryAgain} onClick={reset} className="mt-6" />
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>

            {/* RIGHT: map */}
            <div className="lg:col-span-3">
              <div className="lp-panel-strong p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
                  <div className="lp-mono flex items-center gap-3 text-white/70">
                    {t.mapTitle}
                    {/* An override must never be shown as a live fix — the
                        readout and the AQI below both derive from it. */}
                    <LocationBadge override={override != null} status={locStatus} />
                  </div>
                  {effectiveCoords && (
                    <div className="font-mono text-[11px] tabular-nums text-white/40">
                      {effectiveCoords.latitude.toFixed(4)}°, {effectiveCoords.longitude.toFixed(4)}°
                    </div>
                  )}
                </div>
                {showMap && effectiveCoords ? (
                  <MapView coords={effectiveCoords} aqi={result?.aqi_score} />
                ) : (
                  <MapSkeleton />
                )}
              </div>
            </div>
          </div>
        </main>

        <footer className="lp-hairline mx-auto max-w-7xl px-5 py-8 sm:px-8">
          <div className="lp-mono flex flex-col gap-3 text-white/35 md:flex-row md:items-center md:justify-between">
            <span>AirQ · Eco-monitoring MVP</span>
            <span>Tech Vision 2026</span>
            <span>Data · WHO · EPA · OpenWeather</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Live / denied / simulated, as a dot and a word — never as a colour. */
function LocationBadge({
  override,
  status,
}: {
  override: boolean;
  status: "idle" | "prompting" | "granted" | "denied";
}) {
  const { t } = useI18n();

  const label = override
    ? t.locationSimulated
    : status === "granted"
      ? t.locationLive
      : status === "denied"
        ? t.locationDenied
        : t.locationRequest;

  const denied = !override && status === "denied";

  return (
    <span
      className={
        "inline-flex items-center gap-2 border px-2 py-1 " +
        (override
          ? "border-dashed border-white/40 text-white/70"
          : denied
            ? "border-white/20 text-white/45"
            : "border-white/25 text-white")
      }
    >
      <span
        className={
          "h-1 w-1 rounded-full " +
          (denied ? "bg-white/40" : status === "granted" && !override ? "animate-pulse bg-white" : "bg-white/70")
        }
      />
      {label}
    </span>
  );
}
