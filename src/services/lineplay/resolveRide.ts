/**
 * resolveRide — map a wait-times entry (name-keyed) to a numeric ride id.
 *
 * The queue-times feed (WikiLiveEntry) is name-keyed with a string id from
 * themeparks.wiki; the in-line timer server API needs the app's numeric
 * ride_id. We resolve by normalized-name match against getRides(parkId), the
 * same strategy useRideDetection.buildWaitTimeMap uses. A short cache avoids
 * repeated row requests while still picking up reviewed coin links and ride
 * availability changed during a park day.
 */

import { getRides, RideType } from '../../api/endpoints/rides';
import type { RideContext } from './LinePlaySession';

const norm = (s: string) => s.toLowerCase().trim();

/** Legacy coin labels that clearly refer to one catalog ride in that park. */
const TASK_RIDE_ALIASES: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  1: {
    'world famous studio tour': 'studio tour',
    'forbidden journey': 'harry potter and the forbidden journey',
    'mummy': 'revenge of the mummy - the ride',
    'secret life of pets': 'secret life of pets: off the leash',
  },
  8: {
    'thunder mountain': 'big thunder mountain railroad',
    'pirates': 'pirates of the caribbean',
    'matterhorn': 'matterhorn bobsleds',
    'astro blasters': 'buzz lightyear astro blasters',
    'smugglers': 'millennium falcon: smugglers run',
    'mr. toad': "mr. toad's wild ride",
  },
  13: {
    'mission: breakout!': 'guardians of the galaxy - mission: breakout!',
    'incredible coaster': 'incredicoaster',
    'midway': 'toy story midway mania!',
    "soarin'": "soarin' around the world",
  },
};

/** Authored queue chapters whose coin exists before reward geofences are cataloged. */
const OFFLINE_MAP_CHAPTERS: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  8: { 'jungle cruise': 'jungle-cruise-8' },
};

const RIDE_CACHE_MS = 60_000;
const parkRideCache = new Map<number, { fetchedAt: number; rides: Map<string, RideType> }>();
const parkRideInflight = new Map<number, Promise<Map<string, RideType>>>();

async function getRideNameMap(parkId: number): Promise<Map<string, RideType>> {
  const cached = parkRideCache.get(parkId);
  if (cached && Date.now() - cached.fetchedAt < RIDE_CACHE_MS) return cached.rides;
  const inflight = parkRideInflight.get(parkId);
  if (inflight) return inflight;
  // One bounded request serves the checklist and all ride entries in this park.
  const request = getRides(parkId, 5_000).then(rides => {
    const map = new Map<string, RideType>();
    for (const r of rides) map.set(norm(r.name), r);
    parkRideCache.set(parkId, { fetchedAt: Date.now(), rides: map });
    return map;
  });
  parkRideInflight.set(parkId, request);
  try {
    return await request;
  } finally {
    if (parkRideInflight.get(parkId) === request) parkRideInflight.delete(parkId);
  }
}

/** Warm the ride lookup while guests read the park checklist. */
export async function prefetchRideCatalog(parkId: number): Promise<void> {
  try { await getRideNameMap(parkId); } catch { /* Games-only fallback stays available. */ }
}

/**
 * Resolve a RideContext for a named attraction. Returns null if the catalog
 * cannot verify its numeric ride id; callers can still offer local games.
 */
export async function resolveRideContext(
  parkId: number,
  rideName: string,
  postedWaitMinutes: number | null,
  postedWaitObservedAt: number | null = null,
  waitFeedRideId: string | null = null,
): Promise<RideContext | null> {
  try {
    const map = await getRideNameMap(parkId);
    const taskName = norm(rideName);
    const ride = map.get(taskName) ?? map.get(TASK_RIDE_ALIASES[parkId]?.[taskName] ?? '');
    if (!ride) return null;
    return {
      rideId: ride.id,
      rideName: ride.name,
      rideSlug: ride.slug,
      parkId: ride.park_id,
      postedWaitMinutes,
      postedWaitObservedAt,
      waitFeedRideId,
      imageUrl: ride.image_url,
      lineRewardsReady: ride.line_rewards_ready,
    };
  } catch {
    return null;
  }
}

/** Keep queue games playable during catalog outages without inventing a rewardable ride id. */
export async function resolveRideContextOrOffline(
  parkId: number,
  rideName: string,
  postedWaitMinutes: number | null = null,
  postedWaitObservedAt: number | null = null,
  waitFeedRideId: string | null = null,
): Promise<RideContext> {
  return await resolveRideContext(parkId, rideName, postedWaitMinutes,
    postedWaitObservedAt, waitFeedRideId) ?? {
    rideId: 0,
    rideName,
    parkId,
    postedWaitMinutes,
    postedWaitObservedAt,
    waitFeedRideId,
    imageUrl: null,
    lineRewardsReady: false,
  };
}

/** Map markers include non-rides, so only cataloged rides or explicit authored chapters open LinePlay. */
export async function resolveMapQueueContext(parkId: number, taskName: string): Promise<RideContext | null> {
  const ride = await resolveRideContext(parkId, taskName, null);
  if (ride) return ride;
  const rideSlug = OFFLINE_MAP_CHAPTERS[parkId]?.[norm(taskName)];
  return rideSlug ? {
    rideId: 0,
    rideName: taskName,
    rideSlug,
    parkId,
    postedWaitMinutes: null,
    imageUrl: null,
    lineRewardsReady: false,
  } : null;
}
