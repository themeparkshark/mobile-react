/**
 * The park shelf's eight lists, loaded together. The post-win summary starts
 * this request while the player reads the receipt, so the Park screen opens
 * with its shelf already in hand and the coin can fly straight to its slot.
 *
 * A prefetch is consumed once and only within MAX_AGE_MS; anything older, or
 * any later focus, reads the server again.
 */
import getArchivedTasks from '../../api/endpoints/parks/getArchivedTasks';
import getLimitedTasks from '../../api/endpoints/parks/getLimitedTasks';
import getSecretTasks from '../../api/endpoints/parks/getSecretTasks';
import getTasks from '../../api/endpoints/parks/getTasks';
import getCompletedArchivedTasks from '../../api/endpoints/players/parks/getCompletedArchivedTasks';
import getCompletedSecretTasks from '../../api/endpoints/players/parks/getCompletedSecretTasks';
import getCompletedTasks from '../../api/endpoints/players/parks/getCompletedTasks';
import getVisitedPark from '../../api/endpoints/players/visited-parks/getPark';
import type { ParkType } from '../../models/park-type';
import type { SecretTaskType } from '../../models/secret-task-type';
import type { TaskType } from '../../models/task-type';

export interface ParkShelfData {
  readonly visitedPark: ParkType;
  readonly available: TaskType[];
  readonly secret: SecretTaskType[];
  readonly completed: TaskType[];
  readonly completedSecret: SecretTaskType[];
  readonly archived: TaskType[];
  readonly completedArchived: TaskType[];
  /** Every limited coin, in rotation or not. Empty on a server without rotations. */
  readonly limited: TaskType[];
}

export const MAX_AGE_MS = 20_000;

const prefetched = new Map<string, { at: number; request: Promise<ParkShelfData> }>();
const key = (park: number, player: number) => `${player}:${park}`;

export function fetchParkShelf(park: number, player: number): Promise<ParkShelfData> {
  return Promise.all([
    getVisitedPark(park, player), getTasks(park), getSecretTasks(park),
    getCompletedTasks(park, player), getCompletedSecretTasks(park, player),
    getArchivedTasks(park), getCompletedArchivedTasks(park, player),
    getLimitedTasks(park).catch(() => [] as TaskType[]),
  ]).then(([visitedPark, available, secret, completed, completedSecret, archived, completedArchived, limited]) =>
    ({ visitedPark, available, secret, completed, completedSecret, archived, completedArchived, limited }));
}

/** Start loading a park shelf now (fire and forget). */
export function prefetchParkShelf(park: number, player: number, now = Date.now()): void {
  if (!park || !player) return;
  const request = fetchParkShelf(park, player);
  request.catch(() => { if (prefetched.get(key(park, player))?.request === request) prefetched.delete(key(park, player)); });
  prefetched.set(key(park, player), { at: now, request });
}

/** The shelf: a fresh prefetch if one is waiting (used once), otherwise a new read. */
export function loadParkShelf(park: number, player: number, now = Date.now()): Promise<ParkShelfData> {
  const entry = prefetched.get(key(park, player));
  prefetched.delete(key(park, player));
  if (entry && now - entry.at <= MAX_AGE_MS) return entry.request.catch(() => fetchParkShelf(park, player));
  return fetchParkShelf(park, player);
}

export function clearParkShelfPrefetch(): void {
  prefetched.clear();
}
