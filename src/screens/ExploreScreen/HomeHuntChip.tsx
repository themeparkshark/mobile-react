import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BRAND, GameIcon } from '../../ui';

export interface HuntChipMessage {
  /** A new key replaces the chip (and restarts its timer). */
  readonly key: string;
  readonly text: string;
  /** Degrees clockwise from screen-up; draws a direction arrow. */
  readonly arrowDeg?: number | null;
  readonly tone?: 'info' | 'error';
  /** Auto-dismiss after this long; 0 keeps it up while the state lasts (status lines). */
  readonly ttlMs?: number;
  readonly onPress?: () => void;
}

export const HUNT_CHIP_TTL_MS = 2600;

/** About how wide a chip's line draws (Shark 14 pt, padding, arrow), capped at the wrap's 320 pt. Errs wide. */
export function chipWidthFor(message: HuntChipMessage | null): number {
  if (!message) return 320;
  return Math.min(320, Math.round(36 + message.text.length * 6.6 + (message.arrowDeg != null ? 26 : 0)));
}
const noop = () => undefined;

/**
 * The only text that ever sits over the home map: one slim pill, gone on its
 * own after a moment or with a flick sideways. Never a card.
 */
export default function HomeHuntChip({ message, onDismiss }: {
  readonly message: HuntChipMessage | null;
  readonly onDismiss: () => void;
}) {
  const dx = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const stop = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  // The countdown restarts in full when a finger lets go, so a slow reader can hold the line up.
  const start = useCallback((ms: number | undefined) => {
    stop();
    if (ms === 0) return;
    timer.current = setTimeout(() => dismissRef.current(), ms ?? HUNT_CHIP_TTL_MS);
  }, [stop]);
  useEffect(() => {
    dx.value = 0;
    if (!message) return stop;
    start(message.ttlMs);
    return stop;
  }, [message?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Status lines (no timer) stay put: no swipe, so "tap to retry" is never lost.
  const swipe = Gesture.Pan().enabled(message?.ttlMs !== 0).activeOffsetX([-12, 12]).onUpdate(event => {
    dx.value = event.translationX;
  }).onEnd(event => {
    if (Math.abs(event.translationX) > 60 || Math.abs(event.velocityX) > 600) {
      dx.value = withTiming(Math.sign(event.translationX || 1) * 420, { duration: 160 }, done => {
        if (done) runOnJS(onDismiss)();
      });
    } else {
      dx.value = withSpring(0);
    }
  });
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }], opacity: 1 - Math.min(0.8, Math.abs(dx.value) / 300),
  }));
  if (!message) return null;
  const error = message.tone === 'error';
  return (
    <GestureDetector gesture={swipe}>
      {/* The layout animation lives on the outer view, the swipe on the inner one (Reanimated warns when both
          drive one view's opacity and transform). */}
      <Animated.View key={message.key} entering={FadeInDown.springify().damping(16)} exiting={FadeOut.duration(140)}
        style={styles.wrap}>
      <Animated.View style={slide}>
        <Pressable accessibilityRole={message.onPress ? 'button' : 'text'} accessibilityLabel={message.text}
          accessibilityHint={message.ttlMs === 0 ? undefined : 'Swipe sideways to dismiss'} onPress={message.onPress ?? onDismiss}
          onPressIn={stop} onPressOut={() => start(message.ttlMs)} onLongPress={noop}
          style={[styles.chip, error && styles.chipError]}>
          {message.arrowDeg != null && (
            <View style={[styles.arrow, { transform: [{ rotate: `${message.arrowDeg}deg` }] }]}>
              <View style={styles.arrowHead} />
              <View style={styles.arrowStem} />
            </View>
          )}
          {error && <GameIcon name="retry" size={16} />}
          <Text style={styles.text} numberOfLines={1}>{message.text}</Text>
        </Pressable>
      </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', maxWidth: 320 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 18, backgroundColor: 'rgba(5,52,110,0.9)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: BRAND.shadow, shadowOffset: { width: 0, height: 3 }, shadowRadius: 0, shadowOpacity: 0.25 },
  chipError: { backgroundColor: 'rgba(179,38,27,0.92)' },
  text: { color: BRAND.white, fontFamily: 'Shark', fontSize: 14, letterSpacing: 0.3, flexShrink: 1 },
  arrow: { width: 18, height: 18, alignItems: 'center' },
  arrowHead: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: BRAND.gold },
  arrowStem: { width: 4, height: 9, borderRadius: 2, backgroundColor: BRAND.gold, marginTop: -1 },
});
