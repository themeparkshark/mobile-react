/**
 * wordGate: limits how many fly-up words Whack shows at once.
 *
 * A fast flurry used to stack QUICK +80, +50, PERFECT, BOLTED! and
 * BUTTERFINGERS! on top of each other, a pile of text a 7-year-old cannot
 * read. Now at most two words float at a time (each lives about 700 ms);
 * extra words are dropped while the sound, haptics and sparkles still fire.
 * Big moments (FEVER!, FEVER READY!, the boss going down) always show.
 *
 * Pure and allocation-light: a tiny ring of timestamps, no React.
 */

export interface WordGate {
  readonly max: number;
  readonly lifeMs: number;
  shownAt: number[];
}

export const WORD_GATE_MAX = 2;
export const WORD_GATE_LIFE_MS = 700;

export function createWordGate(max = WORD_GATE_MAX, lifeMs = WORD_GATE_LIFE_MS): WordGate {
  return { max, lifeMs, shownAt: [] };
}

/** True when this word may show now (and records it). `important` always shows. */
export function allowWord(gate: WordGate, now: number, important = false): boolean {
  gate.shownAt = gate.shownAt.filter((at) => now - at < gate.lifeMs);
  if (!important && gate.shownAt.length >= gate.max) return false;
  gate.shownAt.push(now);
  return true;
}

/** The points in a dropped score word ("QUICK +80" -> 80), so they fold into the flurry total. */
export function droppedPoints(text: string): number {
  const m = /\+(\d[\d,]*)/.exec(text);
  return m ? Number(m[1].replace(/,/g, '')) || 0 : 0;
}
