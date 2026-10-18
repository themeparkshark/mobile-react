import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The shark adventures a player has finished in any line, so the recap can say
 * "Adventures found: 7 of 42". Local only; a lost cache just restarts the count.
 */
const PREFIX = 'lineplay_found_adventures_v1_';

export async function noteFoundAdventure(playerId: number, title: string): Promise<number> {
  const key = `${PREFIX}${playerId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const found = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    if (!found.has(title)) {
      found.add(title);
      await AsyncStorage.setItem(key, JSON.stringify([...found]));
    }
    return found.size;
  } catch {
    return 0;
  }
}
