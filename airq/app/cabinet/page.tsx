"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

import { AuthScreen } from "@/components/AuthScreen";
import { Header } from "@/components/Header";
import { Cursor, Grain } from "@/components/landing/atmosphere";
import { HistoryPanel } from "@/components/cabinet/HistoryPanel";
import { OverviewPanel } from "@/components/cabinet/OverviewPanel";
import { PlacesPanel } from "@/components/cabinet/PlacesPanel";
import { ReportsPanel } from "@/components/cabinet/ReportsPanel";
import { SecurityPanel } from "@/components/cabinet/SecurityPanel";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { fetchProfile } from "@/lib/cabinet";
import { ALARM, cn } from "@/lib/utils";
import type { CabinetProfile, Coords } from "@/types";

import "../mono.css";

type Tab = "overview" | "history" | "places" | "reports" | "security";

/**
 * Auth gate, mirroring app/page.tsx: the cabinet is entirely personal data, so
 * nothing here mounts until there is a session to scope it to.
 */
export default function CabinetPage() {
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

  return <Cabinet />;
}

function Cabinet() {
  const { t } = useI18n();
  const { authFetch } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [profile, setProfile] = useState<CabinetProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchProfile(authFetch, signal)
        .then((p) => {
          setProfile(p);
          setError(null);
        })
        .catch((e: unknown) => {
          if (signal?.aborted) return;
          setError(e instanceof Error ? e.message : String(e));
        }),
    [authFetch],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Saving a place needs a position. A one-shot read rather than a watch: this
  // page does not track movement, and a running watch would keep the GPS warm
  // for as long as the tab is open.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      // Denied or unavailable is not an error here — the Places form says it is
      // waiting for a location and every other tab works without one.
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  // The stat tiles are derived from the same rows the panels mutate, so any
  // change there has to re-read the profile or the counts go stale.
  const refresh = useCallback(() => {
    load();
  }, [load]);

  const TABS: Array<[Tab, string]> = [
    ["overview", t.tabOverview],
    ["history", t.tabHistory],
    ["places", t.tabLocations],
    ["reports", t.tabReports],
    ["security", t.tabSecurity],
  ];

  return (
    <div className="lp relative min-h-dvh">
      <Grain />
      <Cursor />
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href="/"
          data-cursor="grow"
          className="lp-mono inline-flex items-center gap-2 text-white/40 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.cabinetBack}
        </Link>

        {/* A plain entrance rather than MaskLine: that component reveals per
            word on *entering* the viewport, which is the wrong trigger for a
            heading that is already on screen at mount — it left the words
            clipped at their start offset. */}
        <div className="mt-6">
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lp-display text-[clamp(2rem,6vw,3.25rem)]"
          >
            {t.cabinetTitle}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 max-w-xl text-sm leading-relaxed text-white/40"
          >
            {t.cabinetSubtitle}
          </motion.p>
        </div>

        <div className="mt-9 flex overflow-x-auto border border-white/15">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-cursor="grow"
              onClick={() => setTab(key)}
              className={cn(
                "lp-mono whitespace-nowrap px-4 py-2.5 transition-colors",
                tab === key ? "bg-white text-black" : "text-white/45 hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {error && (
            <div className="lp-panel mb-4 flex items-center justify-between gap-4 px-5 py-4">
              <span className="lp-mono" style={{ color: ALARM }}>
                {t.cabinetError} · {error}
              </span>
              <button
                type="button"
                onClick={refresh}
                data-cursor="grow"
                className="lp-mono border border-white/15 px-3 py-1.5 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
              >
                {t.cabinetRetry}
              </button>
            </div>
          )}

          {tab === "overview" &&
            (profile ? (
              <OverviewPanel profile={profile} />
            ) : (
              !error && <div className="lp-mono py-16 text-center text-white/35">{t.cabinetLoading}</div>
            ))}
          {tab === "history" && <HistoryPanel onChanged={refresh} />}
          {tab === "places" && <PlacesPanel coords={coords} onChanged={refresh} />}
          {tab === "reports" && <ReportsPanel onChanged={refresh} />}
          {tab === "security" && <SecurityPanel />}
        </div>
      </main>
    </div>
  );
}
