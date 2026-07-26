"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { changePassword } from "@/lib/cabinet";
import { SwapAction } from "@/components/landing/magnetic";
import { ALARM } from "@/lib/utils";

export function SecurityPanel() {
  const { t } = useI18n();
  const { authFetch } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    // Checked here rather than server-side: the confirmation field exists only
    // to catch a typo in this form, so the API never needs to know about it.
    if (next !== confirm) {
      setError(t.securityMismatch);
      return;
    }

    setBusy(true);
    try {
      await changePassword(authFetch, current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="lp-panel max-w-md space-y-6 p-5 sm:p-6">
      <div>
        <div className="lp-mono text-white/40">{t.securityTitle}</div>
        <p className="mt-2 text-sm text-white/35">{t.securityHint}</p>
      </div>

      <label className="block">
        <span className="lp-mono text-white/35">{t.securityCurrent}</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="lp-field"
        />
      </label>

      <label className="block">
        <span className="lp-mono text-white/35">{t.securityNew}</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="lp-field"
        />
        <span className="mt-2 block text-[11px] text-white/30">{t.authPasswordHint}</span>
      </label>

      <label className="block">
        <span className="lp-mono text-white/35">{t.securityConfirm}</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="lp-field"
        />
      </label>

      {error && (
        <div className="lp-mono" style={{ color: ALARM }}>
          {error}
        </div>
      )}
      {done && <div className="lp-mono text-white/70">{t.securityChanged}</div>}

      <SwapAction
        type="submit"
        label={t.securitySubmit}
        disabled={busy || !current || !next}
        className="w-full"
      />
    </form>
  );
}
