"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { LanguageToggle } from "./LanguageToggle";
import { Cursor, Grain, ParticleField } from "@/components/landing/atmosphere";
import { SwapAction } from "@/components/landing/magnetic";
import { MaskLine } from "@/components/landing/type";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

type Mode = "signin" | "register";

// Shown on the sign-in card so the judges/demo reviewers can get in without
// registering. Matches DEMO_USERNAME / DEMO_PASSWORD in backend/.env.
const DEMO_USERNAME = "admin";
const DEMO_PASSWORD = "doniponi228";

export function AuthScreen() {
  const { t } = useI18n();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await login(username, password);
      else await register(username, password);
      // On success the provider flips to "authenticated" and this screen
      // unmounts, so there is no state to reset here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  function fillDemo() {
    setUsername(DEMO_USERNAME);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  const tabClass = (active: boolean) =>
    "lp-mono flex-1 px-4 py-2.5 transition-colors " +
    (active ? "bg-white text-black" : "text-white/45 hover:text-white");

  return (
    <div className="lp flex min-h-dvh flex-col">
      <Grain />
      <Cursor />

      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <ParticleField />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(closest-side, transparent 25%, rgba(0,0,0,0.9) 100%)" }}
        />
      </div>

      <div className="relative z-10 flex min-h-dvh flex-col">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="lp-display text-xl tracking-[-0.03em]">{t.brand}</div>
          <LanguageToggle />
        </header>

        <div className="flex flex-1 items-center justify-center px-5 pb-20 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md"
          >
            <h1 className="lp-display text-[clamp(2rem,6vw,3rem)]">
              <MaskLine text={mode === "signin" ? t.authSignInTitle : t.authRegisterTitle} />
            </h1>
            <p className="mt-4 text-sm text-white/45">
              {mode === "signin" ? t.authSignInSubtitle : t.authRegisterSubtitle}
            </p>

            <div className="mt-8 flex border border-white/15">
              <button type="button" onClick={() => switchMode("signin")} className={tabClass(mode === "signin")} data-cursor="grow">
                {t.authSignIn}
              </button>
              <button type="button" onClick={() => switchMode("register")} className={tabClass(mode === "register")} data-cursor="grow">
                {t.authRegister}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <label className="block">
                <span className="lp-mono text-white/35">{t.authUsername}</span>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t.authUsernamePlaceholder}
                  className="lp-field"
                />
              </label>

              <label className="block">
                <span className="lp-mono text-white/35">{t.authPassword}</span>
                <input
                  type="password"
                  name="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.authPasswordPlaceholder}
                  className="lp-field"
                />
                {mode === "register" && (
                  <span className="mt-2 block text-[11px] text-white/30">{t.authPasswordHint}</span>
                )}
              </label>

              {error && (
                <div
                  className="lp-mono border p-3"
                  style={{ borderColor: "rgba(255,59,48,0.5)", color: "var(--lp-alarm)" }}
                >
                  {error}
                </div>
              )}

              <SwapAction
                type="submit"
                disabled={busy}
                label={busy ? "…" : mode === "signin" ? t.authSubmitSignIn : t.authSubmitRegister}
                className="w-full"
              />
            </form>

            <button
              type="button"
              onClick={() => switchMode(mode === "signin" ? "register" : "signin")}
              data-cursor="grow"
              className="lp-mono mt-6 w-full text-center text-white/40 transition-colors hover:text-white"
            >
              {mode === "signin" ? t.authNoAccount : t.authHasAccount}
            </button>

            {mode === "signin" && (
              <div className="lp-hairline mt-8 pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="lp-mono text-white/35">{t.authDemoLabel}</div>
                    <div className="mt-1.5 truncate font-mono text-[12px] text-white/70">
                      {DEMO_USERNAME} / {DEMO_PASSWORD}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={fillDemo}
                    data-cursor="grow"
                    className="lp-mono shrink-0 border border-white/15 px-3 py-2 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
                  >
                    {t.authDemoFill}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
