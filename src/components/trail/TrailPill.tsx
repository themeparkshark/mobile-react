import * as Haptics from 'expo-haptics';
import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, cancelAnimation } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { boxFraction, headlineBox, milestonesCrossed, shortSteps, stepsToGo, type TrailState } from '../../services/trail/trailModel';
import { BRAND, SHADOW } from '../../ui';
import TrailBoxArt from './TrailBoxArt';

/**
 * The map's Trail Box pill, in the same capsule language as the Energy pill
 * under it: the box nearest to done rides the left edge, the capsule fills
 * gold as you walk and says how many steps are left. Ready: the capsule turns
 * gold and says OPEN!, and the box hops. A new box earned pops the pill.
 */
function TrailPill({ state, active, onPress }: {
  readonly state: TrailState;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  const reduced = useReducedGameMotion();
  const box = headlineBox(state);
  const ready = state.ready.length;
  const fraction = box ? boxFraction(box) : 0;
  const pop = useSharedValue(1);
  const glow = useSharedValue(0);
  const fill = useSharedValue(fraction);
  const count = state.walking.length + state.waiting.length + ready;
  const prev = useRef({ count, fraction, id: box?.id ?? 0, ready });

  useEffect(() => {
    const p = prev.current;
    const sameBox = p.id === (box?.id ?? 0);
    const crossed = sameBox ? milestonesCrossed(p.fraction, fraction) : [];
    const earned = count > p.count;
    const newlyReady = ready > p.ready;
    prev.current = { count, fraction, id: box?.id ?? 0, ready };
    fill.value = reduced ? fraction : withTiming(sameBox ? Math.max(fill.value, fraction) : fraction, { duration: 700 });
    if (!active) return;
    if (earned || newlyReady || crossed.length) {
      if (!reduced) pop.value = withSequence(withTiming(1.18, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 260 }));
      void Haptics.impactAsync(newlyReady ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  }, [count, fraction, ready, box?.id, active, reduced, pop, fill]);

  useEffect(() => {
    cancelAnimation(glow);
    glow.value = 0;
    if (ready && active && !reduced) {
      glow.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0, { duration: 650 })), -1);
    }
    return () => cancelAnimation(glow);
  }, [ready, active, reduced, glow]);

  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(Math.min(1, fill.value) * 100)}%` }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.65 }));

  const label = ready ? (ready > 1 ? `OPEN ${ready}` : 'OPEN!') : box ? shortSteps(stepsToGo(box)) : 'Walk';
  const a11y = ready
    ? `${ready} Trail ${ready === 1 ? 'Box is' : 'Boxes are'} ready to open`
    : box ? `Trail Box: ${stepsToGo(box)} steps to go` : 'Trail Boxes';

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint="Opens your Trail Boxes"
      hitSlop={6} onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { transform: [{ scale: 0.96 }] }]}>
      <Animated.View style={[styles.row, wrapStyle]}>
        <View style={[styles.pill, ready ? styles.pillReady : null]}>
          {!ready && <Animated.View style={[styles.fill, fillStyle]} />}
          {!!ready && <Animated.View style={[StyleSheet.absoluteFill, styles.glow, glowStyle]} />}
          <Text style={[styles.count, ready ? styles.countReady : null]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
          {!ready && !!box && <Text style={styles.unit}>steps</Text>}
        </View>
        <View style={styles.icon}>
          {box ? <TrailBoxArt tier={box.tier} size={38} fraction={fraction} ready={!!ready} active={active} />
            : <TrailBoxArt tier="blue" size={38} dim active={false} />}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default memo(TrailPill);

const styles = StyleSheet.create({
  wrap: { height: 40, justifyContent: 'center' },
  row: { height: 40, justifyContent: 'center' },
  pill: { height: 30, minWidth: 96, marginLeft: 16, paddingLeft: 26, paddingRight: 10, borderRadius: 15, overflow: 'hidden',
    backgroundColor: BRAND.blueBright, borderWidth: 2.5, borderColor: BRAND.white, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', ...SHADOW.card },
  pillReady: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,207,59,0.55)' },
  glow: { backgroundColor: BRAND.goldLight },
  count: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  countReady: { color: BRAND.navy, textShadowColor: BRAND.white, textShadowOffset: { width: 0, height: 1 } },
  unit: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.white, marginLeft: 3, marginTop: 3 },
  icon: { position: 'absolute', left: -2, top: -1 },
});
