/**
 * useAmbientLoop: run a decorative infinite loop only while the budget allows.
 *
 *   const bob = useSharedValue(0);
 *   useAmbientLoop(() => { bob.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true); },
 *                  () => { cancelAnimation(bob); bob.value = withTiming(0); });
 *
 * `start` runs when ambient motion is allowed (full power, foreground, not
 * idle, no Reduce Motion); `rest` runs when it is not, and on unmount. The
 * first touch wakes it again. Feedback animations (taps, rewards) should not
 * use this: they always run.
 */
import { useEffect, useRef } from 'react';
import { usePowerBudget } from './PowerProvider';

export default function useAmbientLoop(start: () => void, rest: () => void, active = true): boolean {
  const { ambient } = usePowerBudget();
  const run = ambient && active;
  const startRef = useRef(start); startRef.current = start;
  const restRef = useRef(rest); restRef.current = rest;
  useEffect(() => {
    if (!run) { restRef.current(); return undefined; }
    startRef.current();
    return () => restRef.current();
  }, [run]);
  return run;
}
