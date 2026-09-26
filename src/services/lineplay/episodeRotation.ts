import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'lineplay_last_adaptive_episode_v1_';

export function adaptiveEpisodeKey(playerId: number, parkId: number | undefined, rideId: number): string {
  return `${PREFIX}${playerId}_${parkId ?? 0}_${rideId}`;
}

/** Choose the next story without consuming it just for opening the queue screen. */
export async function selectAdaptiveEpisode(
  playerId: number,
  parkId: number | undefined,
  rideId: number,
  count: number,
  seed: number,
): Promise<number> {
  if (!Number.isInteger(count) || count < 1) return 0;
  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) : 0;
  if (count === 1) return 0;
  const key = adaptiveEpisodeKey(playerId, parkId, rideId);
  try {
    const raw = await AsyncStorage.getItem(key);
    const previous = raw === null ? null : Number(raw);
    const next = previous !== null && Number.isInteger(previous) && previous >= 0 && previous < count
      ? (previous + 1) % count
      : safeSeed % count;
    return next;
  } catch {
    // Offline queue play should not depend on local history storage.
    return safeSeed % count;
  }
}

/** Commit a chapter only after a player actually completes one of its activities. */
export async function recordAdaptiveEpisode(
  playerId: number,
  parkId: number | undefined,
  rideId: number,
  episode: number,
  count: number,
): Promise<void> {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(episode) ||
      episode < 0 || episode >= count) return;
  try {
    await AsyncStorage.setItem(adaptiveEpisodeKey(playerId, parkId, rideId), String(episode));
  } catch {
    // The current chapter remains playable if local history storage is unavailable.
  }
}
