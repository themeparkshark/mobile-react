import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { leavesSoon, msUntilStayWordsChange } from '../../helpers/calmTime';
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
 * True in a timed find's last ten minutes (T006: no clocks on the map). Before that the find shows
 * no chip at all; then one calm "Leaves soon" chip. It wakes only at that line, never every minute.
 */
export function useLeavesSoon(activeTo: string | number | null | undefined, live = true): boolean {
  const end = typeof activeTo === 'number' ? activeTo : activeTo ? Date.parse(activeTo) : NaN;
  const [soon, setSoon] = useState(() => Number.isFinite(end) && leavesSoon(end - Date.now()));
  useEffect(() => {
    if (!Number.isFinite(end)) { setSoon(false); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const left = end - Date.now();
      setSoon(leavesSoon(left));
      const wait = msUntilStayWordsChange(left);
      if (live && wait > 0) timer = setTimeout(check, Math.min(wait, 2 ** 31 - 1));
    };
    check();
    return () => clearTimeout(timer);
  }, [end, live]);
  return soon;
}

const SOON_TONES = {
  gold: { box: { backgroundColor: '#FFF8E7', borderColor: '#FFD700', shadowColor: '#FFD700' }, text: '#B8860B' },
  blue: { box: { backgroundColor: '#E8F4FD', borderColor: '#4FC3F7', shadowColor: '#4FC3F7' }, text: '#0288D1' },
} as const;

/** The one chip a timed find wears, only in its last ten minutes: "Leaves soon" in words, never minutes. */
export function FindSoonChip({ activeTo, tone }: { readonly activeTo: string | null | undefined; readonly tone: keyof typeof SOON_TONES }) {
  const soon = useLeavesSoon(activeTo);
  if (!soon) return null;
  const look = SOON_TONES[tone];
  return <View accessible accessibilityLabel="Leaves soon" style={[chip.box, look.box]}>
    <Text style={[chip.text, { color: look.text }]} numberOfLines={1} maxFontSizeMultiplier={1.1}>Leaves soon</Text>
  </View>;
}

const chip = StyleSheet.create({
  box: { borderRadius: 12, paddingHorizontal: 6, paddingVertical: 5, borderWidth: 2, alignSelf: 'center',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  text: { fontFamily: 'Shark', fontSize: 13, textAlign: 'center' },
});
