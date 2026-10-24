/**
 * A failed map refresh heals itself: after each failure in a row the map waits a little
 * longer (5 s, then 15 s, then 30 s) and tries again. A retry that comes due while the map
 * is off screen or the app is in the background is kept owed and runs when the map comes
 * back. After the last quick retry fails, `onGiveUp` fires once so the map can show a
 * tap-to-try-again cue; any success resets everything.
 *
 * Pure (timers are passed in), so it is unit tested without React.
 */
export interface MapAutoRetry {
  /** A load failed. Arms the next quick retry, or gives up after the last one. */
  onFailure(): void;
  /** A load worked: forget past failures and any owed retry. */
  onSuccess(): void;
  /** The map is back on screen: true when a retry came due while away (the caller runs it). */
  consumeOwed(): boolean;
  /** Failures in a row so far. */
  failures(): number;
  dispose(): void;
}

export function createMapAutoRetry({ delays, canRun, run, onGiveUp, setTimer = setTimeout, clearTimer = clearTimeout }: {
  readonly delays: readonly number[];
  readonly canRun: () => boolean;
  readonly run: () => void;
  readonly onGiveUp?: () => void;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: any) => void;
}): MapAutoRetry {
  let fails = 0;
  let owed = false;
  let timer: unknown = null;
  const clear = () => {
    if (timer != null) clearTimer(timer);
    timer = null;
  };
  return {
    onFailure() {
      fails += 1;
      clear();
      const wait = delays[fails - 1];
      if (wait == null) {
        // Only the first failure past the last quick retry gives up (no repeat cues).
        if (fails === delays.length + 1) onGiveUp?.();
        return;
      }
      timer = setTimer(() => {
        timer = null;
        if (canRun()) run();
        else owed = true;
      }, wait);
    },
    onSuccess() {
      fails = 0;
      owed = false;
      clear();
    },
    consumeOwed() {
      const was = owed;
      owed = false;
      return was;
    },
    failures: () => fails,
    dispose: clear,
  };
}
