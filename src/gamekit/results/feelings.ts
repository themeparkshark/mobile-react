/**
 * feelings.ts: what the end-of-run card says, in feelings instead of data.
 *
 * Every shared results card runs through these helpers so all games end the
 * same way: a big title, stars, the score, one NEW BEST or best line, and one
 * feeling line (a win streak, beating a ghost, so close to a star). Chips are
 * capped at two and only keep things a 7-year-old can brag about. Percentages,
 * milliseconds, zero counts and long sentences never become a chip.
 *
 * Pure functions, no React, so tools/tests can load them directly.
 */

export interface FeelingStat {
  label: string;
  value: string;
  /** Show as filled dots instead of a number ("3 of 4 bursts" = 3 of 4 dots). */
  pips?: readonly [number, number];
}

/** Most chips a results card shows. */
export const MAX_FEELING_CHIPS = 2;
/** A combo shorter than this is not a brag ("BEST COMBO x2" is two hits in a row). */
export const BEST_COMBO_MIN = 3;
/** Most dots a pip chip draws (more reads as a number again). */
const MAX_PIPS = 6;
/** A chip value longer than this is a sentence, not a brag (tips go in the note line). */
const MAX_CHIP_VALUE = 14;

/** Labels that are measurements, never feelings. */
const DATA_LABELS = new Set(['ACCURACY', 'BALL SHARE', 'COIN', 'TIMING', 'TIP', 'NEXT STAR', 'NEXT GOAL', 'WALK BOOST', 'FASTEST']);

/** True when a chip is a measurement or a dud: it never reaches the card. */
export function isDataStat(stat: FeelingStat): boolean {
  const label = String(stat.label ?? '').trim().toUpperCase();
  const value = String(stat.value ?? '').trim();
  if (!label || !value) return true;
  if (stat.pips) {
    const [on, of] = stat.pips;
    return DATA_LABELS.has(label) || !(on > 0) || !(of > 0) || of > MAX_PIPS;
  }
  if (DATA_LABELS.has(label)) return true;
  if (/%/.test(value)) return true;
  if (/\d\s*ms\b/i.test(value)) return true;
  // "0", "x0", "0/3", "0 of 3": nothing to brag about.
  if (/^(x\s*)?0+(\s*(\/|of)\s*\d+)?$/i.test(value)) return true;
  if (value.length > MAX_CHIP_VALUE) return true;
  return false;
}

/**
 * The chips the card shows: best combo first (when it is a real chain), then
 * the game's own brags, minus data, without repeats, at most two.
 */
export function feelingChips(stats: readonly FeelingStat[] | undefined, maxCombo?: number, limit = MAX_FEELING_CHIPS): FeelingStat[] {
  const out: FeelingStat[] = [];
  const seen = new Set<string>();
  const push = (stat: FeelingStat) => {
    const key = stat.label.trim().toUpperCase();
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push({ label: key, value: stat.value.trim(), ...(stat.pips ? { pips: stat.pips } : {}) });
  };
  if (maxCombo && maxCombo >= BEST_COMBO_MIN) push({ label: 'BEST COMBO', value: `x${maxCombo}` });
  for (const stat of stats ?? []) {
    if (!isDataStat(stat)) push(stat);
  }
  return out;
}

// -- Win streaks --------------------------------------------------------------

const streaks = new Map<string, { count: number; lastRun: string | number | null }>();

/**
 * Record one finished run and return the current win streak for this game
 * (wins in a row since the app opened; a 0-star run resets it). A run token
 * makes repeat calls for the same run (a re-render) count once.
 */
export function noteRun(game: string, runToken: string | number, won: boolean): number {
  const prev = streaks.get(game) ?? { count: 0, lastRun: null };
  if (prev.lastRun === runToken) return prev.count;
  const count = won ? prev.count + 1 : 0;
  streaks.set(game, { count, lastRun: runToken });
  return count;
}

/** Test hook: forget every streak. */
export function resetStreaks(): void {
  streaks.clear();
}

export type FeelingKind = 'beatRival' | 'streak' | 'nearRival' | 'nearStar' | 'nearBest' | 'none';

export interface FeelingLine {
  kind: FeelingKind;
  text: string;
  /** Gold pill (a win to celebrate) or light pill (so close, go again). */
  tone: 'gold' | 'light';
}

/**
 * The one feeling line under the score. NEW BEST has its own badge, so this
 * picks the next best true thing: beating a ghost or friend, a win streak,
 * then "so close" lines. Plain words, no numbers a kid has to work out
 * beyond one small gap.
 */
export function feelingLine(input: {
  streak?: number;
  near?: { kind: string; text: string } | null;
}): FeelingLine {
  const near = input.near;
  if (near?.kind === 'beatRival' && near.text) return { kind: 'beatRival', text: near.text, tone: 'gold' };
  const streak = input.streak ?? 0;
  if (streak >= 2) return { kind: 'streak', text: `${streak} wins in a row!`, tone: 'gold' };
  if (near && near.text && (near.kind === 'nearRival' || near.kind === 'nearStar' || near.kind === 'nearBest')) {
    return { kind: near.kind, text: near.text, tone: 'light' };
  }
  return { kind: 'none', text: '', tone: 'light' };
}

/** The big title when a game did not pick one. Never "you lost". */
export function feelingTitle(stars: number, near: boolean): string {
  if (stars >= 3) return 'INCREDIBLE!';
  if (stars === 2) return near ? 'SO CLOSE!' : 'GREAT!';
  if (stars === 1) return 'NICE!';
  return near ? 'SO CLOSE!' : 'GOOD TRY!';
}

/**
 * The next-star bar's one word, read with the bar and a star at its end, so a
 * kid who cannot read big numbers still sees how close the star is.
 */
export function nextStarWord(goal: { nextStar: number; progress: number; near: boolean } | null | undefined): string {
  if (!goal) return '';
  if (!goal.nextStar) return 'ALL 3 STARS!';
  if (goal.near) return 'ALMOST!';
  if (goal.progress >= 0.5) return 'HALFWAY THERE';
  return 'KEEP GOING';
}

/**
 * The win line under Sharky's ghost splits: shown only when the whole run
 * finished ahead of the ghost (the last shared gate), never for one lucky
 * split in a run that ended behind.
 */
export function aheadOfGhost(splits: readonly number[]): boolean {
  return splits.length > 0 && splits[splits.length - 1] > 0;
}
