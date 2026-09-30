/**
 * Finn's word-by-word speech (WS8). Pure, unit tested in
 * tools/tests/tutorial-flow.test.cjs.
 *
 * Every word is laid out from the first frame (unrevealed words are
 * transparent), so the bubble never resizes while he talks. Words land on a
 * steady beat that slows a little after punctuation, like speech.
 */
export const WORD_BEAT_MS = 42;
export const PUNCTUATION_PAUSE_MS = 140;
/** Finn's line starts after he lands and the bubble pops. */
export const REVEAL_START_MS = 260;

export function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter(part => part.length > 0);
}

/** When each chunk (words and the spaces between them) appears, in ms from the start of the reveal. */
export function revealSchedule(parts: readonly string[]): number[] {
  const times: number[] = [];
  let t = 0;
  for (const part of parts) {
    if (/^\s+$/.test(part)) { times.push(t); continue; }
    times.push(t);
    t += WORD_BEAT_MS + (/[.!?,:]$/.test(part) ? PUNCTUATION_PAUSE_MS : 0);
  }
  return times;
}

/** Total reveal time for a line. */
export function revealDuration(text: string): number {
  const parts = splitWords(text);
  const times = revealSchedule(parts);
  return times.length ? times[times.length - 1] + WORD_BEAT_MS : 0;
}

/** How many chunks are visible `elapsed` ms into the reveal. */
export function visibleParts(parts: readonly string[], elapsed: number): number {
  const times = revealSchedule(parts);
  let count = 0;
  while (count < times.length && times[count] <= elapsed) count++;
  return count;
}
