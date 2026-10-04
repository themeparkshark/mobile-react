/**
 * Standings v2 board cache, scoped to the signed-in player. A board shows at
 * once from memory on a tab or park switch, then refreshes in the background
 * when it is older than 45 s. A ride win bumps the standings generation
 * (standingsCache.markStandingsStale), which drops every cached board.
 * Sign-out and account switches call resetStandingsV2Cache(), and every key
 * carries the player id, so one child never sees another child's boards on a
 * shared device.
 *
 * The last rank and podium you saw per board live in AsyncStorage (per
 * player) so the screen celebrates only real changes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import allParks from '../../api/endpoints/parks/allParks';
import { getStandings, getStandingsPage, type StandingsBoardKey } from '../../api/endpoints/me/standings';
import { prefetchLayers } from './faceLayers';
import { facePoints, faceLayerSources, wearsOwnLook } from './StandingsShark';
import type { InventoryType } from '../../models/inventory-type';
import type { ParkType } from '../../models/park-type';
import { standingsGeneration, standingsSession } from './standingsCache';
import { boardMatches, boardModel, mergePage, mergeRefresh, podiumRows, podiumSignature, seenRankKey, type StandingsBoardModel, type StandingsRowModel } from './standingsV2Model';

const FRESH_MS = 45_000;
const boards = new Map<string, { model: StandingsBoardModel; at: number }>();
const inFlight = new Map<string, Promise<StandingsBoardModel>>();
const pagesInFlight = new Map<string, Promise<StandingsBoardModel | 'rebuilt' | null>>();
let generation = standingsGeneration();
let owner: number | null = null;
let session = standingsSession();
let parks: ParkType[] = [];
let parksRequest: Promise<ParkType[]> | null = null;
let chosenPark: number | null = null;

const keyOf = (meId: number | null, board: StandingsBoardKey, parkId: number | null | undefined) =>
  `${meId ?? 0}:${board}:${board === 'all_time' ? parkId ?? 'all' : 'all'}`;

function sync(meId: number | null) {
  if (owner !== meId || session !== standingsSession()) {
    session = standingsSession();
    resetStandingsV2Cache();
    owner = meId;
  }
  if (generation !== standingsGeneration()) {
    boards.clear();
    generation = standingsGeneration();
  }
}

export function cachedBoard(meId: number | null, board: StandingsBoardKey, parkId: number | null | undefined): { model: StandingsBoardModel; fresh: boolean } | null {
  sync(meId);
  const hit = boards.get(keyOf(meId, board, parkId));
  return hit ? { model: hit.model, fresh: Date.now() - hit.at < FRESH_MS } : null;
}

export function loadBoard(meId: number | null, board: StandingsBoardKey, parkId: number | null | undefined): Promise<StandingsBoardModel> {
  sync(meId);
  const key = keyOf(meId, board, parkId);
  const running = inFlight.get(key);
  if (running) return running;
  const request = getStandings(board, board === 'all_time' ? parkId ?? null : null)
    .then(async dto => {
      const fresh = boardModel(dto, board, meId);
      const previous = boards.get(key)?.model;
      // A refresh keeps the pages already scrolled through (no jump back to the top 50).
      // When the board changed (a new build), those pages are fetched again from the
      // new build (up to 4 pages), so no rank is ever skipped or shown twice.
      const model = previous && previous.build && fresh.build && previous.build !== fresh.build && previous.rows.length > fresh.rows.length
        ? await refetchPages(meId, board, parkId, fresh, previous.rows.length)
        : mergeRefresh(fresh, previous);
      // A sign-out while this was in flight must not repopulate the cache.
      if (owner === meId) boards.set(key, { model, at: Date.now() });
      prefetchFaces(model.rows.slice(0, 12));
      return model;
    })
    .finally(() => { inFlight.delete(key); });
  inFlight.set(key, request);
  return request;
}

/**
 * Infinite scroll: fetch the page after the rows this board has, reading the
 * same build as the first page. The merged board is returned, not cached:
 * the screen commits it (commitBoard) only when it actually shows it, so a
 * page held while the kid is in Your spot can never land later from the cache
 * above what they are looking at. One request per board at a time.
 */
