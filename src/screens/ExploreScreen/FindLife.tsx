import { useEffect, useState, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { FIND_ROOT } from './parkMapLayout';

/**
 * A timed find's life on the map: true once its time is up. The find fades out
 * at that moment (never a "0:00" chip waiting for the next data refresh), and
 * `onExpire` asks for fresh map data so its slot frees up.
 */
export function useFindExpiry(activeTo: string | null | undefined, onExpire: () => void): boolean {
  const end = activeTo ? Date.parse(activeTo) : NaN;
  const [gone, setGone] = useState(() => Number.isFinite(end) && end <= Date.now());
  useEffect(() => {
    if (!Number.isFinite(end)) return;
    const left = end - Date.now();
    if (left <= 0) { setGone(true); onExpire(); return; }
    setGone(false);
    const timer = setTimeout(() => { setGone(true); onExpire(); }, Math.min(left, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [end]); // eslint-disable-line react-hooks/exhaustive-deps
  return gone;
}

/** The find's root box, fading out (280 ms) once it is gone. */
export function FindFade({ gone, children }: { readonly gone: boolean; readonly children: ReactNode }) {
  const opacity = useSharedValue(gone ? 0 : 1);
  useEffect(() => { opacity.value = withTiming(gone ? 0 : 1, { duration: 280 }); }, [gone, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents={gone ? 'none' : 'auto'} style={[FIND_ROOT, style]}>{children}</Animated.View>;
}

/**
 * The timer chip's "m:ss", rounded up: the last second reads 0:01 and the find
 * fades at zero, so a chip never shows 0:00 (react-countdown floors).
 */
export function findClock(totalMs: number): string {
  const seconds = Math.max(1, Math.ceil(totalMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
