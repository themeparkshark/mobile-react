/**
 * What the XP potion should play when its level or progress changes. Pure, so
 * the level-up path is tested without a renderer (tools/tests/profile-v2).
 *
 * `reduced` is the Reduce Motion preference: null until the OS answers. While
 * it is unknown the potion waits and keeps the previous state, so a level up
 * that happened while the player was elsewhere still plays once the answer
 * arrives (the round 1 bug: the hook started as "reduced", snapped the vial
 * and recorded the new level, so the level up never played).
 */
export type PotionState = { readonly level: number; readonly progress: number };

export type PotionTransition =
  | 'wait' // preference unknown: change nothing, remember nothing
  | 'levelUp' // brim, burst, drain, refill (or a still level up under Reduce Motion)
  | 'gain' // rise with a slosh and fizz, count the XP up
  | 'pour' // first time this player's potion is seen: pour in from empty
  | 'settle' // nothing to celebrate: ease to the value
  | 'defer'; // a level-up celebration is playing: keep it, ease to the new value when it ends

export function potionTransition(
  prev: PotionState | null, next: PotionState, reduced: boolean | null, celebrating = false,
): PotionTransition {
  if (reduced === null) return 'wait';
  // A refetch during the 520 ms build-up (pull to refresh, focus) must never cancel the burst.
  if (celebrating) return 'defer';
  if (prev && next.level > prev.level) return 'levelUp';
  if (!prev) return 'pour';
  if (next.level === prev.level && next.progress > prev.progress + 0.001) return 'gain';
  return 'settle';
}

/** Timings of the level-up celebration (ms from its start). */
export const BURST_AT_MS = 520;
export const REFILL_AT_MS = 1400;

export interface PotionDriverHooks {
  /** A transition starts playing (not called for 'wait' or 'defer'). */
  readonly play: (kind: PotionTransition, next: PotionState) => void;
  /** The burst moment of a level up (sound, haptic, ribbon). */
  readonly burst: () => void;
  /** The celebration is over: ease to the latest value. */
  readonly refill: (latest: PotionState) => void;
  readonly setTimer: (fn: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
}

/**
 * Drives the potion over time, so the level-up rules are tested without a
 * renderer (tools/tests/profile-v2 runs it with a fake clock):
 * - A refetch during a celebration never cancels it ('defer'), and the refill
 *   eases to the latest value.
 * - A second level up that lands during a celebration is queued, not dropped:
 *   it plays its own burst right after the first refill.
 * - Timers are cleared only by dispose (unmount).
 */
export function createPotionDriver(initial: PotionState | null, hooks: PotionDriverHooks) {
  let last = initial;
  let celebrating = false;
  let queuedLevelUp = false;
  let latest: PotionState | null = initial;
  const timers: unknown[] = [];

  const celebrate = (next: PotionState) => {
    celebrating = true;
    hooks.play('levelUp', next);
    timers.push(hooks.setTimer(hooks.burst, BURST_AT_MS));
    timers.push(hooks.setTimer(() => {
      celebrating = false;
      if (queuedLevelUp && latest) {
        queuedLevelUp = false;
        celebrate(latest);
        return;
      }
      if (latest) hooks.refill(latest);
    }, REFILL_AT_MS));
  };

  return {
    update(next: PotionState, reduced: boolean | null): PotionTransition {
      const prev = last;
      const kind = potionTransition(prev, next, reduced, celebrating);
      if (kind === 'wait') return kind;
      last = next;
      latest = next;
      if (kind === 'defer') {
        if (prev && next.level > prev.level) queuedLevelUp = true;
        return kind;
      }
      if (kind === 'levelUp' && !reduced) {
        celebrate(next);
        return kind;
      }
      hooks.play(kind, next);
      if (kind === 'levelUp') hooks.burst(); // Reduce Motion: no build-up, burst at once
      return kind;
    },
    dispose() {
      timers.forEach(hooks.clearTimer);
      timers.length = 0;
    },
  };
}

/** 1234567 -> "1,234,567" on the UI thread. */
export function groupDigits(n: number): string {
  'worklet';
  const s = String(Math.max(0, Math.round(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}

/**
 * The XP bar's level-up gate, pure so it is tested with plain calls (tools/tests/juice-xp-social).
 * The burst plays on the UI thread when the fill reaches the brim; this decides when the refill starts:
 * - the moment the drain animation finishes (no empty-bar gap), with the latest data;
 * - or, if the drain finished before, when the driver's refill time arrives;
 * - or, if the drain never reports (its animation was replaced), from a fallback a little later.
 * Each refill happens once per celebration; anything from an older celebration (or after unmount) is ignored.
 */
export function createCelebrationGate() {
  let token = 0;
  let drained = false;
  let refilled = true;
  let pending: PotionState | null = null;
  return {
    start(): number {
      token += 1;
      drained = false;
      refilled = false;
      pending = null;
      return token;
    },
    get token() { return token; },
    get celebrating() { return token > 0 && !refilled; },
    /** The drain animation finished: refill now with the latest data. */
    drained(t: number, latest: PotionState): PotionState | null {
      if (t !== token || refilled) return null;
      drained = true;
      refilled = true;
      return latest;
    },
    /** The driver's refill time: refill if the drain is done, else wait for it. */
    due(latest: PotionState): PotionState | null {
      if (refilled) return null;
      if (drained) { refilled = true; return latest; }
      pending = latest;
      return null;
    },
    /** Safety net when the drain never reports. */
    fallback(t: number): PotionState | null {
      if (t !== token || refilled || !pending) return null;
      refilled = true;
      return pending;
    },
    /** Unmounted: ignore everything still in flight. */
    cancel() { token = -1; refilled = true; },
  };
}

/**
 * Whether the bar should take a new value now. While hidden (paused) it holds every change, so a level up
 * earned elsewhere plays when the bar is seen again; on return with nothing new it does nothing (a running
 * count is never snapped).
 */
export function shouldPlay(paused: boolean, last: PotionState | null, next: PotionState): boolean {
  if (paused) return false;
  if (!last) return true;
  return last.level !== next.level || Math.abs(last.progress - next.progress) > 0.0001;
}
