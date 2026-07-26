"use client";

import { useEffect, useState } from "react";
import { MapPin, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { addLocation, deleteLocation, fetchLocations } from "@/lib/cabinet";
import { SwapAction } from "@/components/landing/magnetic";
import { ALARM } from "@/lib/utils";
import type { Coords, SavedLocation } from "@/types";

export function PlacesPanel({ coords, onChanged }: { coords: Coords | null; onChanged: () => void }) {
  const { t } = useI18n();
  const { authFetch } = useAuth();
  const [places, setPlaces] = useState<SavedLocation[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchLocations(authFetch, ctrl.signal)
      .then((rows) => {
        setPlaces(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [authFetch]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!coords || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await addLocation(authFetch, name.trim(), coords.latitude, coords.longitude);
      setPlaces((prev) => [created, ...prev]);
      setName("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await deleteLocation(authFetch, id);
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="lp-panel space-y-5 p-5 sm:p-6">
        <div>
          <div className="lp-mono text-white/40">{t.locationsTitle}</div>
          <p className="mt-2 text-sm text-white/35">{t.locationsHint}</p>
        </div>

        <label className="block">
          <span className="lp-mono text-white/35">{t.locationName}</span>
          <input
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.locationNamePlaceholder}
            className="lp-field"
          />
        </label>

        <div className="lp-mono text-white/30">
          {coords ? (
            <>
              {t.locationUseCurrent} · {coords.latitude.toFixed(4)}°, {coords.longitude.toFixed(4)}°
            </>
          ) : (
            t.locationNoCoords
          )}
        </div>

        {error && (
          <div className="lp-mono" style={{ color: ALARM }}>
            {error}
          </div>
        )}

        <SwapAction
          type="submit"
          label={t.locationAdd}
          disabled={!coords || !name.trim() || saving}
          className="w-full"
        />
      </form>

      {loading ? (
        <div className="lp-mono py-10 text-center text-white/35">{t.cabinetLoading}</div>
      ) : places.length === 0 ? (
        <div className="lp-panel px-5 py-12 text-center">
          <div className="lp-mono text-white/45">{t.locationsEmpty}</div>
        </div>
      ) : (
        <ul className="lp-panel px-5">
          {places.map((place, i) => (
            <li
              key={place.id}
              className={
                "flex items-center gap-4 py-3.5" +
                (i < places.length - 1 ? " border-b border-white/[0.08]" : "")
              }
            >
              <MapPin className="h-4 w-4 shrink-0 text-white/30" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white/85">{place.name}</div>
                <div className="font-mono text-[11px] tabular-nums text-white/30">
                  {place.latitude.toFixed(4)}°, {place.longitude.toFixed(4)}°
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(place.id)}
                data-cursor="grow"
                aria-label={t.locationDelete}
                title={t.locationDelete}
                className="border border-white/15 p-1.5 text-white/40 transition-colors hover:border-white/40 hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
