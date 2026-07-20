"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
// mapbox-gl.css is imported globally in app/globals.css — importing it here
// instead would ship it inside this component's on-demand chunk, so it can
// arrive after the map already initialized (canvas sizes/positions wrong).
import { MapPinned, KeyRound } from "lucide-react";
import type { Coords } from "@/types";
import { generatePollution, toGeoJSON } from "@/lib/pollution";
import { useI18n } from "@/lib/i18n";

type Props = {
  coords: Coords;
  aqi?: number;
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// AQI color stops shared by the heatmap gradient, station dots and legend.
const AQI_STEPS: Array<[number, string]> = [
  [0, "#34d399"],
  [50, "#facc15"],
  [100, "#fb923c"],
  [150, "#f87171"],
  [200, "#e879f9"],
  [300, "#e11d48"],
];

export default function MapView({ coords, aqi }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const baseAqi = aqi ?? 90;

  // ---- init map once ----
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [coords.longitude, coords.latitude],
      zoom: 12,
      attributionControl: true,
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("pollution", {
        type: "geojson",
        data: toGeoJSON(generatePollution(coords, baseAqi)),
      });

      // Heatmap: pollution density colored green -> red by AQI weight.
      map.addLayer({
        id: "pollution-heat",
        type: "heatmap",
        source: "pollution",
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "aqi"], 0, 0, 300, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 1, 14, 3.2],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(6,20,13,0)",
            0.2, "rgba(16,185,129,0.55)",
            0.4, "rgba(250,204,21,0.65)",
            0.6, "rgba(251,146,60,0.75)",
            0.8, "rgba(248,113,113,0.85)",
            1, "rgba(225,29,72,0.92)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 18, 14, 46],
          "heatmap-opacity": 0.82,
        },
      });

      // Individual monitoring "stations" become visible as you zoom in.
      map.addLayer({
        id: "pollution-points",
        type: "circle",
        source: "pollution",
        minzoom: 11.5,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 9],
          "circle-color": [
            "step",
            ["get", "aqi"],
            AQI_STEPS[0][1],
            50, AQI_STEPS[1][1],
            100, AQI_STEPS[2][1],
            150, AQI_STEPS[3][1],
            200, AQI_STEPS[4][1],
            300, AQI_STEPS[5][1],
          ],
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 13, 0.75],
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.35)",
        },
      });

      // popup on station hover
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      map.on("mouseenter", "pollution-points", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const aqiVal = (f.properties as { aqi: number }).aqi;
        const geom = f.geometry as { type: "Point"; coordinates: [number, number] };
        const [lng, lat] = geom.coordinates;
        popup
          .setLngLat([lng, lat])
          .setHTML(
            `<div style="font-family:system-ui;color:#0b3b26;font-size:12px"><strong>${t.aqi} ${aqiVal}</strong></div>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", "pollution-points", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      placeMarker(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(map: mapboxgl.Map) {
    const el = document.createElement("div");
    el.className = "airq-pin";
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([coords.longitude, coords.latitude])
      .setPopup(
        new mapboxgl.Popup({ offset: 18 }).setHTML(
          `<div style="font-family:system-ui;color:#0b3b26">
             <div style="font-weight:600">${t.yourLocation}</div>
             <div style="font-family:ui-monospace,monospace;font-size:12px;margin-top:2px">${coords.latitude.toFixed(
               4,
             )}°, ${coords.longitude.toFixed(4)}°</div>
           </div>`,
        ),
      )
      .addTo(map);
  }

  // ---- react to coords / aqi changes: recenter, move marker, refresh pollution ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      placeMarker(map);
      map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 12, duration: 1200, essential: true });
      const src = map.getSource("pollution") as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(toGeoJSON(generatePollution(coords, baseAqi)) as never);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.latitude, coords.longitude, baseAqi]);

  if (!TOKEN) {
    return (
      <div className="relative w-full h-full min-h-[360px] lg:min-h-[560px] glass overflow-hidden flex items-center justify-center p-6">
        <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-40 animate-grid-drift" />
        <div className="relative z-10 max-w-sm text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center animate-pulse-glow">
            <KeyRound className="w-6 h-6 text-emerald-300" />
          </div>
          <div className="mt-4 text-white font-medium">{t.mapTokenMissing}</div>
          <p className="mt-2 text-emerald-100/65 text-sm">{t.mapTokenHint}</p>
          <code className="mt-3 inline-block text-[11px] font-mono text-emerald-200/80 bg-black/30 px-2 py-1 rounded-lg">
            NEXT_PUBLIC_MAPBOX_TOKEN=pk.…
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[360px] lg:min-h-[560px] rounded-2xl overflow-hidden border border-white/10">
      <div ref={containerRef} className="absolute inset-0" />

      {/* live location badge */}
      <div className="pointer-events-none absolute top-3 left-3 z-[5] glass px-2.5 py-1.5 flex items-center gap-2 text-[11px] text-emerald-100/85">
        <MapPinned className="w-3.5 h-3.5 text-emerald-300" />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-glow-emerald animate-pulse" />
        {t.locationLive}
      </div>

      {/* pollution legend */}
      <div className="absolute bottom-3 left-3 z-[5] glass px-3 py-2">
        <div className="text-[10px] uppercase tracking-widest text-emerald-100/60 mb-1.5">{t.pollutionLayer}</div>
        <div
          className="h-2 w-40 rounded-full"
          style={{
            background: "linear-gradient(90deg,#34d399,#facc15,#fb923c,#f87171,#e879f9,#e11d48)",
          }}
        />
        <div className="mt-1 flex justify-between text-[10px] text-emerald-100/60">
          <span>{t.low}</span>
          <span>{t.high}</span>
        </div>
      </div>

      {/* subtle green vignette — kept light so the basemap stays legible */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_60px_rgba(6,20,13,0.4)]" />
    </div>
  );
}
