"use client";

import Link from "next/link";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export function Header() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <Link href="/landing" data-cursor="grow" className="lp-display text-xl tracking-[-0.03em]">
            {t.brand}
          </Link>
          <span className="lp-mono hidden text-white/35 sm:inline">{t.poweredBy}</span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LanguageToggle />
          {user && (
            <div className="flex items-center gap-3 border-l border-white/10 pl-3">
              <Link
                href="/cabinet"
                data-cursor="grow"
                className="lp-mono max-w-[10rem] truncate text-white/50 transition-colors hover:text-white"
                title={user.username}
              >
                {user.username}
              </Link>
              <button
                onClick={logout}
                title={t.authSignOut}
                aria-label={t.authSignOut}
                data-cursor="grow"
                className="lp-mono border border-white/15 px-3 py-2 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
              >
                {t.authSignOut}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
