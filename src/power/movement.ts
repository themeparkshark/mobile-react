/**
 * When the player last really moved. LocationProvider reports each published
 * fix; only a move of MOVE_MIN_M or more from the last moving point counts,
 * so GPS drift while standing in line never reads as walking.
 */
export const MOVE_MIN_M = 3;

let lastMoveAt: number | null = null;
let anchor: { latitude: number; longitude: number } | null = null;
const listeners = new Set<() => void>();

export function metresBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const r = 6371000; const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Report a published fix. Returns true when it counted as a move. */
export function markMoved(position: { latitude: number; longitude: number }, now = Date.now()): boolean {
  if (anchor && metresBetween(anchor, position) < MOVE_MIN_M) return false;
  anchor = { latitude: position.latitude, longitude: position.longitude };
  lastMoveAt = now;
  if (listeners.size) listeners.forEach(fn => fn());
  return true;
}

export function lastMovedAt(): number | null { return lastMoveAt; }

export function onMoved(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test hook. */
export function resetMovement(): void { lastMoveAt = null; anchor = null; }
