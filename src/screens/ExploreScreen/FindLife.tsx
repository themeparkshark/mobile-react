import { useEffect, useState, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { soakLog, SOAK_TRACE } from '../../components/map/declutter/soakLog';
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
    const timer = setTimeout(() => { if (SOAK_TRACE) soakLog(`find expired ${activeTo}`); setGone(true); onExpire(); }, Math.min(left, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [end]); // eslint-disable-line react-hooks/exhaustive-deps
  return gone;
}

/** The find's root box, fading out (280 ms) once it is gone. */
export function FindFade({ gone, children }: { readonly gone: boolean; readonly children: ReactNode }) {
  const opacity = useSharedValue(gone ? 0 : 1);
  useEffect(() => {
    if (SOAK_TRACE) soakLog(`find fade ${gone ? 'out' : 'in'}`);
    opacity.value = withTiming(gone ? 0 : 1, { duration: 280 });
  }, [gone, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents={gone ? 'none' : 'auto'} style={[FIND_ROOT, style]}>{children}</Animated.View>;
}

/**
 * The timer chip in calm whole minutes, rounded up ("4 min", the last minute reads "1 min"), never a
 * ticking m:ss where a kid plays (core loop 4.3 rule 7). The find fades at zero, so a chip never
 * reads 0. An hour or more reads in hours.
 */
export function findClock(totalMs: number): string {
  const seconds = Math.max(1, Math.ceil(totalMs / 1000));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
}
