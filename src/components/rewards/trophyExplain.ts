/**
 * What a trophy is, in one line (fix w4 T054). The win card names the next trophy
 * ("Bronze trophy: 11 more wins"); the first time a player sees that line it says what
 * the trophy is instead, and a tap on the line swaps between the two any time after.
 * Saved per player id (AsyncStorage "tps.trophyExplained.v1@p<id>"); a failed read or
 * write never blocks the card, it only means the explainer may show once more.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tps.trophyExplained.v1';

export function trophyExplainedKey(playerId: number | string): string {
  return `${KEY}@p${playerId}`;
}

export async function trophyExplained(playerId: number | null | undefined): Promise<boolean> {
  if (playerId == null) return true;
  try {
    return (await AsyncStorage.getItem(trophyExplainedKey(playerId))) === '1';
  } catch {
    return false;
  }
}

export async function markTrophyExplained(playerId: number | null | undefined): Promise<void> {
  if (playerId == null) return;
  try { await AsyncStorage.setItem(trophyExplainedKey(playerId), '1'); } catch { /* best effort */ }
}
