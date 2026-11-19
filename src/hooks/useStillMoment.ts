import { useEffect, useRef, useState } from 'react';

/**
 * A still moment on the map: the player has stayed within a few metres for a while (T002). A card
 * that opens by itself (the raid result) waits for one, so it never covers the map while the
 * player walks between rides.
 */
export const STILL_RADIUS_M = 12;
export const STILL_HOLD_MS = 12_000;

export interface StillAnchor { readonly latitude: number; readonly longitude: number; readonly since: number }

function meters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const r = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Pure: the anchor after a new fix. A step past the radius starts a new anchor (the still clock restarts). */
export function nextStillAnchor(anchor: StillAnchor | null, fix: { latitude: number; longitude: number } | null, now: number,
  radius = STILL_RADIUS_M): StillAnchor | null {
  if (!fix || !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return null;
  if (!anchor || meters(anchor, fix) > radius) return { latitude: fix.latitude, longitude: fix.longitude, since: now };
  return anchor;
}

/** Pure: has the player held still long enough? No fix yet: not still. */
export function isStill(anchor: StillAnchor | null, now: number, holdMs = STILL_HOLD_MS): boolean {
  return !!anchor && now - anchor.since >= holdMs;
}

/** True once the player has stayed put for `holdMs`; false again the moment they walk off. One timer, no polling. */
export default function useStillMoment(fix: { latitude: number; longitude: number } | null | undefined, holdMs = STILL_HOLD_MS): boolean {
  const anchor = useRef<StillAnchor | null>(null);
  const [still, setStill] = useState(false);
  const lat = fix?.latitude, lng = fix?.longitude;
  useEffect(() => {
    const now = Date.now();
    const next = nextStillAnchor(anchor.current, lat != null && lng != null ? { latitude: lat, longitude: lng } : null, now);
    anchor.current = next;
    if (isStill(next, now, holdMs)) { setStill(true); return undefined; }
    setStill(false);
    if (!next) return undefined;
    const timer = setTimeout(() => setStill(isStill(anchor.current, Date.now(), holdMs)), next.since + holdMs - now + 20);
    return () => clearTimeout(timer);
  }, [lat, lng, holdMs]);
  return still;
}
