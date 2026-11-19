/**
 * Where every iOS sheet is drawn (fix pass w5, lane host, N01 and SAFETY-first-press). Pure, so it is tested without
 * a phone; ui/DoorModal.tsx is the caller.
 *
 * Read off the phase log in round w4 (ui/pressTrace.ts, release-like JS): the last presses the app lost were lost
 * inside UIKit's own dismissal of a native sheet. Between the native hide and onDismiss (0.3 to 1 s on a busy phone)
 * UIKit hands no touch to JS at all, so a kid's tap on the map PLAY! pill or the Rewards button right after a card
 * left did nothing (2 of 30 on each). No JS rule can keep a touch that never arrives.
 *
 * So on iOS a sheet is no longer a UIKit presentation. It is drawn in the app's own tree, inside react-native-screens'
 * FullWindowOverlay (a plain view the binary already has, laid over the whole window), with its enter and leave motion
 * on the UI thread. Nothing is presented or dismissed by UIKit, so there is no window in which a touch is ignored,
 * and the sheet keeps its React context because it is an ordinary child of whoever renders it.
 *
 * One kill switch puts iOS back on the native sheet: SHEET_HOST_DEFAULT below (an OTA flip), or the server switch
 * `sheet_host_native` when the feature-flags store already has it the first time a sheet opens. The choice is made
 * once per launch and never changes while the app runs, so two kinds of sheet are never mixed.
 */

export type SheetHostMode = 'overlay' | 'native';

/** The kill switch: 'overlay' (every iOS sheet in-tree) or 'native' (UIKit sheets, the round w4 door). */
export const SHEET_HOST_DEFAULT: SheetHostMode = 'overlay';

/** The server switch that puts iOS back on native sheets (read once, at the first sheet of a launch). */
export const SHEET_HOST_NATIVE_FLAG = 'sheet_host_native';

/** Pure: which host a launch uses. */
export function chooseSheetHost(input: {
  readonly os: string;
  readonly flags?: Readonly<Record<string, boolean>> | null;
  /** Lane tooling only (EXPO_PUBLIC_SHEET_HOST): 'native' or 'overlay'. */
  readonly laneOverride?: string | null;
  readonly fallback?: SheetHostMode;
}): SheetHostMode {
  if (input.os !== 'ios') return 'native';
  if (input.laneOverride === 'native' || input.laneOverride === 'overlay') return input.laneOverride;
  if (input.flags?.[SHEET_HOST_NATIVE_FLAG] === true) return 'native';
  return input.fallback ?? SHEET_HOST_DEFAULT;
}

/** Enter and leave of an in-tree sheet, by the caller's animationType (UI thread; Reduce Motion: a quick fade). */
export type SheetMotion = { readonly kind: 'none' | 'fade' | 'slide'; readonly inMs: number; readonly outMs: number };
export const SHEET_FADE_IN_MS = 220;
export const SHEET_FADE_OUT_MS = 160;
export const SHEET_REDUCED_MS = 120;
/** A slide out is a short ease in (exits are faster than entrances); the slide in is a settle spring. */
export const SHEET_SLIDE_OUT_MS = 200;

export function sheetMotion(animationType: string | undefined, reduced: boolean): SheetMotion {
  const kind = animationType === 'fade' || animationType === 'slide' ? animationType : 'none';
  if (kind === 'none') return { kind, inMs: 0, outMs: 0 };
  if (reduced) return { kind: 'fade', inMs: SHEET_REDUCED_MS, outMs: SHEET_REDUCED_MS };
  if (kind === 'fade') return { kind, inMs: SHEET_FADE_IN_MS, outMs: SHEET_FADE_OUT_MS };
  return { kind, inMs: 0, outMs: SHEET_SLIDE_OUT_MS };
}

/**
 * A leave whose end never comes back (the frame clock stalls while the Mac display sleeps, or a busy UI thread) still
 * ends: the sheet is taken out of the tree after this, drawn or not, and only then does a held tap reach what is under.
 */
export function sheetLeaveFallbackMs(motion: SheetMotion): number {
  return motion.outMs === 0 ? 0 : motion.outMs + 400;
}

/**
 * The in-tree sheet is drawn at the window's top left, but React Native measures it where its owner sits in the tree
 * (a sheet asked for from a card lower on the screen). Pressability compares the finger, in window points, with that
 * measure, so a finger that moved a little would cancel the press. The overlay node is shifted back by the owner's
 * own place: its children then measure in window points, the same as the touch. The shift moves only the empty
 * placeholder natively (the overlay's container is a window subview and keeps its own frame).
 */
export type OwnerPlace = {
  /** The owner's place in window points (React Native's measure: pageX, pageY of a zero-size anchor beside the sheet). */
  readonly pageX: number; readonly pageY: number;
  /** The anchor's place inside its parent (a parent's border): the overlay node is pulled back by it too. */
  readonly x: number; readonly y: number;
};
export type OverlayNodeStyle = { left: number; top: number; transform: ({ translateX: number } | { translateY: number })[] };

/** Pure: the overlay node's style so its container sits at the window's top left and its children measure in window points. */
export function overlayNodeStyle(owner: OwnerPlace | null): OverlayNodeStyle {
  if (!owner) return { left: 0, top: 0, transform: [] };
  const sx = owner.pageX - owner.x;
  const sy = owner.pageY - owner.y;
  return { left: -owner.x, top: -owner.y, transform: sx || sy ? [{ translateX: -sx }, { translateY: -sy }] : [] };
}

/** Pure: whether a new measure differs from the one in use (sub-point noise is ignored). */
export function ownerMoved(a: OwnerPlace | null, b: OwnerPlace): boolean {
  if (!a) return true;
  return Math.abs(a.pageX - b.pageX) > 0.5 || Math.abs(a.pageY - b.pageY) > 0.5 || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5;
}

let locked: SheetHostMode | null = null;
/** The launch's host, read once (the first sheet) and kept for the whole run. */
export function sheetHostMode(read: () => SheetHostMode): SheetHostMode {
  if (locked === null) locked = read();
  return locked;
}
/** Tests only. */
export function resetSheetHostForTests(): void { locked = null; }

/**
 * The in-tree sheets that are up, oldest first. The newest is on top (its overlay is the window's front subview) and
 * is the only one assistive tech reads; the screen root and every older sheet are hidden from it while it is up.
 */
export function createOverlayStack() {
  let up: number[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  return {
    add(id: number): void { if (!up.includes(id)) { up = [...up, id]; emit(); } },
    remove(id: number): void { if (up.includes(id)) { up = up.filter(i => i !== id); emit(); } },
    top: (): number | null => (up.length ? up[up.length - 1] : null),
    count: (): number => up.length,
    /** Whether a sheet other than `id` is up (a kept tap is then not replayed onto the screen under both). */
    others: (id: number): boolean => up.some(i => i !== id),
    subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** Tests only. */
    reset(): void { up = []; emit(); },
  };
}

export const overlayStack = createOverlayStack();
