"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "airq.theme";

/**
 * Runs before first paint (see the inline script in app/layout.tsx), so the
 * document already carries the stored theme when the first frame lands — no
 * white flash on a dark reload, and no dark flash on a light one.
 */
export const THEME_INIT_SCRIPT =
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(KEY)});` +
  `if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}` +
  `document.documentElement.dataset.theme=t}catch(e){}})()`;

type Ctx = { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void };
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The server has no way to know the stored theme, so it renders "dark" and
  // the effect adopts whatever the pre-paint script already put on <html>.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setThemeState(t);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    try { window.localStorage.setItem(KEY, t); } catch {}
  }, []);

  const value = useMemo<Ctx>(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [theme, setTheme],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
