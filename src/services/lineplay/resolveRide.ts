/**
 * resolveRide: find the catalog ride (numeric ride id) a LinePlay entry means.
 *
 * Identity first, names last (P2): a coin finds its ride by rides.task_id, a
 * wait-times row by the feed id the catalog keeps in metadata.themeparks_id.
 * Names drift (curly apostrophes, "Jingle Cruise" in December, short coin
 * labels like "Tiki Room"), so a name match is only the fallback for a server
 * that serves no link. A short cache avoids repeated row requests while still
 * picking up reviewed coin links and ride availability changed during a park day.
 */

import { getRides, RideType } from '../../api/endpoints/rides';
import type { RideContext } from './LinePlaySession';
import { QUEUE_RIDE_TYPES } from '../../constants/queueRideTypes';
import { lineZoneFor, type LineZone } from './lineZone';
import { normalizeRideName, parkCoinIdByName, rememberParkCoins, type CoinRef } from './coinRideIndex';

const QUEUE_TYPES = new Set<string>(QUEUE_RIDE_TYPES);

const norm = normalizeRideName;

export { normalizeRideName, rememberParkCoins };
export type { CoinRef };

/** Legacy coin labels that clearly refer to one catalog ride in that park. */
// ui-copy-allow(phrase): catalog lookup keys matched against ride names, never rendered.
const TASK_RIDE_ALIASES: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  1: {
    'world famous studio tour': 'studio tour',
    'forbidden journey': 'harry potter and the forbidden journey',
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
  },
};

/** Catalog ride names (normalized) a coin label can mean: its own name, then a reviewed alias. */
export function rideKeysForTask(parkId: number, taskName: string): string[] {
  const key = norm(taskName);
  const alias = TASK_RIDE_ALIASES[parkId]?.[key];
  return alias ? [key, alias] : [key];
}

/** Authored queue chapters whose coin exists before reward geofences are cataloged. */
const OFFLINE_MAP_CHAPTERS: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  8: { 'jungle cruise': 'jungle-cruise-8' },
};

const RIDE_CACHE_MS = 60_000;
const parkRideCache = new Map<number, { fetchedAt: number; rides: Map<string, RideType> }>();

/** A wait-times row: the feed's own id (themeparks.wiki) and its name of the day. */
export interface WaitRowRef { readonly id?: string | null; readonly name: string }

const isQueueRide = (ride: RideType) => QUEUE_TYPES.has(ride.type);
const feedIdOf = (ride: RideType): string | null => {
  const id: unknown = ride.metadata?.themeparks_id;
  return typeof id === 'string' && id ? id : null;
};

/** The ride a coin earns: its rides.task_id link, a queue ride first. */
function rideForTask(rides: Iterable<RideType>, taskId: number): RideType | undefined {
  let other: RideType | undefined;
  for (const ride of rides) {
    if (ride.task_id !== taskId) continue;
    if (isQueueRide(ride)) return ride;
    other ??= ride;
  }
  return other;
}

/** The ride a wait-times row is: the catalog row carrying the feed's id. */
function rideForFeedId(rides: Iterable<RideType>, feedId: string | null | undefined): RideType | undefined {
  if (!feedId) return undefined;
  for (const ride of rides) if (feedIdOf(ride) === feedId) return ride;
  return undefined;
}

/** By name only when no id links it: the name, then a reviewed alias. */
function rideForName(map: Map<string, RideType>, parkId: number, name: string): RideType | undefined {
  return rideKeysForTask(parkId, name).map(key => map.get(key)).find(Boolean);
}

/**
 * The one lookup every LinePlay door uses: the coin id, then the wait feed id, then the shelf's coin of that
 * name, then the ride name. A coin that is linked to a ride always gets that ride, whatever either is called.
 */
function findRide(map: Map<string, RideType>, parkId: number, name: string,
  opts: { readonly taskId?: number | null; readonly feedId?: string | null } = {}): RideType | undefined {
  const rides = [...map.values()];
  const given = opts.taskId && opts.taskId > 0 ? opts.taskId : null;
  const shelfCoin = parkCoinIdByName(parkId, name);
  return (given ? rideForTask(rides, given) : undefined)
    ?? rideForFeedId(rides, opts.feedId)
    ?? (shelfCoin ? rideForTask(rides, shelfCoin) : undefined)
    ?? rideForName(map, parkId, name);
}

const contextFor = (ride: RideType, extra: Partial<RideContext> = {}): RideContext => ({
  rideId: ride.id,
  rideName: ride.name,
  rideSlug: ride.slug,
  parkId: ride.park_id,
  postedWaitMinutes: null,
  imageUrl: ride.image_url,
  lineRewardsReady: ride.line_rewards_ready,
  rideType: ride.type,
  ...extra,
});
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

/** The park's ride catalog (the same cached request), for the Coin Guide's Line Play rows. */
export async function loadParkRides(parkId: number): Promise<RideType[]> {
  return [...(await getRideNameMap(parkId)).values()];
}

/**
 * The ride's line zone (lineZone.ts) from the park catalog, or null when the catalog has no position for it or
 * does not answer within timeoutMs (LinePlay then starts as before and stays honest from its live fixes).
 */
