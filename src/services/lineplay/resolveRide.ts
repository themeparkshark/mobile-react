/**
 * resolveRide — map a wait-times entry (name-keyed) to a numeric ride id.
 *
 * The queue-times feed (WikiLiveEntry) is name-keyed with a string id from
 * themeparks.wiki; the in-line timer server API needs the app's numeric
 * ride_id. We resolve by normalized-name match against getRides(parkId), the
 * same strategy useRideDetection.buildWaitTimeMap uses. Results are cached per
 * park for the session so repeated row taps don't refetch.
 */

import { getRides, RideType } from '../../api/endpoints/rides';
import type { RideContext } from './LinePlaySession';

const norm = (s: string) => s.toLowerCase().trim();

// Simple in-memory cache: parkId -> Map<normalizedName, RideType>.
const parkRideCache = new Map<number, Map<string, RideType>>();

async function getRideNameMap(parkId: number): Promise<Map<string, RideType>> {
  const cached = parkRideCache.get(parkId);
  if (cached) return cached;
  const rides = await getRides(parkId);
  const map = new Map<string, RideType>();
  for (const r of rides) map.set(norm(r.name), r);
  parkRideCache.set(parkId, map);
  return map;
}

/**
 * Resolve a RideContext for a wait-times row. Returns null if no numeric ride
 * matches the name (the entry point should then disable the "Start Line
 * Session" action for that row).
 */
export async function resolveRideContext(
  parkId: number,
  rideName: string,
  postedWaitMinutes: number | null,
): Promise<RideContext | null> {
  try {
    const map = await getRideNameMap(parkId);
    const ride = map.get(norm(rideName));
    if (!ride) return null;
    return {
      rideId: ride.id,
      rideName: ride.name,
      parkId: ride.park_id,
      postedWaitMinutes,
      imageUrl: ride.image_url,
    };
  } catch {
    return null;
  }
}
