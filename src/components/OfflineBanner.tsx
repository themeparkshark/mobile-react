import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, StyleSheet, Text, View } from 'react-native';
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
import client from '../api/client';
import * as Haptics from '../helpers/haptics';
import { isOffline, onConnectivityChange } from '../services/connectivity';
import { BRAND, FONT, GameButton, OUTLINE, Z } from '../ui';

export const OFFLINE_SHOW_DELAY_MS = 1200;
export const OFFLINE_PROBE_INTERVAL_MS = 15000;
const BACK_ONLINE_HOLD_MS = 1400;

type Phase = 'hidden' | 'offline' | 'back';

// Drawn with the art pipeline (GPT Image 2.5 with Alex's original gift,
// compass, foam finger and sunglasses art as references) and checked beside
// his originals at 128px and 40px: tps-prime-time-audit/art-ws9/review-sheet-1.png.
const OFFLINE_ICON = require('../../assets/images/offline/offline.png');
const BACK_ONLINE_ICON = require('../../assets/images/offline/back-online.png');
const ICON_SIZE = 34;

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

  // GameButton plays its own light tap haptic.
  const onRetry = runProbe;

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
            <Image source={back ? BACK_ONLINE_ICON : OFFLINE_ICON} style={styles.icon} accessibilityElementsHidden importantForAccessibility="no" />
          </Animated.View>
          <View style={styles.copy}>
            <Text style={styles.title} maxFontSizeMultiplier={1.3}>{back ? 'BACK ONLINE' : 'OFFLINE'}</Text>
            <Text style={styles.body} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {back ? 'Your park is live again' : 'Showing your saved park'}
            </Text>
          </View>
          {!back && (
            <GameButton
              label="Retry"
              size="compact"
              fullWidth={false}
              loading={probing}
              onPress={onRetry}
              accessibilityLabel="Try to reconnect"
              style={styles.retry}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// Sits above screens but under GameDialog (Z.dialog) and toasts.
const BANNER_Z = Z.dialog - 1;

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: BANNER_Z, elevation: BANNER_Z },
  lip: { borderRadius: 24, backgroundColor: BRAND.navy, paddingBottom: 4, maxWidth: 360, marginHorizontal: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.cream,
    borderColor: BRAND.navy,
    borderWidth: OUTLINE.thick,
    borderRadius: 24,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    minHeight: 48,
  },
  cardBack: { backgroundColor: BRAND.sky },
  icon: { width: ICON_SIZE, height: ICON_SIZE, resizeMode: 'contain' },
  copy: { marginLeft: 10, marginRight: 12, flexShrink: 1 },
  title: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navy, letterSpacing: 0.5 },
  body: { fontFamily: FONT.body, fontSize: 14, color: BRAND.blue, marginTop: -1 },
  // His yellow button art at 3.8:1, so 112 wide is about 30pt tall.
  retry: { width: 112 },
});
