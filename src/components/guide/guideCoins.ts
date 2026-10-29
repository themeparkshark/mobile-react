/**
 * Turn the map's data into the Next Coin guide's input (core loop blueprint 4.1, October 2026).
 *
 * Pure, so the night, feed-off, esplanade and home checks run in node tests:
 * - each ride island (TaskType) becomes a GuideCoin. A coin with a live row, or linked to a
 *   catalog ride that is not 'other', is a ride; everything else (a statue, a castle, a street)
 *   is a sight, which is always open. Only real queue rides (QUEUE_RIDE_TYPES) can be "in line".
 * - the in-line ride comes from the ride detector's 90 s dwell (a catalog ride id), mapped to its
 *   coin by the catalog link, never a show, street, transport or walk-through.
 * - the free-Tickets wallet comes from the player and the trip goal; earned Tickets waiting in the
 *   Stamp Book are claimable (stamps first).
 */
import type { TaskType } from '../../models/task-type';
import type { RideType } from '../../api/endpoints/rides';
import type { StampData } from '../../api/endpoints/me/stamps';
import { QUEUE_RIDE_TYPES } from '../../constants/queueRideTypes';
import type { GuideCoin, GuideTarget } from '../../services/guide/nextCoin';
import type { ClaimSource, FreeTicketsInput } from '../../services/guide/freeTickets';

const QUEUE = new Set<string>(QUEUE_RIDE_TYPES);

/**
 * PLAY! rises within the server's redeem radius (config mobile.redeem_radius, 16 m), so the guide
 * says "You're here" only where PLAY! can really rise (a catalog ride's wider queue zone is for the
 * in-line dwell, not for PLAY!).
 */
export const PLAY_RANGE_METERS = 16;

/** Catalog rides by the coin they earn. */
export function ridesByTask(rides: readonly RideType[] | null | undefined): Map<number, RideType> {
  const out = new Map<number, RideType>();
  for (const ride of rides ?? []) {
    const taskId = Number(ride?.task_id);
    if (Number.isFinite(taskId) && taskId > 0 && !out.has(taskId)) out.set(taskId, ride);
  }
  return out;
}

const finite = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** One map island as a guide coin. Null when its position is not a real point. */
export function guideCoinFor(task: TaskType, parkId: number, opts: {
  readonly ride?: RideType | null;
  readonly hasLiveRow?: boolean;
  readonly star?: boolean;
  readonly rush?: boolean;
  readonly levelUpReady?: boolean;
  /** The shelf says the player owns this coin (the trip goal's coin_owned). */
  readonly owned?: boolean;
}): GuideCoin | null {
  const latitude = finite(task.latitude), longitude = finite(task.longitude);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const type = opts.ride?.type ?? null;
  const isRide = !!opts.hasLiveRow || (type !== null && type !== 'other' && type !== 'restaurant');
  return {
    taskId: task.id,
    parkId,
    name: task.name,
    kind: isRide ? 'ride' : 'sight',
    latitude,
    longitude,
    radiusMeters: PLAY_RANGE_METERS,
    // The map's list (today's coins) carries no ownership, so the shelf's word counts too: a coin on the
    // shelf comes back each day, but the guide never points at a coin the player already owns.
    owned: !!opts.owned || (task.times_completed ?? 0) > 0,
    // Unknown catalog type: a ride with a live row counts as a queue ride; a sight never queues.
    queue: isRide ? (type === null ? true : QUEUE.has(type)) : false,
    star: !!opts.star,
    rush: !!opts.rush,
    levelUpReady: !!opts.levelUpReady,
    leavesOn: task.limited?.active ? task.limited.ends_on ?? null : null,
  };
}

export function guideCoinsFor(tasks: readonly TaskType[], parkId: number | null, opts: {
  readonly rides?: ReadonlyMap<number, RideType>;
  readonly liveTaskIds?: ReadonlySet<number>;
  readonly starTaskIds?: ReadonlySet<number>;
  readonly rushTaskIds?: ReadonlySet<number>;
  /** Coins on the player's shelf (the trip goal's ride list, coin_owned). */
  readonly ownedTaskIds?: ReadonlySet<number>;
} = {}): GuideCoin[] {
  if (parkId == null) return [];
  const seen = new Set<number>();
  const out: GuideCoin[] = [];
  for (const task of tasks) {
    if (!task || seen.has(task.id)) continue;
    seen.add(task.id);
    const coin = guideCoinFor(task, parkId, {
      ride: opts.rides?.get(task.id) ?? null,
      hasLiveRow: opts.liveTaskIds?.has(task.id),
      star: opts.starTaskIds?.has(task.id),
      rush: opts.rushTaskIds?.has(task.id),
      owned: opts.ownedTaskIds?.has(task.id),
    });
    if (coin) out.push(coin);
  }
  return out;
}

/** Coins the player owns in this park, from the trip goal's ride list (every park's rides, with coin_owned). */
export function ownedTaskIdsFor(rides: readonly { readonly task_id: number; readonly park_id: number; readonly coin_owned: boolean }[] | null | undefined,
  parkId: number | null): Set<number> {
  const out = new Set<number>();
  if (parkId == null) return out;
  for (const ride of rides ?? []) if (ride?.coin_owned && ride.park_id === parkId && Number.isFinite(ride.task_id)) out.add(ride.task_id);
  return out;
}

/** The coin whose line the player stands in: the dwell's catalog ride, linked to a queue-ride coin here. */
export function inLineTaskFor(dwellRideId: number | null | undefined, rides: ReadonlyMap<number, RideType>,
  coins: readonly GuideCoin[]): number | null {
  if (dwellRideId == null) return null;
  for (const [taskId, ride] of rides) {
    if (ride.id !== dwellRideId) continue;
    const coin = coins.find(c => c.taskId === taskId);
    return coin && coin.kind === 'ride' && coin.queue !== false ? taskId : null;
  }
  return null;
}

/** Earned Tickets waiting in the Stamp Book (earned, not claimed, with Tickets in its rewards). */
export function stampTicketSources(stamps: Record<string, readonly StampData[]> | null | undefined): ClaimSource[] {
  const out: ClaimSource[] = [];
  for (const list of Object.values(stamps ?? {})) {
    for (const stamp of list ?? []) {
      const tickets = Number(stamp?.rewards?.tickets ?? 0);
      if (stamp?.is_earned && !stamp.reward_claimed && Number.isFinite(tickets) && tickets > 0) {
        out.push({ kind: 'stamp', id: stamp.id, tickets });
      }
    }
  }
  return out;
}

/** The player's Tickets and free ways, for the guide card's wallet states. */
export function guideWallet(input: {
  readonly tickets: number | null | undefined;
  readonly heldPasses: number | null | undefined;
  readonly freeTryReady: boolean | null | undefined;
  readonly queueTicketsOn: boolean;
  readonly claimable: readonly ClaimSource[];
}): FreeTicketsInput {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return {
    tickets: n(input.tickets),
    claimable: input.claimable,
    freeTryReady: input.freeTryReady === true,
    extraTries: n(input.heldPasses),
    queueTicketsOn: input.queueTicketsOn === true,
  };
}

/**
 * "You're here" only while PLAY! is really up for this coin: the server's range check (the map's
 * PLAY! button) wins over the guide's own geometry. `playableTaskId` undefined: the map has not
 * checked yet, so the geometry stands.
 */
export function withPlayRange(target: GuideTarget | null, playableTaskId: number | null | undefined): GuideTarget | null {
  if (!target || playableTaskId === undefined) return target;
  const inRange = playableTaskId === target.taskId;
  return target.inRange === inRange ? target : { ...target, inRange };
}
