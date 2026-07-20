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

### Backend
1. Go into the backend directory: `cd backend`
2. Create a virtual environment (optional but recommended): `python -m venv venv && source venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Start the FastAPI server: `uvicorn app.main:app --host 0.0.0.1 --port 8000 --reload`
*Note: Make sure `.env` is populated with the correct API keys for OpenWeather, Mapbox, and WAQI.*

### Frontend
1. Go into the frontend directory: `cd airq`
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`
4. Open `http://localhost:3000` in your browser.

---

## Technologies Used
* **Frontend:** Next.js, React, TailwindCSS, Mapbox GL JS
* **Backend:** FastAPI, Python, Pydantic, HTTPX
* **Machine Learning:** PyTorch, Torchvision (EfficientNet-B0)
* **External APIs:** WAQI (World Air Quality Index), OpenAQ, OpenWeatherMap, Mapbox