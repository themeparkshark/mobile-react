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

export async function loadWaitGroup(playerId: number, waitKey: string): Promise<{ chosen: boolean; group: LineGroup | null }> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY(playerId));
    if (!raw) return { chosen: false, group: null };
    const saved = JSON.parse(raw) as { waitKey?: unknown; group?: unknown };
    if (saved.waitKey !== waitKey) return { chosen: false, group: null };
    return { chosen: true, group: isLineGroup(saved.group) ? saved.group : null };
  } catch {
    return { chosen: false, group: null };
  }
}

export async function saveWaitGroup(playerId: number, waitKey: string, group: LineGroup | null): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEY(playerId), JSON.stringify({ waitKey, group }));
    if (group && group.players.length >= 2) {
      await AsyncStorage.setItem(CREW_KEY(playerId), JSON.stringify({ savedAt: Date.now(), group: crewForNextRide(group) }));
    }
  } catch {
    // Play together is a convenience; play goes on without storage.
  }
}

export async function loadLastCrew(playerId: number, now = Date.now()): Promise<LineGroup | null> {
  try {
    const raw = await AsyncStorage.getItem(CREW_KEY(playerId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { savedAt?: unknown; group?: unknown };
    if (typeof saved.savedAt !== 'number' || now - saved.savedAt > LAST_CREW_TTL_MS || now < saved.savedAt - 60_000) return null;
    return isLineGroup(saved.group) && saved.group.players.length >= 2 ? crewForNextRide(saved.group) : null;
  } catch {
    return null;
  }
}
