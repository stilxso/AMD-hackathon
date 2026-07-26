"use client";

import { Moon, Sun } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

/** Sits next to <LanguageToggle /> and wears the same bordered-cell shape. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const label = theme === "dark" ? t.themeToLight : t.themeToDark;

  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      data-cursor="grow"
      className="lp-mono flex items-center gap-2 border border-white/15 px-3 py-2 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
    >
      {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{theme === "dark" ? t.themeLight : t.themeDark}</span>
    </button>
  );
}
