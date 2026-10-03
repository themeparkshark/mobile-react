/**
 * Standings v2 board cache. A board shows at once from memory on a tab or
 * park switch, then refreshes in the background when it is older than 45 s.
 * A ride win bumps the standings generation (standingsCache.markStandingsStale),
 * which drops every cached board so the next look shows the new rank.
 *
 * The last rank you saw per board is kept in AsyncStorage so the screen can
 * celebrate a climb ("Up 3!") the next time you open it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStandings, type StandingsBoardKey } from '../../api/endpoints/me/standings';
import { standingsGeneration } from './standingsCache';
import { boardModel, seenRankKey, type StandingsBoardModel } from './standingsV2Model';

const FRESH_MS = 45_000;
const boards = new Map<string, { model: StandingsBoardModel; at: number }>();
let generation = standingsGeneration();
const inFlight = new Map<string, Promise<StandingsBoardModel>>();

const keyOf = (board: StandingsBoardKey, parkId: number | null | undefined) => `${board}:${board === 'all_time' ? parkId ?? 'all' : 'all'}`;

function syncGeneration() {
  if (generation !== standingsGeneration()) {
    boards.clear();
    generation = standingsGeneration();
  }
}

export function cachedBoard(board: StandingsBoardKey, parkId: number | null | undefined): { model: StandingsBoardModel; fresh: boolean } | null {
  syncGeneration();
  const hit = boards.get(keyOf(board, parkId));
  return hit ? { model: hit.model, fresh: Date.now() - hit.at < FRESH_MS } : null;
}

export function loadBoard(board: StandingsBoardKey, parkId: number | null | undefined, meId: number | null): Promise<StandingsBoardModel> {
  syncGeneration();
  const key = keyOf(board, parkId);
  const running = inFlight.get(key);
  if (running) return running;
  const request = getStandings(board, board === 'all_time' ? parkId ?? null : null)
    .then(dto => {
      const model = boardModel(dto, board, meId);
      boards.set(key, { model, at: Date.now() });
      return model;
    })
    .finally(() => { inFlight.delete(key); });
  inFlight.set(key, request);
  return request;
}

/** Warm the other boards so the first tab switch is instant. Failures are ignored. */
export function prefetchBoards(boardsToWarm: readonly StandingsBoardKey[], meId: number | null): void {
  boardsToWarm.forEach(board => {
    if (!cachedBoard(board, null)) void loadBoard(board, null, meId).catch(() => undefined);
  });
}

export async function readSeenRank(model: StandingsBoardModel): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(seenRankKey(model.board, model.parkId, model.endsAt));
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeSeenRank(model: StandingsBoardModel): void {
  const rank = model.me?.rank;
  if (rank == null) return;
  void AsyncStorage.setItem(seenRankKey(model.board, model.parkId, model.endsAt), String(rank)).catch(() => undefined);
}

/** Test and sign-out hook. */
export function resetStandingsV2Cache(): void {
  boards.clear();
  inFlight.clear();
}
