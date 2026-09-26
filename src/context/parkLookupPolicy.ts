import type { LocationType } from '../models/location-type';

export type ParkLookupOutcome = 'park' | 'outside' | 'error';

export interface ParkLookupRecord extends LocationType {
  readonly at: number;
  readonly outcome: ParkLookupOutcome;
}

function distanceMeters(a: LocationType, b: LocationType): number {
  const radius = 6371000;
  const lat = (b.latitude - a.latitude) * Math.PI / 180;
  const lng = (b.longitude - a.longitude) * Math.PI / 180;
  const aLat = a.latitude * Math.PI / 180;
  const bLat = b.latitude * Math.PI / 180;
  const square = Math.sin(lat / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(lng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(square), Math.sqrt(1 - square));
}

/** A home pickup needs a successful outside-park check near the current GPS fix. */
export function isConfirmedOutsidePark(
  location: LocationType | undefined,
  previous: ParkLookupRecord | null,
): boolean {
  return Boolean(location && previous?.outcome === 'outside' &&
    distanceMeters(location, previous) < 25);
}

/** Keep park entry responsive without checking in again for every GPS wobble. */
export function shouldRefreshParkLookup(
  location: LocationType,
  previous: ParkLookupRecord | null,
  now = Date.now(),
): boolean {
  if (!previous) return true;
  const elapsed = now - previous.at;
  if (elapsed < 0) return true;
  if (previous.outcome === 'error') return elapsed >= 15_000;
  if (previous.outcome === 'park') {
    return elapsed >= 5 * 60_000 || distanceMeters(location, previous) >= 80;
  }
  return elapsed >= 30_000 || distanceMeters(location, previous) >= 25;
}
