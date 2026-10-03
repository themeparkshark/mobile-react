/**
 * Haunt run state machine (DESIGN 3.3, H1 to H6). Pure, unit tested.
 *
 *   none --enter (tap "I'm in line": within radius, accuracy <= 50, fresh fix)--> quiet
 *   quiet (in line: no prompts, sound or haptics; Line Play is welcome) --min_done_at--> ready
 *   ready --GPS exit (2 fixes > 150 m, 60 s apart) | "I survived it!"--> finishing --server ok--> done
 *
 * min_done_at mirrors the server: max(walk + 2, round(0.4 x posted wait at
 * entry)) minutes after entry, so a 60-minute line can't be credited at 7.
 * There is no next-app-open finish: unlocking the phone in line never credits.
 *
 * The server owns the timing (min_done_at is server-computed). When an entry is
 * queued offline the app writes an optimistic local run from the fix time so
 * the phones-down quiet period still starts at the gate.
 */
import type { FrightRun, FrightSpot } from '../../api/endpoints/fright/types';
import { FRIGHT_DEFAULTS } from './config';
import { distanceMeters, type FrightFixSample } from './geo';

export type EnterBlock = 'not_accepting' | 'no_fix' | 'poor_accuracy' | 'stale_fix' | 'too_far' | 'open_run';

export interface EnterCheck {
  readonly ok: boolean;
  readonly reason?: EnterBlock;
  readonly distance?: number | null;
}

/** H1: may the player tap "I'm in line" at this haunt right now? */
export function canEnter(spot: Pick<FrightSpot, 'latitude' | 'longitude' | 'radius' | 'accepting'>,
  fix: FrightFixSample | null | undefined, now: number, cfg: { readonly enterAccuracyM?: number } = {}): EnterCheck {
  if (!spot.accepting) return { ok: false, reason: 'not_accepting' };
  if (!fix) return { ok: false, reason: 'no_fix' };
  const maxAccuracy = cfg.enterAccuracyM ?? FRIGHT_DEFAULTS.enterAccuracyM;
  if (fix.accuracy == null || !(fix.accuracy <= maxAccuracy)) return { ok: false, reason: 'poor_accuracy' };
  if (now - fix.at > FRIGHT_DEFAULTS.fixFreshMs || fix.at - now > 60_000) return { ok: false, reason: 'stale_fix' };
  const distance = distanceMeters(fix, spot);
  const radius = (spot.radius > 0 ? spot.radius : FRIGHT_DEFAULTS.hauntRadiusM)
    + Math.min(fix.accuracy, FRIGHT_DEFAULTS.enterAccuracySlackM);
  if (distance > radius) return { ok: false, reason: 'too_far', distance };
  return { ok: true, distance };
}

export type RunStage = 'none' | 'quiet' | 'ready' | 'done' | 'expired';

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

/** Minimum dwell in minutes: max(walk + 2, round(0.4 x posted wait at entry)). */
export function minDwellMinutes(walkMinutes = 5, postedMinutes: number | null | undefined = null,
  extraMinutes: number = FRIGHT_DEFAULTS.minDwellExtraMinutes): number {
  return Math.max(walkMinutes + extraMinutes, Math.round(0.4 * Math.max(0, postedMinutes ?? 0)));
}

/** Earliest finish: the server's min_done_at (authoritative), else the same formula from entered_at. */
export function minDoneAt(run: FrightRun | null | undefined, walkMinutes = 5,
  extraMinutes: number = FRIGHT_DEFAULTS.minDwellExtraMinutes): number | null {
  if (!run) return null;
  const server = ms(run.min_done_at);
  if (server != null) return server;
  const entered = ms(run.entered_at);
  return entered == null ? null : entered + minDwellMinutes(walkMinutes, run.posted_minutes, extraMinutes) * 60_000;
}

export function runStage(run: FrightRun | null | undefined, now: number, walkMinutes?: number): RunStage {
  if (!run || !run.entered_at) return 'none';
  if (run.done_at) return 'done';
  const entered = ms(run.entered_at);
  if (entered != null && now - entered > FRIGHT_DEFAULTS.runMaxMs) return 'expired';
  const min = minDoneAt(run, walkMinutes);
  return min != null && now < min ? 'quiet' : 'ready';
}

