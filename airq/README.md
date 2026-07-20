# AirQ — ECO-MONITORING MVP

Rapid-prototype (vibecode) frontend for the **Tech Vision 2026** hackathon.
Snap a photo of the sky → an AI backend (mocked here) returns local air-quality.

Built to the spec provided: Next.js 14 App Router · Tailwind · framer-motion ·
react-leaflet · lucide-react. Ships a mock `/api/analyze` route so the
frontend runs end-to-end without the Python backend.

---

## Quick start

```bash
cd airq
npm install
npm run dev
# open http://localhost:3000
```

Requires Node 18.17+ (Next 14).

## Live-demo safety nets

- **Demo Load button** — bypasses camera + GPS, injects an Almaty haze photo
  and the required coordinates (43.2389, 76.8897), triggers the full
  scanning animation, so the flow is bulletproof on stage.
- **Geolocation fallback** — if the browser denies location or times out,
  a manual dropdown appears (Astana Left Bank / Almaty Center /
  Karaganda Zone 1). App never crashes.
- **SSR-safe map** — `MapView` is isolated in a dedicated file and imported
  via `next/dynamic({ ssr: false })` with a styled skeleton, so
  `window is not defined` cannot happen at build time.

## API contract

`POST /api/analyze` — `multipart/form-data` with:

- `file` — the image blob
- `latitude` — float
- `longitude` — float

Returns:

```json
{
  "aqi_score": 120,
  "status_text": "Unhealthy for Sensitive Groups",
  "ai_confidence": 0.89,
  "dominant_pollutant": "PM2.5"
}
```

The mock delays 3–4 s and returns a random realistic response, matching the
contract exactly — swap the frontend's `fetch("/api/analyze")` target to
the real FastAPI URL when the backend is ready. No other changes required.

## Design system: "Green Nature Tech"

- Deep forest base (`#06140d`) with a subtle radial forest glow, never plain
  black/gray.
- Every panel is glassmorphism: `backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl shadow-xl`.
- Neon emerald accents for primary CTA, with a soft `0 0 15px rgba(16,185,129,0.5)` glow.
- Custom keyframes: `scan-line` (sweeping green beam over the uploaded image),
  `pulse-glow` (soft ring on interactive tiles), `grid-drift` (subtle
  cyber-grid ambience), `pulse-ring` (map pin).
- Dark Carto tiles for the map, filtered towards green to match theme.

## i18n

Lightweight React context in `lib/i18n.tsx` — no external i18n library.
Supports **EN / RU / KZ**, persisted to `localStorage`. All UI strings,
scanning phases, AQI labels, error copy, and location prompts are
translated. Toggle sits in the top-right header.

## Screen flow

- **A · Capture** — glass dropzone dominates; asks for geolocation on click,
  then opens the file picker / camera.
- **B · Scan** — image inside a glass card with a sweeping neon scan line
  and rotating localized status strings.
- **C · Verdict** — score panel colour-coded by AQI (green/yellow/orange/red/
  fuchsia/rose), confidence bar, dominant pollutant, coordinates, and a
  glowing pin dropped on the interactive map at the user's exact location.

## Hackathon marking checklist ("Tech Vision 2026" positioning)

| Criterion | Where it lands |
| --- | --- |
| Working MVP | End-to-end: capture → GPS/fallback → scanning animation → verdict + map. Everything runs on `npm run dev`. |
| Innovation / vibe | Cyber-Ecology aesthetic, neon scan animation, live pulsing pin — presentation-grade in 3-4 s. |
| Design & UX | Consistent glassmorphism system, colour-coded AQI, animated ambience, mobile-first "capture-first" layout, desktop dashboard split. |
| Technical quality | TypeScript, Next 14 App Router, SSR-safe dynamic import for leaflet, strict typing on API contract, no heavy i18n dep. |
| Localization | EN / RU / KZ toggle wired through every visible string, persisted per browser. |
| Demo readiness | `Demo Load` button + geolocation fallback so live demo cannot fail on stage. |
| Backend contract | Handshake spec followed exactly; mock returns realistic AQI buckets. |

## File map

```
app/
  api/analyze/route.ts   # mock backend (3–4 s delay, realistic response)
  layout.tsx             # theme + i18n provider
  page.tsx               # single-page flow (capture / scan / verdict)
  globals.css            # theme tokens + leaflet overrides + pin animation
components/
  Header.tsx             # brand + language toggle
  LanguageToggle.tsx     # EN | RU | KZ
  UploadDropzone.tsx     # drag/drop + camera + Demo Load
  ScannerAnimation.tsx   # framer-motion scan-line over uploaded image
  ResultsCard.tsx        # AQI verdict, confidence, pollutant, coords
  LocationFallback.tsx   # manual city dropdown when GPS unavailable
  MapView.tsx            # react-leaflet map (client-only)
  MapSkeleton.tsx        # placeholder while map hydrates
lib/
  i18n.tsx               # provider + dictionaries + AQI labels
  utils.ts               # cn(), aqi color scale
types/
  index.ts               # AnalyzeResponse, Coords, PresetLocation
```
