import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The shark adventures a player has finished in any line, so the recap can say
 * "Adventures found: 7 of 42". Local only; a lost cache just restarts the count.
 */
const PREFIX = 'lineplay_found_adventures_v1_';

/** Files the adventure; returns the total found and whether this one is new. */
export async function noteFoundAdventure(playerId: number, title: string): Promise<{ count: number; isNew: boolean }> {
  const key = `${PREFIX}${playerId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const found = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    const isNew = !found.has(title);
    if (isNew) {
      found.add(title);
      await AsyncStorage.setItem(key, JSON.stringify([...found]));
    }
    return { count: found.size, isNew };
  } catch {
    return { count: 0, isNew: false };
  }
}
