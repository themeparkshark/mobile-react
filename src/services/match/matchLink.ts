/**
 * Match link: is this phone still talking to the park server during a fight?
 *
 * Every live battle or waiting screen (Boss Raid sheet, Gym arena) feeds its
 * poll results in here. A failure starts a short reconnect window; inside it
 * the screen says "Reconnecting..." and retries with backoff. Past it the
 * screen says plainly that the park can't be reached and offers a way out.
 * Leaving after a network drop never costs anything: leaving is not a loss,
 * and Boss Raid Energy is only spent once the server confirms a saved round.
 *
 * Pure (no React, no timers of its own) so the rules are unit tested. The
 * controller takes its clock and timers as arguments; useMatchLink wires it
 * to React and AppState.
 */

export type LinkPhase = 'live' | 'reconnecting' | 'lost';

/** How long "Reconnecting..." shows before the screen offers to leave. */
export const RECONNECT_WINDOW_MS = 20_000;
/** Backoff between retries while the link is down (then holds at the last step). */
export const RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000];
const JITTER = 0.2;

export interface LinkState {
  readonly lastOkAt: number | null;
  /** When the current run of failures began; null while the link is up. */
  readonly failingSince: number | null;
  readonly failures: number;
}

export const INITIAL_LINK: LinkState = { lastOkAt: null, failingSince: null, failures: 0 };

export function linkOk(_state: LinkState, at: number): LinkState {
  return { lastOkAt: at, failingSince: null, failures: 0 };
}

export function linkFail(state: LinkState, at: number): LinkState {
  return { lastOkAt: state.lastOkAt, failingSince: state.failingSince ?? at, failures: state.failures + 1 };
}

/**
 * Back from the background. Time asleep never counts toward "lost": a phone
 * that was locked for ten minutes gets a fresh reconnect window and an
 * immediate retry instead of a scary banner the moment it wakes.
 */
export function linkResumed(state: LinkState, at: number): LinkState {
  return state.failingSince == null ? state : { ...state, failingSince: at, failures: 0 };
}

export function linkPhase(state: LinkState, now: number, windowMs = RECONNECT_WINDOW_MS): LinkPhase {
  if (state.failingSince == null) return 'live';
  return now - state.failingSince < windowMs ? 'reconnecting' : 'lost';
}

/** Delay before retry number `failures` (1-based), with +/-20% jitter so phones don't stampede. */
export function retryDelayMs(failures: number, random: () => number = Math.random): number {
  const step = RETRY_DELAYS_MS[Math.min(Math.max(1, Math.floor(failures)), RETRY_DELAYS_MS.length) - 1];
  const r = random();
  const unit = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0.5;
  return Math.round(step * (1 - JITTER + unit * 2 * JITTER));
}

type MaybeHttpError = { response?: { status?: unknown } } | null | undefined;

/**
 * True when the server could not be reached: no HTTP answer at all (dropped,
 * refused, DNS gone, timed out), or a gateway that answered for a dead origin
 * (502/503/504, Cloudflare 52x/530 when a tunnel dies). A 4xx or a 500 is the
 * server talking, so the link is up even though the request failed.
 */
export function isLinkFailure(error: unknown): boolean {
  const status = (error as MaybeHttpError)?.response?.status;
  if (typeof status !== 'number' || status <= 0) return true;
  return status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 530);
}

export const LINK_COPY = {
  reconnecting: 'Reconnecting…',
  lostTitle: "Can't reach the park right now",
  lostDetail: 'Leaving costs nothing. Come back anytime.',
  retry: 'Try again',
} as const;

/** Plain words for a failed battle action. Server messages pass through; network noise does not. */
export function friendlyActionError(error: unknown, fallback = 'That didn’t go through. Try again.'): string {
  // A dropped write may still have landed, so this never promises nothing was spent.
  if (isLinkFailure(error)) return `${LINK_COPY.lostTitle}. Check your connection and try again.`;
  const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } } | null)?.response?.data;
  const text = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : null;
  return text && text.length <= 160 ? text : fallback;
}

export interface LinkClock {
  readonly now: () => number;
  readonly setTimeout: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly random?: () => number;
}

/**
 * One screen's link. `retry` reloads the screen's data; the controller calls
 * it with backoff while the link is down and the app is in the foreground.
 * `onChange` fires whenever the visible phase changes.
 */
export class MatchLinkController {
  private state: LinkState = INITIAL_LINK;
  private retryTimer: unknown = null;
  private phaseTimer: unknown = null;
  private active = true;
  private disposed = false;
  private shown: LinkPhase = 'live';

  constructor(
    private readonly retry: () => void,
    private readonly onChange: (phase: LinkPhase) => void,
    private readonly clock: LinkClock,
    private readonly windowMs = RECONNECT_WINDOW_MS,
  ) {}

  get phase(): LinkPhase { return linkPhase(this.state, this.clock.now(), this.windowMs); }
  get snapshot(): LinkState { return this.state; }

  ok(): void {
    if (this.disposed) return;
    this.state = linkOk(this.state, this.clock.now());
    this.clearRetry();
    this.clearPhaseTimer();
    this.publish();
  }

  /** Feed a failed request. Errors where the server answered keep the link up. */
  fail(error?: unknown): void {
    if (this.disposed) return;
    if (error !== undefined && !isLinkFailure(error)) { this.ok(); return; }
    this.state = linkFail(this.state, this.clock.now());
    this.publish();
    this.schedule();
  }

  /** The app went to the background (false) or came back (true). */
  setActive(active: boolean): void {
    if (this.disposed || active === this.active) return;
    this.active = active;
    if (!active) { this.clearRetry(); this.clearPhaseTimer(); return; }
    if (this.state.failingSince == null) return;
    this.state = linkResumed(this.state, this.clock.now());
    this.publish();
    this.retryNow();
  }

  /** "Try again": a fresh window and an immediate request. */
  retryNow(): void {
    if (this.disposed) return;
    this.clearRetry();
    if (this.state.failingSince != null && this.phase === 'lost') {
      this.state = { ...this.state, failingSince: this.clock.now(), failures: 0 };
      this.publish();
      this.armPhaseTimer();
    }
    this.retry();
  }

  reset(): void {
    this.clearRetry();
    this.clearPhaseTimer();
    this.state = INITIAL_LINK;
    this.publish();
  }

  /** Mounted again (React may unmount and remount the same component). */
  revive(): void { this.disposed = false; }

  dispose(): void {
    this.disposed = true;
    this.clearRetry();
    this.clearPhaseTimer();
  }

  private schedule(): void {
    this.clearRetry();
    this.armPhaseTimer();
    if (!this.active) return;
    this.retryTimer = this.clock.setTimeout(() => {
      this.retryTimer = null;
      if (!this.disposed && this.active) this.retry();
    }, retryDelayMs(this.state.failures, this.clock.random));
  }

  /** Flip "Reconnecting..." to the leave offer exactly when the window closes. */
  private armPhaseTimer(): void {
    this.clearPhaseTimer();
    if (!this.active || this.state.failingSince == null) return;
    const left = this.state.failingSince + this.windowMs - this.clock.now();
    if (left <= 0) return;
    this.phaseTimer = this.clock.setTimeout(() => { this.phaseTimer = null; this.publish(); }, left + 1);
  }

  private publish(): void {
    const next = this.phase;
    if (next === this.shown) return;
    this.shown = next;
    this.onChange(next);
  }

  private clearRetry(): void {
    if (this.retryTimer != null) this.clock.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer != null) this.clock.clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }
}
