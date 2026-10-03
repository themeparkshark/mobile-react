import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALL_RIDES, type RideKind } from './catalog';

/**
 * The rides this player has snapped (the "7 of 8 rides snapped" hook) and the
 * last ride, so the next find never rides the same one twice in a row. Local
 * until the server returns `dex.rides_snapped` (CONTRACT.md app request).
 */

const KEY = 'tps.ridePhoto.ridesSnapped.v1';
let snapped: RideKind[] = [];
let lastRide: RideKind | null = null;
let loaded: Promise<void> | null = null;

export function loadRideMemory(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY).then(raw => {
      const parsed = raw ? JSON.parse(raw) as { snapped?: string[]; last?: string } : {};
      snapped = (parsed.snapped ?? []).filter((kind): kind is RideKind => (ALL_RIDES as string[]).includes(kind));
      lastRide = parsed.last && (ALL_RIDES as string[]).includes(parsed.last) ? parsed.last as RideKind : null;
    }).catch(() => undefined);
  }
  return loaded;
}

export function lastRideKind(): RideKind | null {
  return lastRide;
}

export function ridesSnapped(): readonly RideKind[] {
  return snapped;
}

/** Record a caught ride. Returns true when it is a ride the player had never snapped. */
export function recordRide(kind: RideKind, serverSnapped?: readonly string[] | null): boolean {
  if (serverSnapped) snapped = serverSnapped.filter((k): k is RideKind => (ALL_RIDES as string[]).includes(k));
  const fresh = !snapped.includes(kind);
  if (fresh) snapped = [...snapped, kind];
  lastRide = kind;
  void AsyncStorage.setItem(KEY, JSON.stringify({ snapped, last: kind })).catch(() => undefined);
  return fresh;
}

/** Development previews start clean. */
export function resetRideMemoryForPreview(): void {
  snapped = [];
  lastRide = null;
}
