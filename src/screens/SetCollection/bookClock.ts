/**
 * One clock for all the idle life on the Collections page, instead of one endless animation per element.
 *  - beat: the "prize ready" pulse that the shelf gift and the prize medal share (two bobs, then a 2 s rest,
 *    so they move in step and the page can sit still between pulses).
 *  - sheen: 0..1 every 6 s; each rare sticker reads it with its own phase offset for its sweep.
 * Both run only while the page is what the player sees, and never with Reduce Motion.
 */
import { useEffect } from 'react';
import { cancelAnimation, Easing, makeMutable, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

export const BEAT = makeMutable(0);
export const SHEEN = makeMutable(0);
export const SHEEN_PERIOD_MS = 6000;

/**
 * Runs each clock only while something on screen reads it: the beat while a prize is ready, the sheen while
 * the open set shows a rare find. Both stop (zero frames) when the page is covered or Reduce Motion is on.
 */
export function useBookClocks(beatOn: boolean, sheenOn: boolean, reduced: boolean): void {
  useEffect(() => {
    if (!beatOn || reduced) { cancelAnimation(BEAT); BEAT.value = 0; return undefined; }
    BEAT.value = 0;
    BEAT.value = withRepeat(withSequence(
      withTiming(1, { duration: 350 }), withTiming(0, { duration: 350 }),
      withTiming(1, { duration: 350 }), withTiming(0, { duration: 350 }),
      withDelay(2000, withTiming(0, { duration: 0 })),
    ), -1, false);
    return () => cancelAnimation(BEAT);
  }, [beatOn, reduced]);
  useEffect(() => {
    if (!sheenOn || reduced) { cancelAnimation(SHEEN); return undefined; }
    SHEEN.value = 0;
    SHEEN.value = withRepeat(withTiming(1, { duration: SHEEN_PERIOD_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(SHEEN);
  }, [sheenOn, reduced]);
}

/** Where a sweep sits (-1 before, 1 after) for a sticker at `phase` (0..1): it crosses during a 15% window of the period. */
export function sweepAt(clock: number, phase: number, twice: boolean): number {
  'worklet';
  const t = ((clock * (twice ? 2 : 1)) + phase) % 1;
  const window = 0.15;
  if (t > window) return 1;
  return -1 + (t / window) * 2;
}
