import { useCallback, useLayoutEffect, useRef } from 'react';
import { cancelAnimation, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

/**
 * A loop card is never seen half-drawn. expo-image puts even a cached picture on screen a frame or two after the
 * view mounts, so a card that mounts and shows at once (the dev gym, a chain card that was not mounted ahead) could
 * open on an empty panel and an icon-less pill. The card's own opacity waits for its key pictures to report that
 * they are on screen (`onDisplay`), with a UI-thread fallback so it can never stay hidden. A card mounted early and
 * hidden (the daily chain) has its pictures in long before it enters, so this costs it nothing.
 */
export const ART_GATE_MAX_MS = 160;

export function useArtGate(expected: number, maxMs: number = ART_GATE_MAX_MS) {
  const shown = useSharedValue(expected > 0 ? 0 : 1);
  const seen = useRef(0);
  useLayoutEffect(() => {
    if (expected > 0) shown.value = withDelay(maxMs, withTiming(1, { duration: 0 }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onDisplay = useCallback(() => {
    seen.current += 1;
    if (seen.current >= expected) { cancelAnimation(shown); shown.value = 1; }
  }, [expected, shown]);
  return { shown, onDisplay };
}
