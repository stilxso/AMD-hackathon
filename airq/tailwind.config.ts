import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          950: "#06140d",
          900: "#08201430",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        "glow-emerald": "0 0 15px rgba(16,185,129,0.5)",
        "glow-emerald-lg": "0 0 40px rgba(16,185,129,0.35)",
      },
      keyframes: {
        "scan-line": {
          "0%":   { transform: "translateY(-8%)", opacity: "0.0" },
          "10%":  { opacity: "1" },
          "50%":  { transform: "translateY(108%)", opacity: "1" },
          "90%":  { opacity: "1" },
          "100%": { transform: "translateY(-8%)", opacity: "0.0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(16,185,129,0.55)" },
          "50%":      { boxShadow: "0 0 24px 8px rgba(16,185,129,0.25)" },
        },
        "grid-drift": {
          "0%":   { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "60px 60px" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "scan-line": "scan-line 2.4s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2.6s ease-in-out infinite",
        "grid-drift": "grid-drift 22s linear infinite",
        "float-slow": "float-slow 6s ease-in-out infinite",
      },
      backgroundImage: {
        "cyber-grid":
          "linear-gradient(rgba(16,185,129,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.08) 1px, transparent 1px)",
        "forest-radial":
          "radial-gradient(1200px 700px at 20% -10%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(900px 600px at 90% 10%, rgba(5,150,105,0.14), transparent 60%)",
      },
    },
  },
  plugins: [],
};
export default config;
