/**
 * Fin's babble schedule (design 13.3, rev 7 H10). Pure, so the read-lock
 * audio is the same on every phone and unit-tested.
 */

export interface BabbleHit {
  atMs: number;
  /** 1-8: fin_babble_{(first letter index mod 8) + 1}. */
  syllable: number;
}

/**
 * Fin's babble schedule (Animal Crossing, rev 7 H10): the question is "said"
 * over the read-lock. Words are timed by their character offset; a syllable
 * plays on every 2nd word, or the 3rd when the 2nd would land closer than
 * 140ms to the last one. The syllable comes from the word's first letter, so
 * the same question always sounds the same. Pure (unit-tested).
 */
export function babbleSchedule(text: string, durationMs: number, minGapMs = 140): BabbleHit[] {
  const words: { at: number; ch: string }[] = [];
  const total = Math.max(1, text.length);
  const re = /[A-Za-z0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) words.push({ at: Math.round((m.index / total) * durationMs), ch: m[0][0].toLowerCase() });
  const out: BabbleHit[] = [];
  let last = -Infinity;
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (w.at - last >= minGapMs) {
      const code = w.ch.charCodeAt(0);
      const idx = code >= 97 && code <= 122 ? code - 97 : code >= 48 && code <= 57 ? code - 48 : 0;
      out.push({ atMs: w.at, syllable: (idx % 8) + 1 });
      last = w.at;
      i += 2;
    } else i += 1;
  }
  return out;
}

