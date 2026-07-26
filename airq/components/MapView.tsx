"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
// mapbox-gl.css is imported globally in app/globals.css — importing it here
// instead would ship it inside this component's on-demand chunk, so it can
// arrive after the map already initialized (canvas sizes/positions wrong).
import { AlertTriangle, Route } from "lucide-react";
import type {
  Coords,
  GridPoint,
  RouteProfile,
  RouteResponse,
  SourceHealth,
  Station,
  StationsResponse,
} from "@/types";
import { RoutePanel } from "@/components/RoutePanel";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { planRoute, routesToGeoJSON } from "@/lib/route";
import { ALARM } from "@/lib/utils";

type Props = {
  coords: Coords;
  aqi?: number;
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// The fetched box is grown beyond the viewport so small pans reuse it instead
// of hitting the API, and so the field's own rectangular edge stays off-screen.
const BBOX_PAD = 0.35;
// Long enough that a flyTo or a drag settles first — otherwise every
// intermediate frame of a pan queues its own request.
const REFETCH_DEBOUNCE_MS = 350;

// AQI stops shared by the field, station dots and legend.
//
// The rest of the product reads severity as density (see aqiTone), but over a
// map that ramp tops out at white — and white over a basemap is the one colour
// that cannot be told apart from roads, labels and snow. So the map alone runs
// green → red, where the hue itself carries the severity.
const AQI_STEPS: Array<[number, string]> = [
  [0, "#12c06a"],
  [50, "#93d227"],
  [100, "#f2c200"],
  [150, "#ff8a00"],
  [200, ALARM],
  [300, "#a5000f"],
];

/** The map's own ramp as CSS, so the legend cannot drift from the field. */
const MAP_GRADIENT = `linear-gradient(90deg,${AQI_STEPS.map(([, hex]) => hex).join(",")})`;

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

type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

/** The legend gradient as numbers, so the field and the legend cannot drift. */
const AQI_RAMP: Array<[number, [number, number, number]]> = AQI_STEPS.map(([v, hex]) => [
  v,
  [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ],
]);

function rampColor(aqi: number): [number, number, number] {
  if (aqi <= AQI_RAMP[0][0]) return AQI_RAMP[0][1];
  for (let i = 1; i < AQI_RAMP.length; i++) {
    const [v1, c1] = AQI_RAMP[i];
    const [v0, c0] = AQI_RAMP[i - 1];
    if (aqi <= v1) {
      const t = (aqi - v0) / (v1 - v0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return AQI_RAMP[AQI_RAMP.length - 1][1];
}

// A 1×1 transparent PNG. An image source must be created with a url, but the
// first field is not built until a fetch resolves.
const BLANK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * The modelled field as one continuous raster covering the whole sampled box.
 *
 * Drawing a polygon per cell — the previous approach — turned the field into a
 * mosaic of hard-edged squares with a visible seam at every boundary, and left
 * everything outside the fetched patch bare. Pollution does not have edges at
 * 0.1° intervals, and the tiling was the main thing making the layer hard to
 * read.
 *
 * So the samples go into a canvas one pixel per cell and are interpolated up.
 * Colour is still taken directly from the value, never from geometry density,
 * so the legend means exactly what it says at every zoom.
 */
type Quad = [[number, number], [number, number], [number, number], [number, number]];

function buildField(grid: GridPoint[], cellDeg: number): { url: string; coordinates: Quad } | null {
  if (grid.length === 0 || !(cellDeg > 0)) return null;

  // Snap to lattice indices: Open-Meteo answers with its own cell centres
  // (43.40001, not 43.4), so raw values cannot be compared for equality.
  const rowOf = grid.map((p) => Math.round(p.lat / cellDeg));
  const colOf = grid.map((p) => Math.round(p.lng / cellDeg));
  const minRow = Math.min(...rowOf);
  const maxRow = Math.max(...rowOf);
  const minCol = Math.min(...colOf);
  const maxCol = Math.max(...colOf);
  const rows = maxRow - minRow + 1;
  const cols = maxCol - minCol + 1;
  if (rows < 2 || cols < 2) return null;

  const cells = new Float32Array(rows * cols).fill(NaN);
  grid.forEach((p, i) => {
    // Row 0 is the northern edge — canvas y grows downward.
    cells[(maxRow - rowOf[i]) * cols + (colOf[i] - minCol)] = p.aqi;
  });

  // Upstream occasionally drops a coordinate. Filling with the mean keeps the
  // interpolation continuous instead of punching a black hole in the field.
  const present = grid.reduce((sum, p) => sum + p.aqi, 0) / grid.length;
  for (let i = 0; i < cells.length; i++) if (Number.isNaN(cells[i])) cells[i] = present;

  const small = document.createElement("canvas");
  small.width = cols;
  small.height = rows;
  const sctx = small.getContext("2d");
  if (!sctx) return null;
  const img = sctx.createImageData(cols, rows);
  for (let i = 0; i < cells.length; i++) {
    const [r, g, b] = rampColor(cells[i]);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    // Opaque here; the layer's raster-opacity does the blending. Interpolating
    // a varying alpha channel would fringe the colours at the transitions.
    img.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  // Upscaled with canvas smoothing rather than left to the GPU's sampler: it
  // makes the interpolation explicit and independent of how the renderer
  // happens to filter a texture this small.
  const scale = Math.max(4, Math.min(48, Math.round(768 / Math.max(rows, cols))));
  const out = document.createElement("canvas");
  out.width = cols * scale;
  out.height = rows * scale;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(small, 0, 0, out.width, out.height);

  // The samples are cell centres, so the image spans half a cell past the
  // outermost ones. Corner order is TL, TR, BR, BL.
  const west = (minCol - 0.5) * cellDeg;
  const east = (maxCol + 0.5) * cellDeg;
  const north = (maxRow + 0.5) * cellDeg;
  const south = (minRow - 0.5) * cellDeg;

  return {
    url: out.toDataURL("image/png"),
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  };
}

/** The A and B pins, as a DOM marker with the letter on it. */
function endpointMarker(letter: string): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = letter;
  el.style.cssText =
    "display:grid;place-items:center;width:22px;height:22px;border:1px solid rgba(255,255,255,.9);" +
    "background:#000;color:#fff;font:600 11px ui-monospace,monospace;border-radius:50%";
  return el;
}

export default function MapView({ coords, aqi }: Props) {
  const { t } = useI18n();
  const { authFetch } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const moveTimerRef = useRef<number | undefined>(undefined);
  const coveredRef = useRef<{ box: Bbox; zoom: number } | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [grid, setGrid] = useState<GridPoint[]>([]);
  // Reported by the backend rather than assumed: a wide viewport is sampled
  // coarser than the model's native lattice, and the field is drawn at
  // whatever spacing was actually used.
  const [cellDeg, setCellDeg] = useState(0.1);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(false);
  // A failed fetch used to be indistinguishable from a clean, unmonitored area:
  // the catch below emptied the readings and the badge then read "modelled".
  const [error, setError] = useState<string | null>(null);
  // The box currently being covered. Set from the map's own bounds, so the data
  // spans everything on screen instead of a fixed radius around the user.
  const [bbox, setBbox] = useState<Bbox | null>(null);

  // ---- clean-route planner ----
  const [routeMode, setRouteMode] = useState(false);
  // The run starts where the user is, so entering the mode prefills A and asks
  // only for the destination. Clicking again while both are set starts over.
  // One object, not two states: the click handler is attached once for the
  // whole mode and decides which end it is setting from the pair it already has.
  const [pins, setPins] = useState<{ start: Coords | null; end: Coords | null }>({
    start: null,
    end: null,
  });
  const [profile, setProfile] = useState<RouteProfile>("walking");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const endpointMarkersRef = useRef<mapboxgl.Marker[]>([]);

  // ---- fetch readings for whatever the map is showing ----
  useEffect(() => {
    if (!bbox) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    // latitude/longitude still identify the user's point — station distances
    // and the /feed/geo lookup are relative to it — while the box says how much
    // ground to cover.
    const qs = new URLSearchParams({
      latitude: String(coords.latitude),
      longitude: String(coords.longitude),
      min_lat: bbox.minLat.toFixed(4),
      min_lng: bbox.minLng.toFixed(4),
      max_lat: bbox.maxLat.toFixed(4),
      max_lng: bbox.maxLng.toFixed(4),
    });
    fetch(`/api/v1/stations?${qs}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<StationsResponse>;
      })
      .then((d) => {
        setStations(d.stations);
        setGrid(d.grid ?? []);
        if (d.gridCellDeg) setCellDeg(d.gridCellDeg);
        setSources(d.sources ?? []);
        setLoading(false);
      })
      .catch((e) => {
        // An abort means a newer viewport superseded this request — the newer
        // one owns the loading state, so leave it alone.
        if (e.name === "AbortError") return;
        setStations([]);
        setGrid([]);
        setSources([]);
        setError(e instanceof Error ? e.message : "request failed");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [bbox, coords.latitude, coords.longitude]);

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
      map.addSource("grid", {
        type: "image",
        url: BLANK_PNG,
        coordinates: [
          [-1, 1],
          [1, 1],
          [1, -1],
          [-1, -1],
        ],
      });
      map.addSource("stations", { type: "geojson", data: EMPTY });

      // Pollution field, as one interpolated raster over the sampled box.
      //
      // A heatmap layer was the wrong primitive here. Its colour is driven by
      // `heatmap-density` — how much weighted geometry piles up under a pixel —
      // not by the value itself. Over scattered monitors that conflates "many
      // stations" with "dirty air", and over a lattice it depends on the blur
      // radius, so the same concentration renders differently at each zoom.
      //
      // A polygon per cell fixed the colour but not the readability: it tiled
      // the map with hard-edged squares and stopped at the edge of one small
      // patch. The raster keeps colour tied directly to value while covering
      // everything on screen continuously. See buildField.
      //
      // Slotted beneath the basemap's first symbol layer so place names and
      // road labels stay legible through it.
      const firstSymbol = map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
      map.addLayer(
        {
          id: "grid-field",
          source: "grid",
          type: "raster",
          paint: {
            "raster-opacity": 0.62,
            // Cross-fading between the old and new image on every viewport
            // change reads as a flicker.
            "raster-fade-duration": 0,
            "raster-resampling": "linear",
          },
        },
        firstSymbol,
      );

      // Route candidates, drawn under the station dots so a monitor is never
      // hidden by a line passing over it.
      //
      // All of them are drawn, not only the winner. The rejected detours are
      // the argument for the recommendation: a line swinging through the dirty
      // side of town explains the chosen one better than any number does.
      map.addSource("routes", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "routes-other",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "role"], "other"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "rgba(255,255,255,0.85)", "line-width": 1.5, "line-opacity": 0.28 },
      });
      map.addLayer({
        id: "routes-shortest",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "role"], "shortest"],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": "rgba(255,255,255,0.9)",
          "line-width": 2.5,
          // Dashed: this is the route being compared against, not the advice.
          "line-dasharray": [1.6, 1.6],
        },
      });
      map.addLayer({
        id: "routes-recommended-casing",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "role"], "recommended"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#000", "line-width": 8, "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "routes-recommended",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "role"], "recommended"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          // Same steps as the field and the dots: the line's colour is the air
          // on it, read against the identical legend.
          "line-color": [
            "step",
            ["get", "aqi"],
            AQI_STEPS[0][1],
            50, AQI_STEPS[1][1],
            100, AQI_STEPS[2][1],
            150, AQI_STEPS[3][1],
            200, AQI_STEPS[4][1],
            300, AQI_STEPS[5][1],
          ],
          "line-width": 4.5,
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
            `<div style="font-family:system-ui;color:#fff;font-size:12px;max-width:220px">
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
      syncViewport(map);
      // Readings are pushed by the [stations] effect below — it re-runs on
      // "load" when the fetch resolves before the style is ready.
    });

    const onMoveEnd = () => {
      window.clearTimeout(moveTimerRef.current);
      moveTimerRef.current = window.setTimeout(() => syncViewport(map), REFETCH_DEBOUNCE_MS);
    };
    map.on("moveend", onMoveEnd);

    return () => {
      window.clearTimeout(moveTimerRef.current);
      map.off("moveend", onMoveEnd);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Ask for a new box only when the current one no longer covers the screen.
   *
   * Every pan and zoom would otherwise re-request an almost identical field.
   * The stored box is padded, so nudging the map around reuses it; escaping it
   * — or changing zoom enough to change the sampling resolution — refetches.
   */
  function syncViewport(map: mapboxgl.Map) {
    const b = map.getBounds();
    if (!b) return;
    const zoom = Math.round(map.getZoom());
    const covered = coveredRef.current;
    if (
      covered &&
      covered.zoom === zoom &&
      b.getSouth() >= covered.box.minLat &&
      b.getWest() >= covered.box.minLng &&
      b.getNorth() <= covered.box.maxLat &&
      b.getEast() <= covered.box.maxLng
    ) {
      return;
    }

    const padLat = (b.getNorth() - b.getSouth()) * BBOX_PAD;
    const padLng = (b.getEast() - b.getWest()) * BBOX_PAD;
    const box: Bbox = {
      minLat: Math.max(-85, b.getSouth() - padLat),
      minLng: Math.max(-180, b.getWest() - padLng),
      maxLat: Math.min(85, b.getNorth() + padLat),
      maxLng: Math.min(180, b.getEast() + padLng),
    };
    if (box.minLat >= box.maxLat || box.minLng >= box.maxLng) return;

    coveredRef.current = { box, zoom };
    setBbox(box);
  }

  function placeMarker(map: mapboxgl.Map) {
    const el = document.createElement("div");
    el.className = "airq-pin";
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([coords.longitude, coords.latitude])
      .setPopup(
        new mapboxgl.Popup({ offset: 18 }).setHTML(
          `<div style="font-family:system-ui;color:#fff">
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
      const gridSrc = map.getSource("grid") as mapboxgl.ImageSource | undefined;
      // The layer check matters as much as the sources: addSource can emit
      // sourcedata before the "load" handler has reached addLayer, and
      // setLayoutProperty on a layer that does not exist yet throws.
      if (!src || !gridSrc || !map.getLayer("grid-field")) return false;
      src.setData(toGeoJSON(stations) as never);

      const field = buildField(grid, cellDeg);
      if (field) {
        gridSrc.updateImage({ url: field.url, coordinates: field.coordinates });
        map.setLayoutProperty("grid-field", "visibility", "visible");
      } else {
        // No usable field. Hiding the layer leaves the last image in place but
        // off-screen-invisible, rather than stretching stale data over the map.
        map.setLayoutProperty("grid-field", "visibility", "none");
      }
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
  }, [stations, grid, cellDeg]);

  // ---- route mode: pick the endpoints by clicking the map ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeMode) return;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const picked = { latitude: e.lngLat.lat, longitude: e.lngLat.lng };
      setPins((p) =>
        // A complete pair means the user is starting a new route, not editing
        // this one — otherwise the third click would silently move B and it
        // would never be clear which end had changed.
        !p.start || p.end ? { start: picked, end: null } : { start: p.start, end: picked },
      );
    };

    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [routeMode]);

  // ---- A / B markers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    endpointMarkersRef.current.forEach((m) => m.remove());
    endpointMarkersRef.current = [];
    if (!routeMode) return;

    ([["A", pins.start], ["B", pins.end]] as const).forEach(([letter, c]) => {
      if (!c) return;
      endpointMarkersRef.current.push(
        new mapboxgl.Marker({ element: endpointMarker(letter) })
          .setLngLat([c.longitude, c.latitude])
          .addTo(map),
      );
    });
  }, [routeMode, pins]);

  // ---- plan the route whenever both ends (or the profile) change ----
  useEffect(() => {
    if (!routeMode || !pins.start || !pins.end) {
      setRoute(null);
      setRouteError(null);
      return;
    }
    const ctrl = new AbortController();
    setRouteLoading(true);
    setRouteError(null);
    planRoute(authFetch, pins.start, pins.end, profile, ctrl.signal)
      .then((r) => {
        setRoute(r);
        setRouteLoading(false);
      })
      .catch((e: unknown) => {
        // A newer request superseded this one; it owns the state now.
        if (e instanceof Error && e.name === "AbortError") return;
        setRoute(null);
        setRouteError(e instanceof Error ? e.message : "request failed");
        setRouteLoading(false);
      });
    return () => ctrl.abort();
  }, [routeMode, pins, profile, authFetch]);

  // ---- push the candidates into the map source ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Same ordering problem as the readings effect: sourcedata can fire before
    // the "load" handler has created this source.
    const apply = () => {
      const src = map.getSource("routes") as mapboxgl.GeoJSONSource | undefined;
      if (!src) return false;
      src.setData((route ? routesToGeoJSON(route) : EMPTY) as never);
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
  }, [route]);

  function openRouteMode() {
    // The run starts where you are, so only the destination needs a click.
    setPins({ start: coords ? { ...coords } : null, end: null });
    setRouteMode(true);
  }

  function closeRouteMode() {
    setRouteMode(false);
    setPins({ start: null, end: null });
    setRoute(null);
    setRouteError(null);
  }

  if (!TOKEN) {
    return (
      <div className="relative flex h-full min-h-[360px] w-full items-center justify-center overflow-hidden border border-white/10 p-6 lg:min-h-[560px]">
        <div aria-hidden className="lp-lattice pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative z-10 max-w-sm text-center">
          <div className="lp-mono text-white/70">{t.mapTokenMissing}</div>
          <p className="mt-3 text-sm leading-relaxed text-white/40">{t.mapTokenHint}</p>
          <code className="mt-4 inline-block border border-white/15 px-2 py-1 font-mono text-[11px] text-white/70">
            NEXT_PUBLIC_MAPBOX_TOKEN=pk.…
          </code>
        </div>
      </div>
    );
  }

  const sensorCount = stations.filter((s) => s.kind === "sensor").length;
  // Only genuinely broken sources are worth the user's attention. "disabled"
  // (no key configured) and "empty" (nothing to report here) are expected states.
  const brokenSources = sources.filter(
    (s) => s.status === "unauthorized" || s.status === "error",
  );

  return (
    <div className="relative h-full min-h-[360px] w-full overflow-hidden border border-white/10 lg:min-h-[560px]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* live location badge */}
      <div className="lp-mono pointer-events-none absolute left-3 top-3 z-[5] flex items-center gap-2 border border-white/15 bg-black/70 px-2.5 py-1.5 text-white/75 backdrop-blur-md">
        <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
        {t.locationLive}
      </div>

      {/* what the dots actually are — sensor count vs modelled fallback */}
      <div className="lp-mono pointer-events-none absolute left-1/2 top-3 z-[5] flex -translate-x-1/2 items-center gap-2 border border-white/15 bg-black/70 px-2.5 py-1.5 text-white/75 backdrop-blur-md">
        {loading ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border border-white/25 border-t-white" />
            {t.stationsLoading}
          </>
        ) : error ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: ALARM }} />
            <span style={{ color: ALARM }}>
              {t.stationsFailed} · {error}
            </span>
          </>
        ) : (
          <>
            <span className="h-1 w-1 rounded-full bg-white/70" />
            {sensorCount > 0 ? `${sensorCount} ${t.stationsNearby}` : t.stationsModelled}
            {grid.length > 0 && (
              <span className="text-white/40">· {grid.length} {t.gridCells}</span>
            )}
          </>
        )}
      </div>

      {/* Degraded upstreams. Without this a dead API key is indistinguishable
          from a genuinely clean, unmonitored area. */}
      {!loading && brokenSources.length > 0 && (
        <div className="absolute left-1/2 top-14 z-[5] max-w-[min(90%,20rem)] -translate-x-1/2 border border-white/20 bg-black/80 px-3 py-2 backdrop-blur-md">
          <div className="lp-mono flex items-center gap-2" style={{ color: ALARM }}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {t.sourcesDegraded}
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-white/50">
            {brokenSources.map((s) => (
              <li key={s.name}>
                <span className="font-mono text-white/70">{s.name}</span>: {s.status}
                {s.detail ? ` — ${s.detail}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* pollution legend */}
      <div className="absolute bottom-3 left-3 z-[5] border border-white/15 bg-black/70 px-3 py-2.5 backdrop-blur-md">
        <div className="lp-mono mb-2 text-white/45">{t.pollutionLayer}</div>
        <div className="h-1.5 w-40" style={{ background: MAP_GRADIENT }} />
        <div className="lp-mono mt-1.5 flex justify-between text-white/45">
          <span>{t.low}</span>
          <span>{t.high}</span>
        </div>
      </div>

      {/* clean-route planner */}
      {routeMode ? (
        <RoutePanel
          profile={profile}
          onProfile={setProfile}
          hasStart={pins.start != null}
          hasEnd={pins.end != null}
          loading={routeLoading}
          error={routeError}
          result={route}
          onClear={() => setPins({ start: coords ? { ...coords } : null, end: null })}
          onClose={closeRouteMode}
        />
      ) : (
        <button
          type="button"
          onClick={openRouteMode}
          data-cursor="grow"
          className="lp-mono absolute bottom-3 right-3 z-[6] flex items-center gap-2 border border-white/15 bg-black/70 px-2.5 py-1.5 text-white/70 backdrop-blur-md transition-colors hover:border-white/35 hover:text-white"
        >
          <Route className="h-3.5 w-3.5" />
          {t.routeOpen}
        </button>
      )}

      {/* vignette — pulls the basemap's edges back into the page's black */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.75)]" />
    </div>
  );
}
