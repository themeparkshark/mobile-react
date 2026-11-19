/**
 * A PLAY! press while the last coin card is still leaving waits for it, then opens the card (safety panel finding 2,
 * fix round w3: "a PLAY! press right after the coin card closes is sometimes dropped", 4 of 30).
 *
 * Read on the lane's simulator (dev log of the door's phases): a kid's press landed while the card's sheet was still
 * on its way out. PLAY! heard it (the press on the leaving sheet is claimed, ui/modalLayers.ts leavingSheetTap) and
 * asked the card to open again, but the sheet was mid exit: react-native-modal finished hiding it and the open was
 * lost, so the kid had to press a second time. Now the press is felt at once (squash and buzz), waits while any sheet
 * is leaving, and opens the card the moment the screen is clear (never longer than PRESS_WAIT_MAX_MS).
 * No React here: tested in tools/tests/fix-w3-guide.test.cjs.
 */

/** Longest a press waits for a leaving sheet (UIKit takes one down well inside this; a leaked layer never blocks). */
export const PRESS_WAIT_MAX_MS = 1600;

export interface LeavingLayers {
  leavingCount(): number;
  subscribe(listener: () => void): () => void;
}

export interface PressQueue {
  /** The press: `open` runs now, or once no sheet is leaving. A second press while one waits is the same press. */
  press(open: () => void): 'now' | 'queued' | 'already';
  /** The screen went away: forget a waiting press. */
  cancel(): void;
  waiting(): boolean;
}

export function createPressQueue(layers: LeavingLayers,
  timers: { setTimeout: (run: () => void, ms: number) => unknown; clearTimeout: (id: unknown) => void } =
  { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>) }): PressQueue {
  let pending: { open: () => void; unsubscribe: () => void; timer: unknown } | null = null;
  const finish = () => {
    const p = pending;
    if (!p) return;
    pending = null;
    p.unsubscribe();
    timers.clearTimeout(p.timer);
    p.open();
  };
  return {
    press(open) {
      if (pending) { pending.open = open; return 'already'; }
      if (layers.leavingCount() === 0) { open(); return 'now'; }
      const unsubscribe = layers.subscribe(() => { if (layers.leavingCount() === 0) finish(); });
      pending = { open, unsubscribe, timer: timers.setTimeout(finish, PRESS_WAIT_MAX_MS) };
      return 'queued';
    },
    cancel() {
      if (!pending) return;
      pending.unsubscribe();
      timers.clearTimeout(pending.timer);
      pending = null;
    },
    waiting: () => pending !== null,
  };
}
