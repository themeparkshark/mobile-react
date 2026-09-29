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
