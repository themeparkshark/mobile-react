/**
 * Local-only storage for Play together. Names never leave the device (kid
 * safety: guest players are local names only, BEST_IN_LINE.md 17).
 *
 * - One "current wait" record per account, keyed to the wait it belongs to,
 *   so a restart mid-round comes back to the same hand-off.
 * - The last crew, so the next ride is one tap ("Same crew").
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { crewForNextRide, isLineGroup, type LineGroup } from './lineGroup';

const SESSION_KEY = (playerId: number) => `lineplay_group_session_v1:${playerId}`;
const CREW_KEY = (playerId: number) => `lineplay_last_crew_v1:${playerId}`;
/** A crew is offered again for one park day. */
export const LAST_CREW_TTL_MS = 14 * 60 * 60 * 1000;

/** Identifies one wait: the same ride and start time survive an app restart. */
export function lineGroupWaitKey(rideId: number, startedAt: number): string {
  return `${rideId}:${Math.floor(startedAt)}`;
}

function parseWaitGroup(raw: string | null, waitKey: string): { chosen: boolean; group: LineGroup | null } {
  try {
    if (!raw) return { chosen: false, group: null };
    const saved = JSON.parse(raw) as { waitKey?: unknown; group?: unknown };
    if (saved.waitKey !== waitKey) return { chosen: false, group: null };
    return { chosen: true, group: isLineGroup(saved.group) ? saved.group : null };
  } catch {
    return { chosen: false, group: null };
  }
}

function parseLastCrew(raw: string | null, now: number): LineGroup | null {
  try {
    if (!raw) return null;
    const saved = JSON.parse(raw) as { savedAt?: unknown; group?: unknown };
    if (typeof saved.savedAt !== 'number' || now - saved.savedAt > LAST_CREW_TTL_MS || now < saved.savedAt - 60_000) return null;
    return isLineGroup(saved.group) && saved.group.players.length >= 2 ? crewForNextRide(saved.group) : null;
  } catch {
    return null;
  }
}

/**
 * What this phone's storage said for an account's crew records, read ahead (warmLineGroup) and kept in step
 * with every save, so the LinePlay screen knows on the render its wait starts whether to ask "Who's in line?"
 * (the game dive opens one render sooner, never onto a sheet that slides up a beat later).
 */
const warm = new Map<number, { session: string | null; crew: string | null }>();
/** Saves per account: a warm read that started before a save is dropped (it may hold the older crew). */
const saves = new Map<number, number>();

/** Read an account's crew records ahead of the LinePlay screen needing them (safe to call often). */
export function warmLineGroup(playerId: number): Promise<void> {
  if (warm.has(playerId)) return Promise.resolve();
  const before = saves.get(playerId) ?? 0;
  return Promise.all([AsyncStorage.getItem(SESSION_KEY(playerId)), AsyncStorage.getItem(CREW_KEY(playerId))])
    .then(([session, crew]) => {
      if (!warm.has(playerId) && (saves.get(playerId) ?? 0) === before) warm.set(playerId, { session, crew });
    })
    .catch(() => undefined);
}

/** The crew for a wait, straight from the warm read, or null when it has not been read yet. */
export function peekLineGroup(playerId: number, waitKey: string, now = Date.now()):
  { chosen: boolean; group: LineGroup | null; lastCrew: LineGroup | null } | null {
  const entry = warm.get(playerId);
  if (!entry) return null;
  return { ...parseWaitGroup(entry.session, waitKey), lastCrew: parseLastCrew(entry.crew, now) };
}

export async function loadWaitGroup(playerId: number, waitKey: string): Promise<{ chosen: boolean; group: LineGroup | null }> {
  try {
    return parseWaitGroup(await AsyncStorage.getItem(SESSION_KEY(playerId)), waitKey);
  } catch {
    return { chosen: false, group: null };
  }
}

export async function saveWaitGroup(playerId: number, waitKey: string, group: LineGroup | null): Promise<void> {
  const session = JSON.stringify({ waitKey, group });
  const crew = group && group.players.length >= 2 ? JSON.stringify({ savedAt: Date.now(), group: crewForNextRide(group) }) : null;
  // The warm read follows every save, so a later wait never reads an older crew from memory.
  saves.set(playerId, (saves.get(playerId) ?? 0) + 1);
  const entry = warm.get(playerId);
  if (entry) warm.set(playerId, { session, crew: crew ?? entry.crew });
  try {
    await AsyncStorage.setItem(SESSION_KEY(playerId), session);
    if (crew) await AsyncStorage.setItem(CREW_KEY(playerId), crew);
  } catch {
    // Play together is a convenience; play goes on without storage.
  }
}

export async function loadLastCrew(playerId: number, now = Date.now()): Promise<LineGroup | null> {
  try {
    return parseLastCrew(await AsyncStorage.getItem(CREW_KEY(playerId)), now);
  } catch {
    return null;
  }
}
