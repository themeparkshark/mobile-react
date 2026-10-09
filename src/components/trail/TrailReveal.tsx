import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, FadeIn, ZoomIn, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence,
  withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { TIER_NAME, rewardLabel, type TrailBox, type TrailReward } from '../../services/trail/trailModel';
import { BRAND, GameButton, GameIcon, SHADOW, type GameIconName } from '../../ui';
import RewardBurst from '../RewardBurst';
import { BOX_ART } from './TrailBoxArt';

const ICON: Record<TrailReward['kind'], GameIconName> = {
  coins: 'coins', energy: 'energy', tickets: 'ticket', mystery_box: 'pin', exclusive: 'star',
};
const TIER_GLOW: Record<TrailBox['tier'], string> = { blue: BRAND.skyDeep, red: '#ff9a8f', gold: BRAND.goldLight };

type Phase = 'ready' | 'shaking' | 'rewards' | 'error';

/**
 * Opening a Trail Box. Tap the box: it shakes three times with rising
 * haptics, bursts with confetti in its tier colour (Gold adds fireworks and a
 * sparkle ring), then the rewards pop out one by one, exactly what the server
 * paid. Several ready boxes open one after another; after the first, a tap
 * anywhere skips straight to the rewards. Reduce Motion: no shake, a soft fade.
 */