export async function lineZoneForRide(parkId: number | null | undefined, rideId: number, timeoutMs = 3_000): Promise<LineZone | null> {
  if (!parkId || !(rideId > 0)) return null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const rides = await Promise.race([loadParkRides(parkId),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
    return rides ? lineZoneFor(rides.find(item => item.id === rideId)) : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The ride's catalog type (T081), cached with the catalog, or undefined when the catalog does not answer in time
 * (LinePlay then starts as before). The server retypes walk-in shows and walk-throughs (B04), so a show never
 * gets a line story or a wait recap.
 */
export async function rideTypeForRide(parkId: number | null | undefined, rideId: number, timeoutMs = 3_000): Promise<string | undefined> {
  if (!parkId || !(rideId > 0)) return undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const rides = await Promise.race([loadParkRides(parkId),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
    return rides?.find(item => item.id === rideId)?.type;
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A catalog type that has a line to wait in (QUEUE_RIDE_TYPES). Unknown (undefined or null) counts as a line, as today. */
export function rideHasQueue(type: string | null | undefined): boolean {
  return type == null || QUEUE_TYPES.has(type);
}

/**
 * The coin task for each wait-times row, so Wait Times can say "Make this my pick" through the guide. A row
 * matches by its feed id first (a holiday name like "Jingle Cruise" still finds Jungle Cruise), then by name.
 * Keys are the row names. Rows with no coin are left out.
 */
export async function coinTasksByRideName(parkId: number, rows: readonly (string | WaitRowRef)[]): Promise<Map<string, number>> {
  const map = await getRideNameMap(parkId);
  const rides = [...map.values()];
  const out = new Map<string, number>();
  for (const row of rows) {
    const ref: WaitRowRef = typeof row === 'string' ? { name: row } : row;
    const ride = rideForFeedId(rides, ref.id) ?? rideForName(map, parkId, ref.name);
    if (ride?.task_id != null && Number.isInteger(ride.task_id) && ride.task_id > 0) out.set(ref.name, ride.task_id);
  }
  return out;
}

/** Warm the ride lookup while guests read the park checklist. */
export async function prefetchRideCatalog(parkId: number): Promise<void> {
  try { await getRideNameMap(parkId); } catch { /* Games-only fallback stays available. */ }
}

/**
 * Resolve a RideContext for an attraction: by the shelf coin of that name, then the wait feed id, then the name.
 * Returns null if the catalog cannot verify its numeric ride id; callers can still offer local games.
 */
export async function resolveRideContext(
  parkId: number,
  rideName: string,
  postedWaitMinutes: number | null,
  postedWaitObservedAt: number | null = null,
  waitFeedRideId: string | null = null,
  taskId: number | null = null,
): Promise<RideContext | null> {
  try {
    const map = await getRideNameMap(parkId);
    const ride = findRide(map, parkId, rideName, { taskId, feedId: waitFeedRideId });
    if (!ride) return null;
    return contextFor(ride, { postedWaitMinutes, postedWaitObservedAt, waitFeedRideId });
  } catch {
    return null;
  }
}

/**
 * Resolve a RideContext by the catalog ride id (the dwell detector already knows
 * it), so a renamed or aliased ride still opens. Null when the catalog cannot
 * load or no longer has that ride.
 */
export async function resolveRideContextById(parkId: number, rideId: number): Promise<RideContext | null> {
  try {
    const map = await getRideNameMap(parkId);
    for (const ride of map.values()) if (ride.id === rideId) return contextFor(ride);
    return null;
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
  taskId: number | null = null,
): Promise<RideContext> {
  return await resolveRideContext(parkId, rideName, postedWaitMinutes,
    postedWaitObservedAt, waitFeedRideId, taskId) ?? {
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

/** LinePlay for a coin (shelf, Coin Guide, coin sheet): its linked ride by coin id, never by its label. */
export function resolveCoinRideContext(parkId: number, coin: CoinRef): Promise<RideContext> {
  return resolveRideContextOrOffline(parkId, coin.name, null, null, null, coin.id);
}

/** LinePlay for a wait-times row: the ride carrying the feed's id, so a holiday name still pays its coin. */
export function resolveWaitRowRideContext(parkId: number, row: WaitRowRef, postedWaitMinutes: number | null,
  postedWaitObservedAt: number | null): Promise<RideContext> {
  return resolveRideContextOrOffline(parkId, row.name, postedWaitMinutes, postedWaitObservedAt, row.id ?? null);
}

/** Map markers include non-rides, so only cataloged rides or explicit authored chapters open LinePlay. */
export async function resolveMapQueueContext(parkId: number, taskName: string, taskId?: number): Promise<RideContext | null> {
  const ride = await resolveRideContext(parkId, taskName, null, null, null, taskId ?? null);
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

/**
 * A queue story for a ride the server already named (Adventure Ticket, dwell
 * card). Never null: the catalog row by id, then by name, then the template
 * story under the server's own ride id. A coin label like "Tiki Room" that
 * does not match the catalog title, or a catalog that will not load, still
 * opens a story instead of an error. Rewards stay the server's call.
 */
export async function resolveQueueStoryContext(parkId: number, rideId: number, rideName: string,
  taskId?: number): Promise<RideContext> {
  const byId = rideId > 0 ? await resolveRideContextById(parkId, rideId) : null;
  if (byId) return byId;
  const byName = await resolveMapQueueContext(parkId, rideName, taskId);
  if (byName) return byName;
  return { rideId: Math.max(0, rideId), rideName, parkId, postedWaitMinutes: null, imageUrl: null };
}
