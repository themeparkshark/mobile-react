/**
 * One native sheet at a time, for the whole app (core loop fix round, November 2026). Pure, so it is tested
 * without a phone; ui/DoorModal.tsx is the only caller.
 *
 * The family of bugs: iOS presents a React Native <Modal> from the screen's view controller. A second sibling asked
 * for while one is up, or while one is still going away, is refused by UIKit. React Native still believes it is up
 * (_isPresented = YES, no retry, no event), and the refused host stays in the view tree at full screen size, taking
 * every touch. That one state was the PLAY RIDE freeze, the map soft-lock and the LinePlay freeze: read off a frozen
 * LinePlay with lldb, the End dialog's host had _isPresented 1, presentingViewController nil, frame 402 x 874.
 *
 * So a top-level sheet asks this door first and holds the slot from the moment it presents until UIKit says it is
 * gone. Whoever asks next waits their turn, and UIKit never gets the chance to refuse.
 */
export interface ModalDoor {
  /** Ask for the slot; `grant` runs (at once, or when the slot frees) unless the ask is cancelled first. */
  request(id: number, grant: () => void): void;
  /** Stop waiting (the sheet no longer wants to show). */
  cancel(id: number): void;
  /** The sheet is really gone: the next in line presents. */
  release(id: number): void;
  /** The sheet's host was torn out of the tree, and UIKit finishes taking it down a moment later. */
  releaseAfter(id: number, ms: number): void;
  /** A sheet that came up late with the slot free takes it, so the next one still waits for it. */
  occupy(id: number): void;
  holder(): number | null;
  waiting(): number;
}

export function createModalDoor(timers: { setTimeout: (run: () => void, ms: number) => unknown } = { setTimeout: (run, ms) => setTimeout(run, ms) }): ModalDoor {
  let holder: number | null = null;
  let queue: { id: number; grant: () => void }[] = [];
  const next = () => {
    if (holder !== null) return;
    const up = queue.shift();
    if (!up) return;
    holder = up.id;
    up.grant();
  };
  const door: ModalDoor = {
    request(id, grant) {
      if (holder === id) { grant(); return; }
      queue = [...queue.filter(q => q.id !== id), { id, grant }];
      next();
    },
    cancel(id) { queue = queue.filter(q => q.id !== id); },
    release(id) {
      queue = queue.filter(q => q.id !== id);
      if (holder !== id) return;
      holder = null;
      next();
    },
    releaseAfter(id, ms) {
      queue = queue.filter(q => q.id !== id);
      if (holder !== id) return;
      timers.setTimeout(() => door.release(id), ms);
    },
    occupy(id) { if (holder === null) holder = id; },
    holder: () => holder,
    waiting: () => queue.length,
  };
  return door;
}

/** How long UIKit gets to say a presented sheet is on screen before it is presented again. */
export const DOOR_PRESENT_MS = 1500;
/** Fresh presentations at most; after that the sheet is let go and the door moves on. */
export const DOOR_PRESENT_TRIES = 2;
/** A sheet asked to go that never reports it: free the slot after this (UIKit sends no event for one it refused). */
export const DOOR_DISMISS_MS = 500;
export const DOOR_DISMISS_ANIMATED_MS = 900;
/** A host torn out of the tree: how long UIKit may still be taking it down. */
export const DOOR_TORN_MS = 80;
export const DOOR_TORN_ANIMATED_MS = 380;

export type DoorPhase = 'off' | 'queued' | 'presenting' | 'up' | 'closing' | 'lost';

/** Whether the native host is told to be presented in this phase. A closing host is not; a queued one not yet. */
export function doorNativeVisible(phase: DoorPhase): boolean {
  return phase === 'presenting' || phase === 'up' || phase === 'lost';
}

/** What a presenting sheet does when its wait for UIKit runs out. */
export function doorPresentTimedOut(tries: number, wants: boolean): 'present_again' | 'let_go' | 'gone' {
  if (!wants) return 'gone';
  return tries < DOOR_PRESENT_TRIES ? 'present_again' : 'let_go';
}

/** The app's one door. */
export const modalDoor = createModalDoor();