export default function TrailReveal({ boxes, onOpen, onClose }: {
  readonly boxes: readonly TrailBox[];
  readonly onOpen: (boxId: number) => Promise<readonly TrailReward[]>;
  readonly onClose: () => void;
}) {
  const reduced = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [rewards, setRewards] = useState<readonly TrailReward[]>([]);
  const box = boxes[index];
  const shake = useSharedValue(0);
  const lift = useSharedValue(0);
  const boxOut = useSharedValue(0);
  const burst = useSharedValue(0);
  const ring = useSharedValue(0);
  const idle = useSharedValue(0);
  const pending = useRef<Promise<readonly TrailReward[]> | null>(null);
  const skip = useRef(false);
  const size = Math.min(width * 0.62, 260);

  useEffect(() => {
    cancelAnimation(idle);
    idle.value = 0;
    if (phase === 'ready' && !reduced) {
      idle.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1);
    }
  }, [phase, reduced, idle, index]);

  const showRewards = useCallback(async () => {
    try {
      const got = await (pending.current ?? Promise.resolve([] as readonly TrailReward[]));
      setRewards(got);
      setPhase('rewards');
      playSfx('fx.reveal');
      if (box?.tier === 'gold') setTimeout(() => playSfx('fx.firework'), 180);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      burst.value = 0;
      burst.value = withTiming(1, { duration: reduced ? 1 : 1100, easing: Easing.out(Easing.quad) });
      ring.value = 0;
      if (box?.tier === 'gold' && !reduced) ring.value = withTiming(1, { duration: 900 });
    } catch {
      setPhase('error');
    }
  }, [box?.tier, burst, ring, reduced]);

  const start = useCallback(() => {
    if (!box || phase !== 'ready') return;
    setPhase('shaking');
    skip.current = false;
    pending.current = onOpen(box.id);
    playSfx('ui.tap');
    if (reduced) {
      boxOut.value = withTiming(1, { duration: 250 }, () => runOnJS(showRewards)());
      return;
    }
    const hits = [Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy];
    hits.forEach((style, i) => setTimeout(() => {
      if (skip.current) return;
      void Haptics.impactAsync(style).catch(() => undefined);
      playSfx('fx.whoosh', 0.5 + i * 0.2);
    }, i * 300));
    const one = (amp: number) => withSequence(withTiming(-amp, { duration: 60 }), withTiming(amp, { duration: 90 }), withTiming(0, { duration: 60 }));
    shake.value = withSequence(one(6), withDelay(90, one(10)), withDelay(90, one(15)));
    lift.value = withSequence(withTiming(0, { duration: 840 }), withTiming(-18, { duration: 120 }), withTiming(0, { duration: 1 }));
    boxOut.value = withDelay(900, withTiming(1, { duration: 220, easing: Easing.in(Easing.quad) }, done => {
      if (done) runOnJS(showRewards)();
    }));
  }, [box, phase, onOpen, reduced, shake, lift, boxOut, showRewards]);

  // After the first box, the next ones start by themselves.
  useEffect(() => {
    if (index > 0 && phase === 'ready') {
      const t = setTimeout(start, reduced ? 0 : 350);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [index, phase, start, reduced]);

  const skipAhead = () => {
    if (phase !== 'shaking' || index === 0) return;
    skip.current = true;
    cancelAnimation(shake);
    cancelAnimation(boxOut);
    boxOut.value = 1;
    void showRewards();
  };

  const next = () => {
    if (index + 1 < boxes.length) {
      shake.value = 0; lift.value = 0; boxOut.value = 0; burst.value = 0; ring.value = 0;
      setRewards([]);
      setPhase('ready');
      setIndex(i => i + 1);
    } else {
      playSfx('ui.complete');
      onClose();
    }
  };

  const boxStyle = useAnimatedStyle(() => ({
    opacity: 1 - boxOut.value,
    transform: [
      { translateY: lift.value - idle.value * 8 },
      { rotate: `${shake.value}deg` },
      { scale: 1 + boxOut.value * 0.5 + idle.value * 0.02 },
    ],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + idle.value * 0.3 + boxOut.value * 0.6, transform: [{ scale: 1 + boxOut.value * 0.6 }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value === 0 ? 0 : 1 - ring.value, transform: [{ scale: 0.4 + ring.value * 1.8 }] }));

  if (!box) return null;
  const left = boxes.length - index - 1;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={phase === 'rewards' ? next : undefined}>
      <Pressable style={[styles.scrim, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        onPress={phase === 'ready' ? start : skipAhead} accessibilityRole="button"
        accessibilityLabel={phase === 'ready' ? `Open your ${TIER_NAME[box.tier]}` : 'Trail Box'}>
        <Text style={styles.kicker}>{phase === 'rewards' ? 'You got' : TIER_NAME[box.tier]}</Text>
        {phase !== 'rewards' && <Text style={styles.title}>{phase === 'ready' ? 'Tap to open!' : 'Opening...'}</Text>}
        <View style={{ width: size * 1.5, height: size * 1.25, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[styles.glow, { width: size * 1.2, height: size * 1.2, borderRadius: size, backgroundColor: TIER_GLOW[box.tier] }, glowStyle]} />
          <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size }, ringStyle]} />
          {phase !== 'rewards' && (
            <Animated.View style={boxStyle}>
              <Image source={BOX_ART[box.tier]} style={{ width: size, height: size }} contentFit="contain" />
            </Animated.View>
          )}
          {phase === 'rewards' && (
            <View style={styles.rewards}>
              {rewards.map((r, i) => (
                <Animated.View key={`${r.kind}-${i}`} entering={reduced ? FadeIn.duration(150) : ZoomIn.delay(140 + i * 260).springify().damping(11)}
                  style={[styles.card, r.kind === 'exclusive' && styles.cardGold]}>
                  {r.kind === 'exclusive' && r.icon_url
                    ? <Image source={{ uri: r.icon_url }} style={{ width: 52, height: 52 }} contentFit="contain" />
                    : <GameIcon name={ICON[r.kind]} size={48} />}
                  <Text style={styles.cardText} numberOfLines={2}>{r.kind === 'coins' ? `+${rewardLabel(r)}` : rewardLabel(r)}</Text>
                  {r.kind === 'exclusive' && <Text style={styles.badge}>TRAIL ONLY</Text>}
                </Animated.View>
              ))}
            </View>
          )}
        </View>
        {phase === 'rewards' && (
          <Animated.View entering={FadeIn.delay(reduced ? 0 : 140 + rewards.length * 260)} style={{ width: '100%', alignItems: 'center' }}>
            <GameButton label={left > 0 ? `Next box (${left})` : 'Keep walking!'} onPress={next} />
          </Animated.View>
        )}
        {phase === 'error' && (
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.error}>That box didn't open. It is safe, try again.</Text>
            <GameButton label="Close" variant="secondary" onPress={onClose} />
          </View>
        )}
        {phase === 'ready' && <Text style={styles.hint}>{index === 0 && boxes.length > 1 ? `${boxes.length} boxes to open` : ' '}</Text>}
      </Pressable>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <RewardBurst progress={burst} x={width / 2} y={height * 0.45} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(5,52,110,0.88)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  kicker: { fontFamily: 'Knockout', fontSize: 18, color: BRAND.sky, textTransform: 'uppercase', letterSpacing: 2 },
  title: { fontFamily: 'Shark', fontSize: 34, color: BRAND.white, textTransform: 'uppercase', marginTop: 2,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 0 },
  glow: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 6, borderColor: BRAND.gold },
  rewards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, maxWidth: 360 },
  card: { width: 104, minHeight: 112, borderRadius: 18, backgroundColor: BRAND.cream, borderWidth: 3, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', padding: 8, ...SHADOW.lifted },
  cardGold: { backgroundColor: BRAND.goldLight, borderColor: BRAND.gold },
  cardText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, textAlign: 'center', marginTop: 6, textTransform: 'uppercase' },
  badge: { fontFamily: 'Knockout', fontSize: 11, color: BRAND.white, backgroundColor: BRAND.navy, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1, marginTop: 4, overflow: 'hidden', letterSpacing: 1 },
  hint: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.sky, marginTop: 4 },
  error: { fontFamily: 'Knockout', fontSize: 18, color: BRAND.white, marginBottom: 12, textAlign: 'center' },
});
