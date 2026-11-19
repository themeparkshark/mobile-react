/**
 * useResultInputLock: one input lock for every result, try and win card (T046, hold-2; rules in
 * mashGuard.ts). `active` starts the lock (the card is really up); `armed` turns true once the card
 * has been up long enough and the taps have stopped. `lockedTap` is what a tap does while locked
 * (it restarts the quiet wait), and `dimStyle` fades the buttons from dimmed to full on the UI thread
 * when they wake, so a waiting press never looks like a dead button.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION } from '../../ui/motion';
import { RESULT_INPUT_LOCK_MS, RESULT_QUIET_MS, nextMashUnlock } from './mashGuard';

/** Locked buttons show at this opacity (readable, clearly not ready yet). */
export const LOCKED_BUTTON_OPACITY = 0.55;

/** `resetKey`: a new value locks again (a card that swaps its panel, like the win card's team step). */
export default function useResultInputLock(active: boolean, firstMs: number = RESULT_INPUT_LOCK_MS, quietMs: number = RESULT_QUIET_MS,
  resetKey: string | number = 0) {
  const [armed, setArmed] = useState(false);
  const unlockAt = useRef(Number.POSITIVE_INFINITY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glow = useSharedValue(LOCKED_BUTTON_OPACITY);
  const schedule = useCallback((delay: number) => {
    unlockAt.current = Date.now() + delay;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(true), delay);
  }, []);
  useEffect(() => {
    setArmed(false);
    if (!active) { unlockAt.current = Number.POSITIVE_INFINITY; return undefined; }
    schedule(firstMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [active, firstMs, schedule, resetKey]);
  useEffect(() => {
    // Locking is instant; waking fades up (a small state change).
    if (armed) glow.value = withTiming(1, { duration: DURATION.quick });
    else glow.value = LOCKED_BUTTON_OPACITY;
  }, [armed, glow]);
  const lockedTap = useCallback(() => {
    const now = Date.now();
    if (!Number.isFinite(unlockAt.current)) return;
    const next = nextMashUnlock(unlockAt.current, now, quietMs);
    if (next !== unlockAt.current) { setArmed(false); schedule(next - now); }
  }, [quietMs, schedule]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  return { armed, lockedTap, dimStyle };
}
