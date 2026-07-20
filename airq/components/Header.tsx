"use client";

import { Leaf, Signal } from "lucide-react";
import { LanguageToggle } from "./LanguageToggle";
import { useI18n } from "@/lib/i18n";

export function Header() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center animate-pulse-glow">
              <Leaf className="w-5 h-5 text-emerald-300" strokeWidth={2.2} />
            </div>
          </div>
          <div className="leading-tight">
            <div className="text-white font-semibold tracking-wide text-lg neon-text">{t.brand}</div>
            <div className="text-emerald-100/60 text-[11px] hidden sm:flex items-center gap-1.5">
              <Signal className="w-3 h-3 text-emerald-400" /> {t.poweredBy}
            </div>
          </div>
        </div>
        <LanguageToggle />
      </div>
    </header>
  );
}
