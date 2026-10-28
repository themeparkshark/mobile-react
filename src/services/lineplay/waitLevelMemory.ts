/**
 * The level a kid reached on a ride coin during THIS wait. It lives outside the
 * coin's component, so leaving LinePlay and coming back mid-wait (or any
 * remount) still shows "LEVELED UP!" and never a bare "0 of 6" after 90 minutes.
 * Pure and unit tested (tools/tests/lineplay-wait-screen.test.cjs).
 */

export interface WaitLevelMark {
  /** The level reached this wait. */
  readonly level: number;
  /** A new Part landed after the level up (the coin then shows its next goal instead). */
  readonly partLanded: boolean;
}

/** One wait: the session's start time (or any stable id for it). */
export type WaitKey = string | number;

const marks = new Map<string, WaitLevelMark>();
/** A handful of waits is plenty; the oldest is dropped first. */
const MAX_MARKS = 8;
const keyFor = (wait: WaitKey, coinId: number) => `${wait}:${coinId}`;

export function waitLevelMark(wait: WaitKey | null | undefined, coinId: number | null | undefined): WaitLevelMark | null {
  if (wait == null || coinId == null) return null;
  return marks.get(keyFor(wait, coinId)) ?? null;
}

/** The wait id must be real (never a shared fallback), so two waits can never share a mark. */
export function rememberWaitLevel(wait: WaitKey, coinId: number, level: number): WaitLevelMark {
  const key = keyFor(wait, coinId);
  const mark: WaitLevelMark = { level, partLanded: false };
  marks.delete(key);
  marks.set(key, mark);
  while (marks.size > MAX_MARKS) marks.delete(marks.keys().next().value as string);
  return mark;
}

export function markWaitPartLanded(wait: WaitKey | null | undefined, coinId: number | null | undefined): WaitLevelMark | null {
  const mark = waitLevelMark(wait, coinId);
  if (!mark || mark.partLanded) return mark;
  const next = { ...mark, partLanded: true };
  marks.set(keyFor(wait!, coinId!), next);
  return next;
}

/** Tests only. */
export function forgetWaitLevels(): void {
  marks.clear();
}

/**
 * The one level marker the coin wears, never two level numbers at once:
 * the "LEVELED UP!" ribbon right after a level up, until the first new Part lands;
 * then the next goal ("up arrow 4"). Nothing at max level (the crown sits there).
 */
export function coinLevelMarker(mark: WaitLevelMark | null, goalLevel: number | null): 'ribbon' | 'goal' | null {
  if (mark && !mark.partLanded) return 'ribbon';
  return goalLevel != null ? 'goal' : null;
}
