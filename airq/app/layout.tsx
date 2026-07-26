import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "AirQ — Scan the sky, read your air",
  description:
    "Photograph the sky, and let AI estimate local air quality. Tech Vision 2026 ECO-MONITORING MVP.",
  applicationName: "AirQ",
  authors: [{ name: "Tech Vision 2026" }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        {/* Before first paint, so the stored theme is on <html> for frame one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>{children}</AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
