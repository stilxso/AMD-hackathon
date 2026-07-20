"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L, { DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coords } from "@/types";
import { aqiColor } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type Props = {
  coords: Coords;
  aqi?: number;
};

function Recenter({ coords }: { coords: Coords }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([coords.latitude, coords.longitude], 13, { duration: 1.2 });
  }, [coords.latitude, coords.longitude, map]);
  return null;
}

function makePinIcon(hex: string): DivIcon {
  return L.divIcon({
    className: "airq-pin-wrapper",
    html: `<div class="airq-pin" style="background: radial-gradient(circle at 30% 30%, #d1fae5, ${hex} 55%, #064e3b 100%); box-shadow: 0 0 0 4px ${hex}30, 0 0 22px 6px ${hex}80;"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export default function MapView({ coords, aqi }: Props) {
  const { t } = useI18n();
  const hex = aqi != null ? aqiColor(aqi).hex : "#10b981";

  return (
    <div className="relative w-full h-full min-h-[360px] lg:min-h-[560px] rounded-2xl overflow-hidden border border-white/10">
      <MapContainer
        center={[coords.latitude, coords.longitude]}
        zoom={13}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap · Carto'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Recenter coords={coords} />
        <Marker position={[coords.latitude, coords.longitude]} icon={makePinIcon(hex)}>
          <Popup>
            <div style={{ fontFamily: "system-ui", color: "#0b3b26" }}>
              <div style={{ fontWeight: 600 }}>{t.yourLocation}</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, marginTop: 2 }}>
                {coords.latitude.toFixed(4)}°, {coords.longitude.toFixed(4)}°
              </div>
              {aqi != null && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  {t.aqi}: <strong>{aqi}</strong>
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
      {/* subtle green vignette */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_120px_rgba(6,20,13,0.9)]" />
    </div>
  );
}
