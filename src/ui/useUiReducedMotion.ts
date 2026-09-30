/**
 * Reduced-motion preference for the UI kit, known on the first render.
 *
 * The shared useReducedGameMotion hook starts at `true` until
 * AccessibilityInfo answers, so anything that animates on mount (a dialog
 * opening, a button appearing) always took the reduced path. This hook seeds
 * from Reanimated's synchronous startup value, keeps a module-level cache, and
 * follows in-session changes, so a dialog that mounts already open still gets
 * its spring pop when Reduce Motion is off.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

let cached: boolean | undefined;
const listeners = new Set<(value: boolean) => void>();
let subscribed = false;

function subscribe() {
  if (subscribed) return;
  subscribed = true;
  const set = (value: boolean) => {
    cached = value;
    listeners.forEach(listener => listener(value));
  };
  void AccessibilityInfo.isReduceMotionEnabled().then(set).catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

export default function useUiReducedMotion(): boolean {
  const atStartup = useReducedMotion();
  const [reduced, setReduced] = useState(() => cached ?? atStartup);
  useEffect(() => {
    subscribe();
    listeners.add(setReduced);
    if (cached !== undefined) setReduced(cached);
    return () => { listeners.delete(setReduced); };
  }, []);
  return reduced;
}
