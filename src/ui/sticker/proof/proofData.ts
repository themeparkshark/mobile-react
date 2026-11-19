/**
 * Pure helpers for the three proof screens (unit tested in tools/tests/sticker-kit.test.cjs).
 * No React, no React Native.
 */

export type ProofSpotState = 'empty' | 'ghost' | 'next' | 'yours';

/** One key press on the gate: a digit adds (up to `length`), 'del' takes the last one off. */
export function gatePress(typed: string, key: string, length: number): string {
  if (key === 'del') return typed.slice(0, -1);
  if (!/^[0-9]$/.test(key)) return typed;
  return typed.length >= length ? typed : typed + key;
}

/** The answer box as spots: typed digits are yours, the next one wears the gold ring, the rest are empty. */
export function gateSpots(typed: string, length: number): { state: ProofSpotState; glyph?: string }[] {
  return Array.from({ length }, (_, i) => (i < typed.length
    ? { state: 'yours' as const, glyph: typed[i] }
    : { state: i === typed.length ? 'next' as const : 'empty' as const }));
}

/** The week row (kit.png): days before today are yours (Alex's coin), today is next (the one gold ring), the rest are empty spots. */
export function weekSpots(today: number, days = 7): ProofSpotState[] {
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    if (day < today) return 'yours';
    if (day === today) return 'next';
    return 'empty';
  });
}

/** Wins counted toward a prize: the line under the win card's bar. */
export function winsLeft(found: number, goal: number): number {
  return Math.max(0, goal - found);
}

/**
 * Shelf spot states. `found` marks the player's coins; `coming` marks coins not out yet (limited
 * coins out of rotation), which show as empty spots. The first coin still to find is next up.
 */
export function shelfStates(found: readonly boolean[], coming: readonly boolean[] = []): ProofSpotState[] {
  let nextGiven = false;
  return found.map((isFound, i) => {
    if (isFound) return 'yours';
    if (coming[i]) return 'empty';
    if (!nextGiven) { nextGiven = true; return 'next'; }
    return 'ghost';
  });
}

/**
 * The sample "found" mask the proof uses when the signed-in scratch player has found too few
 * coins to show every state: `count` coins spread over `total`, the same every run.
 */
export function sampleFound(total: number, count: number): boolean[] {
  const out = Array.from({ length: total }, () => false);
  for (let k = 0; k < Math.min(count, total); k += 1) out[Math.floor((k * total) / count + 0.5) % total] = true;
  return out;
}

/** Split a list into rows of `size` (the shelf's planks). */
export function rowsOf<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}
