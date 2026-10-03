/**
 * Dev-only auto-driver for the Share Studio evidence recordings
 * (EXPO_PUBLIC_SHARE_AUTODRIVE=level_up,flex_button,sheet_share ...). Each named
 * step presses its button once, a beat after it mounts, and logs SHARE_DRIVE.
 * Release builds constant-fold DRIVE to '' so nothing here ever runs for players.
 */
import { useEffect, useRef } from 'react';

const DRIVE: readonly string[] = __DEV__ ? (process.env.EXPO_PUBLIC_SHARE_AUTODRIVE ?? '').split(',').filter(Boolean) : [];

/** `step` may list alternatives, e.g. ['sheet_share', 'sheet_share@park_day']. */
export function useDevAutoPress(step: string | readonly string[], press: () => void, delayMs = 1600): void {
  const steps = typeof step === 'string' ? [step] : step;
  const hit = steps.find(name => DRIVE.includes(name));
  const fn = useRef(press);
  fn.current = press;
  useEffect(() => {
    if (!hit) return;
    const t = setTimeout(() => { console.log(`SHARE_DRIVE ${hit}`); fn.current(); }, delayMs);
    return () => clearTimeout(t);
  }, [hit, delayMs]);
}

/** Marks a dev-only stub (a fake spend). Auto-press hooks bound to spends fire only for marked stubs. */
export const DEV_STUB = '__shareDevStub';

export function markDevStub<T extends object>(fn: T): T {
  if (__DEV__) Object.defineProperty(fn, DEV_STUB, { value: true });
  return fn;
}

export function isDevStub(fn: unknown): boolean {
  return __DEV__ && !!fn && typeof fn === 'function' && (fn as unknown as Record<string, unknown>)[DEV_STUB] === true;
}
