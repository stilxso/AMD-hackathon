# AirQ - PM2.5 Pollution Estimator

Welcome to **AirQ**, a full-stack platform that uses an image's environment (sky, landscape, air) along with your geolocation to estimate the PM2.5 pollution level and calculate your AQI score.

This project was built from scratch using a fine-tuned EfficientNet-B0 ML model and modern web technologies to give an easy-to-use yet powerful API.

---

## Technical Overview

The architecture is built around Next.js (React) on the frontend and FastAPI (Python) on the backend. 
When a user uploads a photo, the backend uses a custom Vision AI model, along with real-time station data from external providers, to fuse and predict the most accurate Air Quality Index possible.

### The 5 Stages of the Project

The backend was developed in 5 smaller, manageable stages:

#### Stage 1: Backend Foundation
- A robust FastAPI backend scaffolding was constructed inside `/backend`.
- Configured environment variables (API keys, ports) using Pydantic Settings.
- Added a health endpoint to monitor liveness.
- Removed unnecessary large binaries (e.g., zip files) from Git to maintain a clean repo.

#### Stage 2: ML Inference Engine
- Created the core AI prediction pipeline using `torch` and `torchvision`.
- Evaluated the `fineweights.pt` weights and successfully mapped them to the `EfficientNet-B0` feature extractor.
- Integrated a customized 3-layer linear regression head that outputs the raw PM2.5 estimate.
- Implemented lazy loading in the FastAPI lifespan to prevent server crashes if the model fails.

#### Stage 3: External API Integrations
- Implemented asynchronous API clients using `httpx` to fetch real-world data quickly.
- Built **WAQI** and **OpenAQ** integration to find real-time PM2.5 values of nearby stations.
- Built **OpenWeatherMap** integration to pull local temperature, wind speed, and humidity in real-time.

#### Stage 4: Fusion Engine
- Created `FusionEngine`, an advanced statistical blender.
- Modifies the AI's raw estimate based on weather (e.g., reducing the predicted PM2.5 on high-humidity days where the sky naturally looks hazy).
- Implements **Inverse Distance Weighting (IDW)** to smoothly interpolate data between the AI prediction and nearby physical sensors based on their distance in kilometers.

#### Stage 5: Final Endpoint & Frontend Polish
- Developed the main `/api/v1/analyze` endpoint bringing the ML model, External APIs, and Fusion Engine together.
- Rewrote `next.config.mjs` to proxy traffic smoothly to the backend without CORS issues.
- Transitioned the Next.js frontend map component from Leaflet to a beautiful **Mapbox GL JS** implementation for a more premium look.

---

## How to Run

### Docker (recommended)

Requires Docker with the Compose plugin. From the repo root:

```bash
cp backend/.env.example backend/.env   # then fill in your API tokens
docker compose up --build
```

Frontend on `http://localhost:3000`, backend on `http://localhost:8000`
(`/docs` for the OpenAPI UI). The frontend proxies `/api/v1/*` to the backend
container, so no CORS setup is needed.

The first build takes a few minutes — it installs CPU-only PyTorch and bakes the
sky gate's CLIP encoder into the image so the first upload doesn't stall on a
350 MB download. Later builds are cached.

Notes:
- The Mapbox token for the map comes from `airq/.env.local`
  (`NEXT_PUBLIC_MAPBOX_TOKEN=pk...`). It's read at image build time, so re-run
  `docker compose up --build` after changing it.
- User accounts live in the `airq-db` Docker volume and survive rebuilds.
  `docker compose down -v` wipes them.
- `docker compose up --build backend` runs just the API if you want to keep the
  frontend on `npm run dev`.

### Backend (manual)
1. Go into the backend directory: `cd backend`
2. Create a virtual environment (optional but recommended): `python -m venv venv && source venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Start the FastAPI server: `uvicorn app.main:app --host 0.0.0.1 --port 8000 --reload`
*Note: Make sure `.env` is populated with the correct API keys for OpenWeather, Mapbox, and WAQI.*

### Frontend (manual)
1. Go into the frontend directory: `cd airq`
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`
4. Open `http://localhost:3000` in your browser.

### Signing in
The app sits behind a login screen. A demo account is seeded on backend startup:

| Username | Password |
| --- | --- |
| `admin` | `doniponi228` |

The sign-in card has a **Use demo credentials** button that fills these in. You
can also register a new account from the same screen (username 3–32 chars,
password 8+ chars).

Accounts live in `backend/airq.db` (SQLite, gitignored), with passwords stored as
salted PBKDF2-HMAC-SHA256. Sessions are JWTs signed with `JWT_SECRET` from
`backend/.env` — leave it blank and the key is regenerated each restart, which
signs everyone out. Set `DEMO_PASSWORD=` (empty) to stop seeding the demo
account before deploying anywhere public.

---

## Technologies Used
* **Frontend:** Next.js, React, TailwindCSS, Mapbox GL JS
* **Backend:** FastAPI, Python, Pydantic, HTTPX
* **Machine Learning:** PyTorch, Torchvision (EfficientNet-B0)
* **External APIs:** WAQI (World Air Quality Index), OpenAQ, IQAir AirVisual, OpenWeatherMap, Mapbox, Google Gemini (LLM)

---

## Architecture & Business Model

### Mathematical/Algorithmic Model
Our pipeline uses **EfficientNet-B0** with a custom regression head. To calculate prediction uncertainty (confidence score), we use **Monte-Carlo (MC) Dropout**, running the regression head multiple times with dropout enabled.
This raw AI prediction is then passed into a **Data Fusion Engine**, blending it with meteorological data (humidity/wind) and real-time station data (WAQI/OpenAQ) using Inverse Distance Weighting. Finally, **Google Gemini LLM** generates a natural-language explanation of the local air quality.

### Commercial & Social Value
- **B2B / DaaS**: API access to hyper-local air quality data for real-estate, smart-home systems, and fitness apps.
- **Freemium B2C**: Free core features, with "AirQ Pro" offering personalized health push-notifications.
- **Social Impact**: Democratizing eco-monitoring by turning every smartphone into an air-quality sensor, filling "blind spots" in governmental monitoring networks.

---

## Future Roadmap: Claude-Inspired UI
We plan to transition the frontend to a distraction-free, conversational interface inspired by Claude AI:
- **Central Chat Thread**: AI responses streamed with markdown support.
- **Collapsible Sidebar**: For history and settings.
- **Floating Input Area**: Auto-expanding textarea with attachment buttons, pinned at the bottom.