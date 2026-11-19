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

/**
 * The win card's beats, in ms from the card mounting (DIRECTION motion: stuck on, the coin lands,
 * the dot walks, the prizes count, then fly to the chips). Reduce Motion keeps the order with fades.
 */
export const WIN_BEATS = {
  land: 240,
  sticker: 700,
  walk: 900,
  prizes: 1050,
  prizeGap: 110,
  /** A prize starts counting this long after it is stuck on. */
  countLead: 120,
  countStep: 70,
  fly: 1950,
  flyGap: 170,
} as const;

/** The values "+N" shows while it counts up: four steps ending on N, never repeating a value. */
export function countSteps(value: number): number[] {
  const out: number[] = [];
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const v = Math.max(1, Math.round(value * f));
    if (!out.includes(v)) out.push(v);
  }
  return out;
}
