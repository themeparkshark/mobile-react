import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Stay still until the native preference is known; respect changes in-session.
 * Starts from the app-wide cached answer once iOS has given one, so a screen that mounts after start-up knows
 * on its first render: its entering animations play (an `entering` read as "reduced" on the mount render is
 * skipped for good) and its count-ups never show the final number, drop to 0, then count up again.
 */
export default function useReducedGameMotion() {
  const [reduced, setReduced] = useState(() => lastKnown ?? true);
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
 * The last Reduce Motion answer the OS gave this app run (null until the first
 * answer). Read once at start-up and kept current, so a moment that mounts later
 * knows the preference on its first frame instead of waiting a few ms for iOS
 * (a shelf landing or park arrival that waited showed a dead, half-drawn frame).
 */
let lastKnown: boolean | null = null;
try {
  void AccessibilityInfo.isReduceMotionEnabled().then(value => { lastKnown = value; }).catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', value => { lastKnown = value; });
} catch { /* tests and non-native hosts */ }

/** The cached preference (null before the OS first answered). */
export function knownReduceMotion(): boolean | null {
  return lastKnown;
}

/**
 * The Reduce Motion preference as three states: null until the OS answers,
 * then true or false. For animations that must not record a "still" state
 * before the answer is known (the XP potion's level up). Starts from the
 * app-wide cached answer, so after start-up it is known on the first render.
 */
export function useReduceMotionPreference(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(lastKnown);
  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      lastKnown = value;
      if (mounted && !preferenceChanged) setReduced(value);
    }).catch(() => { if (mounted && !preferenceChanged) setReduced(current => current ?? false); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true;
      lastKnown = value;
      if (mounted) setReduced(value);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}
