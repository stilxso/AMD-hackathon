"use client";

import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LANGS: Lang[] = ["EN", "RU", "KZ"];

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center border border-white/15">
      {LANGS.map((l, i) => {
        const active = lang === l;
        return (
          <button
            key={l}
            onClick={() => setLang(l)}
            data-cursor="grow"
            className={cn(
              "lp-mono px-3 py-2 transition-colors",
              i > 0 && "border-l border-white/15",
              active ? "bg-white text-black" : "text-white/50 hover:text-white",
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
