/**
 * Does this ride have a line to play in right now? One answer for the win card's "Play its line story",
 * ride detection's ride question and the in-line offer (core loop fix round, items 12 and 13).
 *
 * - A show, walk-through, train or anything the catalog does not call a queue ride has no line.
 * - The live wait feed knows more than the catalog: a ride it reports closed (closed, refurbishment) has no
 *   line now, and a place it reports open but has never given a posted wait this session is a show typed as
 *   an attraction (Great Moments with Mr. Lincoln, the Tiki Room): standing there is a seat, not a line.
 * - With no feed answer for a ride (feed off, park not covered) the catalog type decides.
 *
 * Pure and tiny: ride detection feeds it the catalog and the feed, readers only ask. No React or native imports.
 */
import { QUEUE_RIDE_TYPES } from '../../constants/queueRideTypes';

export type RideLineState = 'line' | 'no_line' | 'closed';

export interface RideLineCatalogRow {
  readonly id: number;
  readonly type: string;
  readonly park_id: number;
  readonly task_id?: number | null;
}

export interface RideLiveRow {
  readonly rideId: number;
  readonly status: string;
  /** The posted standby wait in minutes, or null when the feed gives none. */
  readonly wait: number | null;
}

const QUEUE = new Set<string>(QUEUE_RIDE_TYPES);
const CLOSED = new Set(['CLOSED', 'REFURBISHMENT']);

let catalog = new Map<number, RideLineCatalogRow>();
let byTask = new Map<number, number>();
let live = new Map<number, RideLiveRow>();
/** Rides the feed posted a wait for at any point this session: a show never gets one. */
let waitSeen = new Set<number>();

/** The ride catalog detection runs on (every park). */
export function noteRideLineCatalog(rides: readonly RideLineCatalogRow[]): void {
  catalog = new Map();
  byTask = new Map();
  for (const ride of rides ?? []) {
    if (!ride || !Number.isInteger(ride.id)) continue;
    catalog.set(ride.id, ride);
    if (ride.task_id != null && Number.isInteger(ride.task_id)) byTask.set(ride.task_id, ride.id);
  }
}

/**
 * The live feed's answer for one park (only the rides it matched). Replaces that park's rows; the posted
 * waits it ever showed are remembered for the session.
 */
export function noteRideLive(parkId: number | null, rows: readonly RideLiveRow[]): void {
  const next = new Map<number, RideLiveRow>();
  for (const [id, row] of live) if (parkId != null && catalog.get(id)?.park_id !== parkId) next.set(id, row);
  for (const row of rows) {
    if (!row || !Number.isInteger(row.rideId)) continue;
    next.set(row.rideId, row);
    if (typeof row.wait === 'number' && row.wait >= 0) waitSeen.add(row.rideId);
  }
  live = next;
}

/** Pure rule, for tests and for callers with their own data. */
export function lineStateFor(type: string | null | undefined, row: RideLiveRow | null | undefined,
  everPostedWait: boolean): RideLineState {
  if (type == null || !QUEUE.has(type)) return 'no_line';
  if (!row) return 'line';
  if (CLOSED.has(row.status)) return 'closed';
  if (row.status === 'OPERATING' && (row.wait == null || row.wait < 0) && !everPostedWait) return 'no_line';
  return 'line';
}

/** This catalog ride's line right now (null: the ride is not in the catalog). */
export function rideLineState(rideId: number | null | undefined): RideLineState | null {
  if (rideId == null) return null;
  const ride = catalog.get(rideId);
  if (!ride) return null;
  return lineStateFor(ride.type, live.get(rideId), waitSeen.has(rideId));
}

/** The line of the ride this coin task belongs to (null: no ride is linked, or the catalog is not loaded). */
export function taskLineState(taskId: number | null | undefined): RideLineState | null {
  if (taskId == null) return null;
  const rideId = byTask.get(taskId);
  return rideId == null ? null : rideLineState(rideId);
}

/** The live feed's status for this ride right now (null: no feed answer). */
export function rideLiveStatus(rideId: number | null | undefined): string | null {
  return rideId == null ? null : live.get(rideId)?.status ?? null;
}

/** False only when the ride is known to have no line (a show, a closed ride); unknown answers true. */
export function taskHasLine(taskId: number | null | undefined): boolean {
  const state = taskLineState(taskId);
  return state == null || state === 'line';
}

/** Tests only. */
export function resetRideLinesForTests(): void {
  catalog = new Map();
  byTask = new Map();
  live = new Map();
  waitSeen = new Set();
}
