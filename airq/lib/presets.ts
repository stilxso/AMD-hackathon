import type { Dict } from "@/lib/i18n";
import type { PresetLocation } from "@/types";

/** The city shortcuts, shared by the geolocation fallback and the admin
 *  override panel so both offer the same coordinates. */
export function buildPresets(t: Dict): PresetLocation[] {
  return [
    { key: "astana",    label: t.fallbackAstana,    coords: { latitude: 51.128,  longitude: 71.430 } },
    { key: "almaty",    label: t.fallbackAlmaty,    coords: { latitude: 43.2389, longitude: 76.8897 } },
    { key: "karaganda", label: t.fallbackKaraganda, coords: { latitude: 49.807,  longitude: 73.088 } },
  ];
}
