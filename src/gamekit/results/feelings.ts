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
/** A 0-star run shows the quiet BEST only within a quarter of it. */
export function nearBest(score: number, best: number): boolean {
  return best > 0 && score >= 0.75 * best;
}

export function feelingChips(stats: readonly FeelingStat[] | undefined, maxCombo?: number, limit = MAX_FEELING_CHIPS): FeelingStat[] {
  const out: FeelingStat[] = [];
  const seen = new Set<string>();
  const push = (stat: FeelingStat) => {
    const key = stat.label.trim().toUpperCase();
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    // Pips show only what was earned: lit dots, never the empty ones still missing.
    out.push({ label: key, value: stat.value.trim(), ...(stat.pips ? { pips: [stat.pips[0], stat.pips[0]] as const } : {}) });
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
export function feelingTitle(stars: number, near: boolean, newBest = false): string {
  if (stars >= 3) return 'INCREDIBLE!';
  // Two stars is always a win, near star 3 or not: the bar and its star say
  // how close the third one is. SO CLOSE! is only for a 0-star run.
  if (stars === 2) return 'GREAT!';
  if (stars === 1) return 'NICE!';
  if (newBest) return BEST_YET_TITLE;
  return near ? 'SO CLOSE!' : 'GOOD TRY!';
}

/** The ribbon on a 0-star run that still beat the kid's own best. */
export const BEST_YET_TITLE = 'YOUR BEST YET!';

/** 0-star "try again" titles a personal best replaces (finish words like TIME! stay). */
const SOFT_TRY_TITLES = new Set(['GOOD TRY!', 'SO CLOSE!', 'KEEP MARCHING!', 'THE PARADE NEEDS YOU!', 'KEEP SWIMMING!', 'NICE TRY!', 'GOOD START!', 'TRY AGAIN', 'TRY AGAIN!', 'STILL FIGHTING!']);

/** True for a "go again" title that a personal best should replace. */
export function isSoftTryTitle(title: string | undefined): boolean {
  return !!title && SOFT_TRY_TITLES.has(title.trim().toUpperCase());
}

/**
 * A personal best always reads as a win: a soft "try again" title (GOOD TRY!,
 * SO CLOSE!, NICE TRY!) never sits next to NEW BEST!. With 0 stars it becomes
 * YOUR BEST YET!; with stars it becomes the plain star title (NICE!, GREAT!,
 * INCREDIBLE!). Real info titles (YOUR RIDE'S UP!, TIME!, NEW FINN) are kept.
 */
/**
 * NEW BEST only on a run that earned a star (core loop 5.3: "no NEW BEST on a
 * loss"). The mini-game cards pass their best through this; a 0-star run keeps
 * its kind try title and the best is still saved.
 */
export function bestOnWin(stars: number, isNewBest: boolean): boolean {
  return isNewBest && stars > 0;
}

export function bestAwareTitle(title: string | undefined, stars: number, isNewBest: boolean): string | undefined {
  // Titles follow the stars: two or three lit stars never sit under a soft
  // "try again" word (SO CLOSE! over two gold stars read as a near-loss).
  if (stars >= 2 && title && isSoftTryTitle(title)) return feelingTitle(stars, false, isNewBest);
  if (!isNewBest) return title;
  if (stars > 0) return title && isSoftTryTitle(title) ? feelingTitle(stars, false, true) : title;
  if (!title || isSoftTryTitle(title)) return BEST_YET_TITLE;
  return title;
}

/**
 * The Boss Bash ribbon. The stars decide the feeling word, the same rule as
 * every other game (3 INCREDIBLE!, 2 GREAT!, 1 NICE!), so the title and the
 * stars never disagree (STILL FIGHTING! over three gold stars read as a
 * loss). A team win keeps its win words; STILL FIGHTING! is only for a 0-star
 * round that hit, and GOOD TRY! for no hits. A personal best is never soft.
 */
export function bossTitle(input: { won: boolean; ko: boolean; noHits: boolean; stars: number; newBest: boolean }): string {
  const { won, ko, noHits, stars, newBest } = input;
  if (won) return ko && !noHits ? 'YOU FINISHED IT!' : 'TEAM WON!';
  if (noHits) return 'GOOD TRY!';
  if (stars > 0) return feelingTitle(stars, false, newBest);
  return bestAwareTitle('STILL FIGHTING!', 0, newBest) ?? 'STILL FIGHTING!';
}

export type EndFeel = 'win' | 'best' | 'saved' | 'try';

/**
 * How the end of a run sounds and buzzes. Stars or a personal best are a win
 * (success haptic, win sound, confetti). A run the line ended (the ride came
 * up or the kid left the line, with or without points) is calm: no fail buzz,
 * no lose sound, and no best (saved runs never set one). Only a plain 0-star
 * run the kid played to the end gets the soft try sound.
 */
export function endFeel(input: { stars: number; isNewBest: boolean; saved: boolean; wrapped?: boolean }): EndFeel {
  if (input.stars > 0) return 'win';
  // A saved run never writes a best (it is not a real finished run), so it
  // never claims one either. A 0-point ride-up is a send-off, not a loss.
  if (input.saved || input.wrapped) return 'saved';
  if (input.isNewBest) return 'best';
  return 'try';
}

/**
 * The next-star bar's one word, read with the bar and a star at its end, so a
 * kid who cannot read big numbers still sees how close the star is.
 */
/** Bar share from which the next-star word reads GETTING CLOSE! (ALMOST! starts at the near mark, 0.85). */
export const NEXT_STAR_CLOSE = 0.65;

export function nextStarWord(goal: { nextStar: number; progress: number; near: boolean } | null | undefined): string {
  if (!goal) return '';
  if (!goal.nextStar) return 'ALL 3 STARS!';
  if (goal.near) return 'ALMOST!';
  // Between halfway and almost, the bar is clearly past the middle: a bar at
  // 75% never says HALFWAY THERE.
  if (goal.progress >= NEXT_STAR_CLOSE) return 'GETTING CLOSE!';
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
