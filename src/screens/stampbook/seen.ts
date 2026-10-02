/**
 * Which earned stamps the player has already opened (so the full slam plays
 * once, and NEW tags clear), and which completed sections were celebrated.
 * Per device, best effort: storage failure just means a stamp slams again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'stampbook.seen.v1';
const SECTIONS_KEY = 'stampbook.sectionsCelebrated.v1';

async function readSet(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}

async function writeSet(key: string, set: Set<string>): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(Array.from(set))); } catch { /* best effort */ }
}

export const loadSeen = () => readSet(KEY);
export const saveSeen = (set: Set<string>) => writeSet(KEY, set);
export const loadCelebrated = () => readSet(SECTIONS_KEY);
export const saveCelebrated = (set: Set<string>) => writeSet(SECTIONS_KEY, set);
