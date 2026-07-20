"use client";

import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LANGS: Lang[] = ["EN", "RU", "KZ"];

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="glass px-1 py-1 flex items-center gap-1 text-[13px]">
      {LANGS.map((l) => {
        const active = lang === l;
        return (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={cn(
              "px-3 py-1.5 rounded-xl transition-all font-medium tracking-wider",
              active
                ? "bg-emerald-500/90 text-forest-950 shadow-glow-emerald"
                : "text-emerald-100/70 hover:text-white hover:bg-white/5",
            )}
            aria-pressed={active}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
