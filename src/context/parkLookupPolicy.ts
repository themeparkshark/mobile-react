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

/*
 * Leaving a park needs sustained evidence. A guest standing inside Disneyland
 * must never drop to Travel Mode on one bad GPS fix (indoors, under a canopy,
 * right after the watcher restarts), a timeout or a network error.
 */
export const LEAVE_PARK_OUTSIDE_CHECKS = 2;
export const LEAVE_PARK_MIN_MS = 45_000;
/** An outside reading from a fix this coarse does not count toward leaving. */
export const LEAVE_PARK_MAX_ACCURACY_M = 100;

export interface ParkPresence<P> {
  readonly park: P | undefined;
  /** When the first countable outside reading arrived while at a park. */
  readonly outsideSince: number | null;
  readonly outsideChecks: number;
}

export interface ParkLookupResult<P> {
  readonly outcome: ParkLookupOutcome;
  readonly park?: P | null;
  readonly at: number;
  readonly accuracyMeters?: number | null;
}

export const NO_PARK_PRESENCE: ParkPresence<never> = { park: undefined, outsideSince: null, outsideChecks: 0 };

/** The park the map shows after one lookup. Entering or switching is instant; leaving is sticky. */
export function nextParkPresence<P>(state: ParkPresence<P>, result: ParkLookupResult<P>): ParkPresence<P> {
  if (result.outcome === 'error') return state;
  if (result.outcome === 'park' && result.park) {
    return { park: result.park, outsideSince: null, outsideChecks: 0 };
  }
  if (!state.park) return { park: undefined, outsideSince: null, outsideChecks: 0 };
  const accuracy = result.accuracyMeters;
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy > LEAVE_PARK_MAX_ACCURACY_M)) return state;
  const outsideSince = state.outsideSince ?? result.at;
  const outsideChecks = state.outsideChecks + 1;
  if (outsideChecks >= LEAVE_PARK_OUTSIDE_CHECKS && result.at - outsideSince >= LEAVE_PARK_MIN_MS) {
    return { park: undefined, outsideSince: null, outsideChecks: 0 };
  }
  return { park: state.park, outsideSince, outsideChecks };
}
