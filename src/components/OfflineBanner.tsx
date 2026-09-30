import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import Svg, { Line, Rect } from 'react-native-svg';
import client from '../api/client';
import * as Haptics from '../helpers/haptics';
import { isOffline, onConnectivityChange } from '../services/connectivity';

// Brand tokens (mirrors the WS0 kit values until src/ui/tokens lands).
const CREAM = '#fff8e4';
const NAVY = '#05346e';
const BLUE = '#0768b9';
const GOLD = '#ffcf3b';
const GOLD_LIP = '#d99a00';

export const OFFLINE_SHOW_DELAY_MS = 1200;
export const OFFLINE_PROBE_INTERVAL_MS = 15000;
const BACK_ONLINE_HOLD_MS = 1400;

type Phase = 'hidden' | 'offline' | 'back';

/** Signal bars with a slash: flat, thick navy outline, gold first bar. */
export function OfflineSignalIcon({ size = 28 }: { readonly size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={3} y={16} width={5} height={8} rx={2} fill={GOLD} stroke={NAVY} strokeWidth={2.4} />
      <Rect x={11.5} y={10} width={5} height={14} rx={2} fill="#ffffff" stroke={NAVY} strokeWidth={2.4} />
      <Rect x={20} y={4} width={5} height={20} rx={2} fill="#ffffff" stroke={NAVY} strokeWidth={2.4} />
      <Line x1={3} y1={4.5} x2={25} y2={25} stroke={CREAM} strokeWidth={6} strokeLinecap="round" />
      <Line x1={3} y1={4.5} x2={25} y2={25} stroke={NAVY} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

function probe(): Promise<unknown> {
  // Any HTTP response marks the app reachable (client.ts interceptor).
  return client.get('/crumbs', { timeout: 6000, tpsNoRetry: true } as never).catch(() => undefined);
}

/**
 * One branded offline surface for the whole app. Appears after a short
 * debounce when API calls fail without a response, probes quietly every 15s,
 * and says "Back online" before sliding away.
 */
export default function OfflineBanner() {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('hidden');
  const [probing, setProbing] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>('hidden');
  phaseRef.current = phase;

  const enter = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    const apply = (offline: boolean) => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (offline) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        showTimer.current = setTimeout(() => setPhase('offline'), OFFLINE_SHOW_DELAY_MS);
      } else if (phaseRef.current === 'offline') {
        setPhase('back');
        Haptics.notificationAsync('success');
        hideTimer.current = setTimeout(() => setPhase('hidden'), BACK_ONLINE_HOLD_MS);
      }
    };
    if (isOffline()) apply(true);
    const unsubscribe = onConnectivityChange(apply);
    return () => {
      unsubscribe();
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const visible = phase !== 'hidden';
    if (visible) {
      setMounted(true);
      enter.value = reduceMotion
        ? withTiming(1, { duration: 180 })
        : withSpring(1, { damping: 15, stiffness: 180, mass: 0.8 });
      return;
    }
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(setMounted)(false);
    };
    enter.value = withTiming(0, { duration: reduceMotion ? 180 : 220, easing: Easing.in(Easing.quad) }, done);
  }, [enter, phase, reduceMotion]);

  useEffect(() => {
    if (probing && !reduceMotion) {
      pulse.value = withRepeat(withSequence(withTiming(0.45, { duration: 420 }), withTiming(1, { duration: 420 })), -1);
    } else {
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [probing, pulse, reduceMotion]);

  const runProbe = useCallback(() => {
    setProbing(true);
    probe().finally(() => setProbing(false));
  }, []);

  useEffect(() => {
    if (phase !== 'offline') return undefined;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') runProbe();
    }, OFFLINE_PROBE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase, runProbe]);

  const onRetry = useCallback(() => {
    Haptics.impactAsync('light');
    runProbe();
  }, [runProbe]);

  const cardStyle = useAnimatedStyle(() => {
    const progress = enter.value;
    return {
      opacity: Math.min(1, progress * 1.4),
      transform: reduceMotion
        ? []
        : [{ translateY: (1 - progress) * -90 }, { scale: 0.92 + 0.08 * progress }],
    };
  });
  const iconStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!mounted) return null;
  const back = phase === 'back';
  const top = (initialWindowMetrics?.insets.top ?? 47) + 6;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top }]}>
      <Animated.View
        style={[styles.lip, cardStyle]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        accessibilityLabel={back ? 'Back online' : 'You are offline. Showing your saved park.'}
      >
        <View style={[styles.card, back && styles.cardBack]}>
          <Animated.View style={iconStyle}>
            {back ? <BackOnlineIcon /> : <OfflineSignalIcon />}
          </Animated.View>
          <View style={styles.copy}>
            <Text style={styles.title} maxFontSizeMultiplier={1.3}>{back ? 'BACK ONLINE' : 'OFFLINE'}</Text>
            <Text style={styles.body} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {back ? 'Your park is live again' : 'Showing your saved park'}
            </Text>
          </View>
          {!back && (
            <Pressable
              onPress={onRetry}
              disabled={probing}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Try to reconnect"
              style={({ pressed }) => [styles.retryLip, pressed && styles.retryPressed, probing && styles.retryBusy]}
            >
              <View style={styles.retry}>
                <Text style={styles.retryText} maxFontSizeMultiplier={1.2}>RETRY</Text>
              </View>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

function BackOnlineIcon({ size = 28 }: { readonly size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={3} y={16} width={5} height={8} rx={2} fill={GOLD} stroke={NAVY} strokeWidth={2.4} />
      <Rect x={11.5} y={10} width={5} height={14} rx={2} fill={GOLD} stroke={NAVY} strokeWidth={2.4} />
      <Rect x={20} y={4} width={5} height={20} rx={2} fill={GOLD} stroke={NAVY} strokeWidth={2.4} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  lip: { borderRadius: 24, backgroundColor: NAVY, paddingBottom: 4, maxWidth: 360, marginHorizontal: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CREAM,
    borderColor: NAVY,
    borderWidth: 3,
    borderRadius: 24,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    minHeight: 48,
  },
  cardBack: { backgroundColor: '#e8f6ff' },
  copy: { marginLeft: 10, marginRight: 12, flexShrink: 1 },
  title: { fontFamily: 'Shark', fontSize: 17, color: NAVY, letterSpacing: 0.5 },
  body: { fontFamily: 'Knockout', fontSize: 14, color: BLUE, marginTop: -1 },
  retryLip: { backgroundColor: GOLD_LIP, borderRadius: 14, paddingBottom: 3 },
  retryPressed: { paddingBottom: 0, marginTop: 3 },
  retryBusy: { opacity: 0.6 },
  retry: {
    backgroundColor: GOLD,
    borderColor: NAVY,
    borderWidth: 2.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 70,
    alignItems: 'center',
  },
  retryText: { fontFamily: 'Shark', fontSize: 15, color: NAVY, letterSpacing: 0.5 },
});
