import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // The whole product is authored monochrome: `white` means foreground,
      // `black` means background. Pointing both at tokens flips the entire
      // palette from one attribute on <html> — see app/globals.css.
      colors: {
        white: "rgb(var(--fg-rgb) / <alpha-value>)",
        black: "rgb(var(--bg-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 14px rgb(var(--fg-rgb) / 0.45)",
        "glow-lg": "0 0 44px rgb(var(--fg-rgb) / 0.18)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(var(--fg-rgb) / 0.35)" },
          "50%":      { boxShadow: "0 0 26px 6px rgb(var(--fg-rgb) / 0.12)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2.6s ease-in-out infinite",
        "float-slow": "float-slow 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
