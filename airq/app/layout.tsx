import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "AirQ — Scan the sky, read your air",
  description:
    "Photograph the sky, and let AI estimate local air quality. Tech Vision 2026 ECO-MONITORING MVP.",
  applicationName: "AirQ",
  authors: [{ name: "Tech Vision 2026" }],
};

export const viewport: Viewport = {
  themeColor: "#06140d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
