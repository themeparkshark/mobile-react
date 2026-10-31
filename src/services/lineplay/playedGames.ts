/**
 * Which queue games this account has ever played on this phone, so the arcade's NEW pill means
 * something: NEW only on a game never played here, and on at most two tiles at once (when all six
 * say NEW, the badge says nothing). Kept per player in AsyncStorage; a read error just shows no NEW.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (playerId: number) => `tps_games_played_v1:${playerId}`;
/** The most NEW pills the arcade shows at once. */
export const MAX_NEW_TILES = 2;

export async function loadPlayedGames(playerId: number): Promise<ReadonlySet<string>> {
  try {
    const raw = await AsyncStorage.getItem(key(playerId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Adds these game ids to the player's played list and returns the whole list. */
export async function notePlayedGames(playerId: number, gameIds: readonly string[]): Promise<ReadonlySet<string>> {
  const played = new Set(await loadPlayedGames(playerId));
  const before = played.size;
  for (const id of gameIds) if (id) played.add(id);
  if (played.size !== before) {
    try { await AsyncStorage.setItem(key(playerId), JSON.stringify([...played])); } catch { /* next play tries again */ }
  }
  return played;
}

/**
 * NEW per arcade tile, in order: a game never played on this account (and not played this wait),
 * at most MAX_NEW_TILES of them. Null `played` (still loading) shows no NEW at all, so the pills
 * never flash on and off.
 */
export function arcadeNewFlags(choices: readonly { readonly gameId?: string; readonly bestStars?: number }[],
  played: ReadonlySet<string> | null, max: number = MAX_NEW_TILES): boolean[] {
  let left = played ? max : 0;
  return choices.map(choice => {
    if (left <= 0 || !choice.gameId || choice.bestStars != null || played?.has(choice.gameId)) return false;
    left -= 1;
    return true;
  });
}
