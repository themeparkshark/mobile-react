import { useEffect, useState } from 'react';
import { Easing, makeMutable, withTiming } from 'react-native-reanimated';

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

export function dimCatchChrome(on: boolean): void {
  if (dimmed === on) return;
  dimmed = on;
  catchDim.value = withTiming(on ? 1 : 0, { duration: on ? 160 : 200, easing: Easing.out(Easing.cubic) });
}

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