export function loadMore(meId: number | null, board: StandingsBoardKey, parkId: number | null | undefined, from: StandingsBoardModel): Promise<StandingsBoardModel | 'rebuilt' | null> {
  sync(meId);
  const key = keyOf(meId, board, parkId);
  if (from.nextOffset == null) return Promise.resolve(null);
  const running = pagesInFlight.get(key);
  if (running) return running;
  const offset = from.nextOffset;
  const request = getStandingsPage(board, board === 'all_time' ? parkId ?? null : null, offset, from.build)
    .then(page => {
      if (owner !== meId) return null;
      // The board was rebuilt and the first page's build expired: the screen refreshes
      // (refetchPages) instead of appending rows from a different board.
      if (from.build && page?.build && page.build !== from.build) return 'rebuilt' as const;
      const incoming = Array.isArray(page?.rows) ? page.rows : [];
      // Exactly the new rows' faces, the first 20, so a landing page never floods the decoder.
      prefetchFaces(incoming.slice(0, 20).map(row => boardModel({ rows: [row] }, board, meId).rows[0]).filter(Boolean));
      return mergePage(from, page, meId);
    })
    .finally(() => { pagesInFlight.delete(key); });
  pagesInFlight.set(key, request);
  return request;
}

/** Pages again from a new build, up to `rows` rows (at most 4 pages). Failures keep what loaded. */
async function refetchPages(meId: number | null, board: StandingsBoardKey, parkId: number | null | undefined, fresh: StandingsBoardModel, rows: number): Promise<StandingsBoardModel> {
  let model = fresh;
  for (let i = 0; i < 4 && model.nextOffset != null && model.rows.length < rows; i++) {
    try {
      const page = await getStandingsPage(board, board === 'all_time' ? parkId ?? null : null, model.nextOffset, model.build);
      model = mergePage(model, page, meId);
    } catch {
      break;
    }
  }
  return model;
}

/** The screen showed this board: it becomes the cached one (tab switches keep the place). */
export function commitBoard(meId: number | null, board: StandingsBoardKey, parkId: number | null | undefined, model: StandingsBoardModel): void {
  sync(meId);
  // r3: a model from another tab or park is never saved under this key.
  if (!boardMatches(model, board, parkId)) return;
  const key = keyOf(meId, board, parkId);
  const at = boards.get(key)?.at ?? Date.now();
  if (owner === meId) boards.set(key, { model, at });
}

/** Faces for rows about to scroll in, decoded at row size, so a face is ready before its row shows. */
function prefetchFaces(rows: readonly StandingsRowModel[]): void {
  rows.forEach(row => {
    const inv = row.avatar.inventory as InventoryType | null | undefined;
    if (wearsOwnLook(inv ?? null)) prefetchLayers(faceLayerSources(inv), facePoints(40));
  });
}

/** Warm boards so a tab or park switch is instant. Only fetches what is missing or stale. Failures are ignored. */
export function prefetchBoards(meId: number | null, list: readonly { board: StandingsBoardKey; parkId?: number | null }[], onlyMissing = false): void {
  list.forEach(({ board, parkId }) => {
    const hit = cachedBoard(meId, board, parkId ?? null);
    if (!hit || (!hit.fresh && !onlyMissing)) void loadBoard(meId, board, parkId ?? null).catch(() => undefined);
  });
}

export function cachedParks(): ParkType[] {
  return parks;
}

export function loadParks(): Promise<ParkType[]> {
  if (parks.length) return Promise.resolve(parks);
  parksRequest ??= allParks().then(list => { parks = list ?? []; return parks; }).finally(() => { parksRequest = null; });
  return parksRequest;
}

export function chosenAllTimePark(): number | null {
  return chosenPark;
}

export function chooseAllTimePark(parkId: number | null): void {
  chosenPark = parkId;
}

export async function readSeenRank(meId: number | null, model: StandingsBoardModel): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(seenRankKey(meId, model.board, model.parkId, model.endsAt));
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeSeenRank(meId: number | null, model: StandingsBoardModel): void {
  const rank = model.me?.rank;
  if (rank == null) return;
  void AsyncStorage.setItem(seenRankKey(meId, model.board, model.parkId, model.endsAt), String(rank)).catch(() => undefined);
}

/** True when the top three differ from what this player last saw on this board (and remembers the new one). */
export async function podiumChanged(meId: number | null, model: StandingsBoardModel): Promise<boolean> {
  const key = `${seenRankKey(meId, model.board, model.parkId, model.endsAt)}:podium`;
  const signature = podiumSignature(podiumRows(model));
  try {
    const seen = await AsyncStorage.getItem(key);
    if (seen === signature) return false;
    await AsyncStorage.setItem(key, signature);
    return true;
  } catch {
    return false;
  }
}

/** Sign-out, account switch and tests. */
export function resetStandingsV2Cache(): void {
  boards.clear();
  inFlight.clear();
  pagesInFlight.clear();
  chosenPark = null;
  owner = null;
}

/**
 * The bottom bar warms This Week and Friends once per session (only what is
 * missing), so the first Standings tap paints a real board, not a loader.
 */
export function warmStandings(meId: number | null | undefined): void {
  if (!meId) return;
  prefetchBoards(meId, [{ board: 'week' }, { board: 'friends' }], true);
}
