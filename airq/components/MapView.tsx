"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
// mapbox-gl.css is imported globally in app/globals.css — importing it here
// instead would ship it inside this component's on-demand chunk, so it can
// arrive after the map already initialized (canvas sizes/positions wrong).
import { MapPinned, KeyRound, Radio, Loader2 } from "lucide-react";
import type { Coords, Station, StationsResponse } from "@/types";
import { useI18n } from "@/lib/i18n";

type Props = {
  coords: Coords;
  aqi?: number;
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const RADIUS_KM = 50;

// AQI color stops shared by the heatmap gradient, station dots and legend.
const AQI_STEPS: Array<[number, string]> = [
  [0, "#34d399"],
  [50, "#facc15"],
  [100, "#fb923c"],
  [150, "#f87171"],
  [200, "#e879f9"],
  [300, "#e11d48"],
];

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function toGeoJSON(stations: Station[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature",
      properties: {
        aqi: s.aqi,
        pm25: s.pm25,
        name: s.name,
        source: s.source,
        kind: s.kind,
        distanceKm: s.distanceKm,
      },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  };
}

export default function MapView({ coords, aqi }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);

  // ---- fetch real readings whenever the position changes ----
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(
      `/api/v1/stations?latitude=${coords.latitude}&longitude=${coords.longitude}&radius_km=${RADIUS_KM}`,
      { signal: ctrl.signal },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<StationsResponse>;
      })
      .then((d) => {
        setStations(d.stations);
        setLoading(false);
      })
      .catch((e) => {
        // An abort means a newer position superseded this request — the newer
        // one owns the loading state, so leave it alone.
        if (e.name === "AbortError") return;
        setStations([]);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [coords.latitude, coords.longitude]);

  // ---- init map once ----
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [coords.longitude, coords.latitude],
      zoom: 10,
      attributionControl: true,
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("stations", { type: "geojson", data: EMPTY });

      // Heatmap: measured AQI spread across the local network.
      map.addLayer({
        id: "stations-heat",
        type: "heatmap",
        source: "stations",
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
          // Real monitors are far sparser than the old generated scatter, so
          // the influence radius has to be much wider to read as a field.
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 40, 14, 110],
          "heatmap-opacity": 0.75,
        },
      });

      // One dot per real reading. Unlike the generated field these are few and
      // meaningful, so they stay visible at every zoom level.
      map.addLayer({
        id: "stations-points",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 16, 11],
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
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          // Modelled points are drawn hollow-ish so they are never mistaken
          // for a physical monitor at that exact spot.
          "circle-stroke-color": [
            "case",
            ["==", ["get", "kind"], "model"],
            "rgba(255,255,255,0.9)",
            "rgba(255,255,255,0.35)",
          ],
        },
      });

      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      map.on("mouseenter", "stations-points", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as {
          aqi: number; pm25: number; name: string; source: string; kind: string; distanceKm: number;
        };
        const geom = f.geometry as { type: "Point"; coordinates: [number, number] };
        const origin = p.kind === "model" ? `${p.source} · ${t.modelled}` : `${p.source} · ${p.distanceKm} km`;
        popup
          .setLngLat(geom.coordinates)
          .setHTML(
            `<div style="font-family:system-ui;color:#0b3b26;font-size:12px;max-width:220px">
               <div style="font-weight:600;margin-bottom:2px">${p.name}</div>
               <div>${t.aqi} <strong>${p.aqi}</strong> · PM2.5 ${p.pm25} µg/m³</div>
               <div style="opacity:.65;margin-top:2px">${origin}</div>
             </div>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", "stations-points", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      placeMarker(map);
      // Readings are pushed by the [stations] effect below — it re-runs on
      // "load" when the fetch resolves before the style is ready.
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
             ${aqi != null ? `<div style="font-size:12px;margin-top:2px">${t.aqi} <strong>${aqi}</strong></div>` : ""}
             <div style="font-family:ui-monospace,monospace;font-size:12px;margin-top:2px">${coords.latitude.toFixed(
               4,
             )}°, ${coords.longitude.toFixed(4)}°</div>
           </div>`,
        ),
      )
      .addTo(map);
  }

  // ---- recenter + move marker when the position changes ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      placeMarker(map);
      map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 10, duration: 1200, essential: true });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.latitude, coords.longitude, aqi]);

  // ---- push fetched readings into the map source ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // isStyleLoaded() can already be true while the "load" handler above has
    // not yet run addSource("stations"). A single attempt then finds no source,
    // silently drops the readings, and — having taken the non-"load" branch —
    // never retries, so the map stays empty until the coordinates change.
    // Retrying on sourcedata covers both orderings.
    const apply = () => {
      const src = map.getSource("stations") as mapboxgl.GeoJSONSource | undefined;
      if (!src) return false;
      src.setData(toGeoJSON(stations) as never);
      return true;
    };
    if (apply()) return;
    const retry = () => {
      if (apply()) map.off("sourcedata", retry);
    };
    map.on("sourcedata", retry);
    return () => {
      map.off("sourcedata", retry);
    };
  }, [stations]);

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

  const sensorCount = stations.filter((s) => s.kind === "sensor").length;

  return (
    <div className="relative w-full h-full min-h-[360px] lg:min-h-[560px] rounded-2xl overflow-hidden border border-white/10">
      <div ref={containerRef} className="absolute inset-0" />

      {/* live location badge */}
      <div className="pointer-events-none absolute top-3 left-3 z-[5] glass px-2.5 py-1.5 flex items-center gap-2 text-[11px] text-emerald-100/85">
        <MapPinned className="w-3.5 h-3.5 text-emerald-300" />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-glow-emerald animate-pulse" />
        {t.locationLive}
      </div>

      {/* what the dots actually are — sensor count vs modelled fallback */}
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[5] glass px-2.5 py-1.5 flex items-center gap-2 text-[11px] text-emerald-100/85">
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 text-emerald-300 animate-spin" />
            {t.stationsLoading}
          </>
        ) : (
          <>
            <Radio className="w-3.5 h-3.5 text-emerald-300" />
            {sensorCount > 0
              ? `${sensorCount} ${t.stationsNearby}`
              : t.stationsModelled}
          </>
        )}
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