/** H6c: the "I survived it!" button is enabled. */
export function survivedEnabled(run: FrightRun | null | undefined, now: number, walkMinutes?: number): boolean {
  return runStage(run, now, walkMinutes) === 'ready';
}

/** H6 phones-down: prompts, sound and haptics are allowed (not inside the quiet window). */
export function mayPrompt(run: FrightRun | null | undefined, now: number, walkMinutes?: number): boolean {
  return runStage(run, now, walkMinutes) !== 'quiet';
}

/** H6a exit rule: 2 consecutive fixes, each accuracy <= 50 m and > 150 m from the haunt pin, at least 60 s apart. */
export const EXIT_FAR_M = 150;
export const EXIT_GAP_MS = 60_000;
export const EXIT_ACCURACY_M = 50;

export interface ExitHold {
  readonly key: string;
  readonly first: FrightFixSample;
}

function exitQualifies(run: FrightRun, spot: Pick<FrightSpot, 'latitude' | 'longitude'>, fix: FrightFixSample, min: number | null): boolean {
  if (min != null && fix.at < min) return false;
  if (fix.accuracy == null || fix.accuracy > EXIT_ACCURACY_M) return false;
  return distanceMeters(fix, spot) > EXIT_FAR_M;
}

/**
 * H6a: feed one fix. Returns the new hold and whether the exit is confirmed.
 * A fix that doesn't qualify (too close, rough, or before min dwell) resets.
 */
export function exitStep(hold: ExitHold | null, run: FrightRun | null | undefined,
  spot: Pick<FrightSpot, 'latitude' | 'longitude' | 'walk_minutes'> | null | undefined,
  fix: FrightFixSample | null | undefined, now: number): { hold: ExitHold | null; exit: boolean } {
  if (!run || !spot || !fix || runStage(run, now, spot.walk_minutes) !== 'ready') return { hold: null, exit: false };
  const min = minDoneAt(run, spot.walk_minutes);
  if (!exitQualifies(run, spot, fix, min)) return { hold: null, exit: false };
  if (hold && hold.key === run.key) {
    if (fix.at - hold.first.at >= EXIT_GAP_MS) return { hold: null, exit: true };
    return { hold, exit: false };
  }
  return { hold: { key: run.key, first: fix }, exit: false };
}

export type FinishMethod = 'exit' | 'button';

/** H6: finish only on a confirmed GPS exit or the button, and never before min_done_at. */
export function finishDecision(input: {
  readonly run: FrightRun | null | undefined;
  readonly spot: Pick<FrightSpot, 'walk_minutes'> | null | undefined;
  readonly now: number;
  readonly exitConfirmed?: boolean;
  readonly buttonPressed?: boolean;
}): FinishMethod | null {
  const { run, spot, now, exitConfirmed, buttonPressed } = input;
  if (runStage(run, now, spot?.walk_minutes) !== 'ready') return null;
  if (buttonPressed) return 'button';
  if (exitConfirmed) return 'exit';
  return null;
}

/** The optimistic local run written when an entry is queued (offline) or before the server answers. */
export function localRun(key: string, enteredAt: number, walkMinutes: number, postedMinutes: number | null,
  extraMinutes: number = FRIGHT_DEFAULTS.minDwellExtraMinutes): FrightRun {
  return {
    key, entered_at: new Date(enteredAt).toISOString(), done_at: null,
    min_done_at: new Date(enteredAt + minDwellMinutes(walkMinutes, postedMinutes, extraMinutes) * 60_000).toISOString(),
    wait_minutes: null, posted_minutes: postedMinutes, score: null, reaction: null, re_swim: false,
  };
}

/** Minutes since entry, for the pill: "In line: The Robot City · 12 min". */
export function minutesInLine(run: FrightRun | null | undefined, now: number): number {
  const entered = ms(run?.entered_at);
  return entered == null ? 0 : Math.max(0, Math.floor((now - entered) / 60_000));
}

/** Minutes left before "I survived it!" unlocks (rounded up). */
export function quietMinutesLeft(run: FrightRun | null | undefined, now: number, walkMinutes?: number): number {
  const min = minDoneAt(run, walkMinutes);
  return min == null ? 0 : Math.max(0, Math.ceil((min - now) / 60_000));
}
