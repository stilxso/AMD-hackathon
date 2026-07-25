import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AirQ — Read the invisible",
  description:
    "One photograph of the sky. A vision model reads the haze, fuses it with ground stations and weather, and returns the air quality where you are standing.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
