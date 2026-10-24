import { useEffect, useState } from 'react';
import { Easing, makeMutable, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { CHROME_BACK, chromeBack } from '../../components/map/alive/mapWow';

export { CHROME_BACK, chromeBack };

/**
 * Whether a catch moment owns the screen. Two layers:
 * - `catchShown` (a shared value) slides the header and tab bar on the UI thread from the tap frame.
 *   Nothing re-renders for it.
 * - `setCatchOpen` (React state) is flipped only once the viewfinder covers the map, and back only once
 *   the iris has closed, so its commit never lands inside the open spring or the print flight.
 */
let open = false;
const listeners = new Set<(value: boolean) => void>();

export const catchShown = makeMutable(0);
let shown = false;

export function isCatchShown(): boolean {
  return shown;
}

export function showCatchChrome(on: boolean): void {
  if (shown === on) return;
  shown = on;
  catchShown.value = withTiming(on ? 1 : 0, { duration: on ? 220 : 180, easing: Easing.out(Easing.cubic) });
}

/**
 * A common catch (the tap-to-catch on the map) never moves the header or the tab bar (Dustin's rule):
 * the counter stays where the coins land. `catchDim` softens the tab bar and fades the map's own
 * controls instead, on the UI thread from the tap frame.
 */
export const catchDim = makeMutable(0);
let dimmed = false;
const CHROME_BACK_MS = CHROME_BACK.stepMs * (CHROME_BACK.slots - 1) + CHROME_BACK.popMs;

/**
 * Round 4: the map's controls come back one after another (STAGGER), each springing up from 0.85 with one
 * small overshoot, instead of all snapping back on one frame. `catchDimBack` is 1 while they return;
 * catchDim runs linearly from 1 to 0 over CHROME_BACK.ms so every control reads its own window from it.
 */
export const catchDimBack = makeMutable(0);
export function dimCatchChrome(on: boolean, reduced = false): void {
  if (dimmed === on) return;
  dimmed = on;
  if (on || reduced) {
    catchDimBack.value = 0;
    catchDim.value = withTiming(on ? 1 : 0, { duration: on ? 160 : 200, easing: Easing.out(Easing.cubic) });
    return;
  }
  catchDimBack.value = 1;
  catchDim.value = withTiming(0, { duration: CHROME_BACK_MS, easing: Easing.linear }, done => { if (done) catchDimBack.value = 0; });
}

/** Round 4: the map layer's kick on a burst (pt), written by the catch clock on the UI thread. */
export const catchKickX = makeMutable(0);
export const catchKickY = makeMutable(0);

export function isCatchDimmed(): boolean {
  return dimmed;
}

export function setCatchOpen(value: boolean): void {
  if (open === value) return;
  open = value;
  listeners.forEach(listener => listener(value));
}

export function isCatchOpen(): boolean {
  return open;
}

export function useCatchOpen(): boolean {
  const [value, setValue] = useState(open);
  useEffect(() => {
    setValue(open);
    listeners.add(setValue);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}

/**
 * Round 3: the find squishes under the finger on the tap's own frame (the map marker itself, before any
 * React state for the catch commits), then springs back while the catch layer takes over. One shared value
 * for the whole map: only the tapped find reads a non-zero squash.
 */
export const tapPivot = makeMutable(-1);
export const tapSquash = makeMutable(0);

export function squashFind(pivotId: number | null | undefined): void {
  if (pivotId == null) return;
  tapPivot.value = pivotId;
  tapSquash.value = withSequence(withTiming(1, { duration: 90, easing: Easing.out(Easing.cubic) }), withSpring(0, { damping: 11, stiffness: 300 }));
}

/** The pin the catch layer has taken over (hidden on the UI thread from the layer's first moving frame). */
export const catchHidePivot = makeMutable(-1);
