import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import useUiReducedMotion from '../ui/useUiReducedMotion';

/**
 * The Reduce Motion preference, known on the first render (T184). It used to start at true until
 * AccessibilityInfo answered, so every mount entrance (cards, chips, rewards) took the still path for
 * everyone. It now shares the UI kit's answer: seeded from Reanimated's synchronous startup value,
 * cached for the session, and following in-session changes.
 */
export default function useReducedGameMotion(): boolean {
  return useUiReducedMotion();
}

/**
 * The Reduce Motion preference as three states: null until the OS answers,
 * then true or false. For animations that must not record a "still" state
 * before the answer is known (the XP potion's level up).
 */
export function useReduceMotionPreference(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !preferenceChanged) setReduced(value);
    }).catch(() => { if (mounted && !preferenceChanged) setReduced(false); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true;
      if (mounted) setReduced(value);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}
