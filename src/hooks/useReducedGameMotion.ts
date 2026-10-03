import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Stay still until the native preference is known; respect changes in-session. */
export default function useReducedGameMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !preferenceChanged) setReduced(value);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true;
      if (mounted) setReduced(value);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
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
