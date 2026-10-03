/**
 * Haunt run state machine (DESIGN 3.3, H1 to H6). Pure, unit tested.
 *
 *   none --enter (tap "I'm in line": within radius, accuracy <= 50, fresh fix)--> quiet
 *   quiet (phones-down: no prompts, sound or haptics) --min_done_at--> ready
 *   ready --exit fix > 90 m | next app open | "I survived it!"--> finishing --server ok--> done
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

/** Earliest finish: server min_done_at, else entered + walk + 2 min. */
export function minDoneAt(run: FrightRun | null | undefined, walkMinutes = 5,
  extraMinutes: number = FRIGHT_DEFAULTS.minDwellExtraMinutes): number | null {
  if (!run) return null;
  const server = ms(run.min_done_at);
  if (server != null) return server;
  const entered = ms(run.entered_at);
  return entered == null ? null : entered + (walkMinutes + extraMinutes) * 60_000;
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

/** H6a: one fix more than 90 m from the entrance after the minimum dwell finishes the run. */
export function exitDetected(run: FrightRun | null | undefined,
  spot: Pick<FrightSpot, 'latitude' | 'longitude'> | null | undefined, fix: FrightFixSample | null | undefined,
  now: number, walkMinutes?: number): boolean {
  if (!spot || !fix || runStage(run, now, walkMinutes) !== 'ready') return false;
  const min = minDoneAt(run, walkMinutes);
  // The exit fix itself must come after the minimum dwell (an old queued fix never counts).
  if (min != null && fix.at < min) return false;
  if (fix.accuracy != null && fix.accuracy > 100) return false;
  return distanceMeters(fix, spot) > FRIGHT_DEFAULTS.exitFarM;
}

export type FinishMethod = 'exit' | 'next_open' | 'button';

/**
 * H6: decide whether to finish now. `appOpened` is true on the first tick after
 * the app comes to the foreground (next-app-open finish).
 */
export function finishDecision(input: {
  readonly run: FrightRun | null | undefined;
  readonly spot: Pick<FrightSpot, 'latitude' | 'longitude' | 'walk_minutes'> | null | undefined;
  readonly fix: FrightFixSample | null | undefined;
  readonly now: number;
  readonly appOpened: boolean;
  readonly buttonPressed?: boolean;
}): FinishMethod | null {
  const { run, spot, fix, now, appOpened, buttonPressed } = input;
  const walk = spot?.walk_minutes;
  if (runStage(run, now, walk) !== 'ready') return null;
  if (buttonPressed) return 'button';
  if (exitDetected(run, spot, fix, now, walk)) return 'exit';
  if (appOpened) return 'next_open';
  return null;
}

/** The optimistic local run written when an entry is queued (offline) or before the server answers. */
export function localRun(key: string, enteredAt: number, walkMinutes: number, postedMinutes: number | null,
  extraMinutes: number = FRIGHT_DEFAULTS.minDwellExtraMinutes): FrightRun {
  return {
    key, entered_at: new Date(enteredAt).toISOString(), done_at: null,
    min_done_at: new Date(enteredAt + (walkMinutes + extraMinutes) * 60_000).toISOString(),
    wait_minutes: null, posted_minutes: postedMinutes, score: null, reaction: null, re_swim: false,
  };
}

/** Minutes left in the quiet window (rounded up), for "Phones down: 4 min". */
export function quietMinutesLeft(run: FrightRun | null | undefined, now: number, walkMinutes?: number): number {
  const min = minDoneAt(run, walkMinutes);
  return min == null ? 0 : Math.max(0, Math.ceil((min - now) / 60_000));
}
