import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, FadeIn, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence,
  withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, Circle, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { useAppActive } from '../../hooks/useLivePoll';
import { BOX_NAME, boxName, rewardLabel, type TrailBox, type TrailReward } from '../../services/trail/trailModel';
import { BRAND, GameButton, GameIcon, type GameIconName } from '../../ui';
import RewardBurst from '../RewardBurst';
import { CountUpText } from '../../gamekit/fx/CountUpText';
import { BOX_ART, BOX_OPEN_ART } from './TrailBoxArt';

const ICON: Record<TrailReward['kind'], GameIconName> = {
  coins: 'coins', energy: 'energy', tickets: 'ticket', mystery_box: 'gift', exclusive: 'star',
};
/** Light behind each box: a warm white core into its colour, never muddy on navy. */
const GLOW: Record<TrailBox['tier'], [string, string]> = {
  blue: ['#ffffff', '#d6f0ff'], red: ['#fff0ec', '#ffe2dc'], gold: ['#fff1b8', '#fff6d8'],
};
const CONFETTI: Record<TrailBox['tier'], string[]> = {
  blue: ['#7cc6f5', '#ffffff', '#0879ca', '#bfe5ff', '#ffcf3b'],
  red: ['#ef4a3c', '#ffffff', '#ff8a7a', '#ffcf3b', '#ffe07a'],
  gold: ['#ffcf3b', '#ffe07a', '#ffffff', '#fff3b0', '#7cc6f5'],
};
const STRIP: Record<TrailBox['tier'], string> = { blue: '#0879ca', red: '#ef4a3c', gold: '#e8a800' };

type Phase = 'ready' | 'opening' | 'rewards' | 'error';

function sfx(cue: string, opts: { volume?: number; pitch?: number } = {}) {
  void (async () => {
    try {
      if (!GameAudio.backend) await GameAudio.init();
      GameAudio.play(cue, opts);
    } catch { /* sound is decoration */ }
  })();
}
function haptic(level: number) {
  const style = [Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy][Math.min(2, level)];
  void Haptics.impactAsync(style).catch(() => undefined);
}

/**
 * Opening a Trail Box (about 2.5 s the first time; after that a tap skips):
 * the box crouches, rattles three times with rising pitch and haptics (fired
 * from the shake itself on the UI thread) while the light behind it swells, a
 * white flash pops the lid and the open box (Alex style, light pouring out)
 * stays on screen, confetti flies in the box's colours, and the rewards fly out
 * of the box one by one with their own sound. Coins count up. A Trail Exclusive
 * comes out last, alone, with a ring and a firework. Reduce Motion: a soft fade.
 */
export default function TrailReveal({ boxes, onOpen, onClose, nextHint, goldIn }: {
  /** Boxes until the Gold guarantee, after this open (a progress tick even on a small box). */
  readonly goldIn?: number | null;
  readonly boxes: readonly TrailBox[];
  readonly onOpen: (boxId: number) => Promise<readonly TrailReward[]>;
  readonly onClose: () => void;
  /** Shown on the last reward screen: what walks next. */
  readonly nextHint?: string | null;
}) {
  const reduced = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [opened, setOpened] = useState(false);
  const [rewards, setRewards] = useState<readonly TrailReward[]>([]);
  const box = boxes[index];
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const shake = useSharedValue(0);
  const lift = useSharedValue(0);
  const glow = useSharedValue(0);
  const flash = useSharedValue(0);
  const burst = useSharedValue(0);
  const idle = useSharedValue(0);
  const pop = useSharedValue(1);
  const pending = useRef<Promise<readonly TrailReward[]> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const size = Math.min(width * 0.56, 230);
  const stageTop = insets.top + 20 + 26 + 44;
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    cancelAnimation(idle);
    idle.value = 0;
    if (phase === 'ready' && !reduced) {
      idle.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) })), 10);
    }
  }, [phase, reduced, idle, index]);

  const land = useCallback(async () => {
    try {
      const got = await (pending.current ?? Promise.resolve([] as readonly TrailReward[]));
      // Item art loads before the cards fly, so the rarest card never lands blank.
      const urls = got.map(r => r.icon_url).filter((u): u is string => !!u);
      if (urls.length) await Promise.race([Image.prefetch(urls), new Promise(r => setTimeout(r, 1500))]).catch(() => undefined);
      setRewards(got);
      setPhase('rewards');
    } catch {
      setPhase('error');
    }
  }, []);

  const popLid = useCallback(() => {
    setOpened(true);
    haptic(2);
    sfx('fx.reveal');
    if (box?.tier === 'gold') timers.current.push(setTimeout(() => sfx('fx.firework'), 160));
    burst.value = 0;
    burst.value = withTiming(1, { duration: reduced ? 1 : 1200, easing: Easing.out(Easing.quad) });
    void land();
  }, [box?.tier, burst, reduced, land]);

  const rattle = useCallback((i: number) => {
    haptic(i);
    sfx('fx.hit', { pitch: i * 3, volume: 0.6 + i * 0.2 });
  }, []);

  const start = useCallback(() => {
    if (!box || phase !== 'ready') return;
    setPhase('opening');
    pending.current = onOpen(box.id);
    sfx('ui.tap');
    if (reduced) {
      glow.value = withTiming(1, { duration: 250 }, done => { if (done) runOnJS(popLid)(); });
      return;
    }
    const quick = index > 0;
    const crouch = quick ? 90 : 220;
    squashX.value = withSequence(withTiming(1.1, { duration: crouch }), withTiming(1, { duration: 140 }));
    squashY.value = withSequence(withTiming(0.86, { duration: crouch }), withSpring(1, { damping: 9, stiffness: 300 }));
    const rattleOnce = (i: number, amp: number) => withSequence(
      withTiming(-amp, { duration: 55 }, done => { if (done) runOnJS(rattle)(i); }),
      withTiming(amp, { duration: 85 }), withTiming(-amp * 0.5, { duration: 70 }), withTiming(0, { duration: 55 }));
    const gap = quick ? 60 : 210;
    shake.value = withDelay(crouch + 60, withSequence(rattleOnce(0, 6), withDelay(gap, rattleOnce(1, 11)), withDelay(gap, rattleOnce(2, 17))));
    const shakeEnd = crouch + 60 + 3 * 265 + 2 * gap;
    glow.value = withSequence(withTiming(0.35, { duration: crouch + 200 }), withTiming(1, { duration: shakeEnd - crouch - 200 }));
    lift.value = withDelay(shakeEnd - 120, withSequence(withTiming(-22, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 10, stiffness: 220 })));
    flash.value = withDelay(shakeEnd, withSequence(withTiming(0.85, { duration: 90 }, done => { if (done) runOnJS(popLid)(); }),
      withTiming(0, { duration: 420 })));
    pop.value = withDelay(shakeEnd + 90, withSequence(withTiming(1.16, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 240 })));
  }, [box, phase, onOpen, reduced, index, squashX, squashY, shake, glow, lift, flash, pop, popLid, rattle]);

  // After the first box the next ones start by themselves (the player knows the beat; a tap skips).
  useEffect(() => {
    if (index > 0 && phase === 'ready') {
      const t = setTimeout(start, reduced ? 0 : 300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [index, phase, start, reduced]);

  const skipAhead = () => {
    if (phase !== 'opening' || index === 0 || opened) return;
    [shake, squashX, squashY, lift, flash, glow].forEach(v => cancelAnimation(v));
    shake.value = 0; squashX.value = 1; squashY.value = 1; lift.value = 0; flash.value = 0; glow.value = 1;
    popLid();
  };

  const next = () => {
    if (index + 1 < boxes.length) {
      shake.value = 0; lift.value = 0; glow.value = 0; burst.value = 0; flash.value = 0;
      setOpened(false);
      setRewards([]);
      setPhase('ready');
      setIndex(i => i + 1);
    } else {
      sfx('ui.complete');
      onClose();
    }
  };

  const boxStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: lift.value - idle.value * 8 },
      { rotate: `${shake.value}deg` },
      { scaleX: squashX.value * pop.value * (1 + idle.value * 0.02) },
      { scaleY: squashY.value * pop.value * (1 + idle.value * 0.02) },
    ],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.45 + glow.value * 0.55 + idle.value * 0.1, transform: [{ scale: 0.8 + glow.value * 0.45 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  if (!box) return null;
  const left = boxes.length - index - 1;
  const g = size * 1.7;
  const showRewards = phase === 'rewards';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={showRewards ? next : onClose}>
      <Pressable style={[styles.scrim, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        onPress={phase === 'ready' ? start : skipAhead} accessibilityRole="button"
        accessibilityLabel={phase === 'ready' ? `Open your ${boxName(box)}` : BOX_NAME[box.tier]}>
        <Text style={styles.kicker}>{BOX_NAME[box.tier]}{boxes.length > 1 ? ` · ${index + 1} of ${boxes.length}` : ''}</Text>
        <Text style={styles.title}>{phase === 'ready' ? 'Tap to open!' : showRewards ? 'You got' : opened ? 'Here it comes!' : ' '}</Text>
        <View style={{ width: '100%', height: size * 1.05, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View pointerEvents="none" style={[styles.center, { width: g, height: g, top: (size * 1.05 - g) / 2 }, glowStyle]}>
            <Canvas style={{ width: g, height: g }}>
              <Circle cx={g / 2} cy={g / 2} r={g / 2}>
                <RadialGradient c={vec(g / 2, g / 2)} r={g / 2}
                  colors={[GLOW[box.tier][0], `${GLOW[box.tier][1]}e6`, '#ffffff55', '#ffffff00']} positions={[0, 0.35, 0.7, 1]} />
              </Circle>
            </Canvas>
          </Animated.View>
          {box.tier === 'gold' && <GoldRays size={g * 0.9} top={(size * 1.05 - g * 0.9) / 2} reduced={reduced} />}
          <Animated.View style={boxStyle}>
            <Image source={opened ? BOX_OPEN_ART[box.tier] : BOX_ART[box.tier]}
              style={{ width: size, height: size }} contentFit="contain" />
          </Animated.View>
        </View>
        <View style={styles.rewards}>
          {showRewards && rewards.map((r, i) => (
            <RewardCard key={`${index}-${r.kind}-${i}`} reward={r} tier={box.tier} order={i} reduced={reduced}
              hero={r.kind === 'exclusive'} delay={i * 320 + (r.kind === 'exclusive' ? 420 : 0)} />
          ))}
        </View>
        {showRewards && (
          <Animated.View entering={FadeIn.delay(reduced ? 0 : 300 + rewards.length * 320 + 400)} style={{ width: '100%', alignItems: 'center' }}>
            {box.tier !== 'gold' && goldIn != null && (
              <View style={styles.pity} accessible accessibilityLabel={goldIn <= 1 ? 'Your next new box is a Gold Box' : `A new Gold Box is coming within ${goldIn} boxes you earn`}>
                <Image source={BOX_ART.gold} style={{ width: 26, height: 26 }} contentFit="contain" />
                <Text style={styles.pityText}>{goldIn <= 1 ? 'YOUR NEXT NEW BOX IS GOLD!' : `NEW GOLD BOX IN ${goldIn} OR LESS`}</Text>
              </View>
            )}
            {left === 0 && !!nextHint && <Text style={styles.hint}>{nextHint}</Text>}
            <GameButton label={left > 0 ? `Next box (${left})` : 'Nice!'} onPress={next} />
          </Animated.View>
        )}
        {phase === 'error' && (
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.error}>That box didn't open. It is safe in your Trail Boxes, try again.</Text>
            <GameButton label="Close" variant="secondary" onPress={onClose} />
          </View>
        )}
        {phase === 'ready' && (
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.hint}>{index === 0 && boxes.length > 1 ? `${boxes.length} boxes to open` : ' '}</Text>
            {index === 0 && (
              <Pressable accessibilityRole="button" accessibilityLabel="Later. Keep this box for now" onPress={onClose} style={styles.later}>
                <Text style={styles.laterText}>LATER</Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff' }, flashStyle]} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <RewardBurst progress={burst} x={width / 2} y={stageTop + size * 0.5} colors={CONFETTI[box.tier]} />
      </View>
    </Modal>
  );
}

/** One reward flying out of the box to its place, with its own sound; coins count up. */
function RewardCard({ reward, tier, order, delay, hero, reduced }: {
  readonly reward: TrailReward;
  readonly tier: TrailBox['tier'];
  readonly order: number;
  readonly delay: number;
  readonly hero: boolean;
  readonly reduced: boolean;
}) {
  const t = useSharedValue(reduced ? 1 : 0);
  const ring = useSharedValue(0);
  // Coins count up on the UI thread (CountUpText), from 0 once the card lands.
  const [coinValue, setCoinValue] = useState(reduced ? reward.amount : 0);
  const landed = useCallback(() => {
    haptic(hero ? 2 : 0);
    if (hero) { sfx('fx.reveal'); sfx('fx.firework'); } else sfx(reward.kind === 'coins' ? 'fx.coin' : 'ui.select', { pitch: order * 2 });
    if (reward.kind === 'coins') setCoinValue(reward.amount);
  }, [hero, order, reward.kind, reward.amount]);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 170 }, done => { if (done) runOnJS(landed)(); }));
    if (hero) ring.value = withDelay(delay + 120, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 3),
    transform: [{ translateY: (1 - t.value) * -170 }, { scale: 0.25 + 0.75 * t.value }],
  }));
  return (
    <Animated.View style={[styles.cardWrap, style]}>
      {hero && <HeroRing ring={ring} />}
      <View style={[styles.card, hero && styles.cardHero]} accessible accessibilityLabel={reward.kind === 'coins' ? `Plus ${reward.amount} coins` : rewardLabel(reward)}>
        <View style={[styles.strip, { backgroundColor: hero ? BRAND.gold : STRIP[tier] }]} />
        {reward.kind === 'exclusive' && reward.icon_url
          ? <Image source={{ uri: reward.icon_url }} style={{ width: 60, height: 60 }} contentFit="contain" />
          : <GameIcon name={ICON[reward.kind]} size={50} />}
        {reward.kind === 'coins'
          ? <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><CountUpText value={coinValue} durationMs={650} prefix="+" suffix=" COINS" punch={1.08} reducedMotion={reduced}
              style={styles.coinText} /></View>
          : <Text style={styles.cardText} numberOfLines={2} adjustsFontSizeToFit maxFontSizeMultiplier={1.3}>{rewardLabel(reward)}</Text>}
        {hero && <Text style={styles.badge}>TRAIL ONLY</Text>}
      </View>
    </Animated.View>
  );
}

/**
 * Gold only: warm sun rays turning slowly behind the box. Each wedge fades from
 * gold at the centre to nothing before the halo's edge (never a hard slate
 * wedge over navy), and the rays sit inside the halo, under the title.
 */
function GoldRays({ size, top, reduced }: { readonly size: number; readonly top: number; readonly reduced: boolean }) {
  const spin = useSharedValue(0);
  // Battery: the decorative spin rests in the background (shim until claude/fb-battery's p.ambient lands).
  const appActive = useAppActive();
  useEffect(() => {
    if (reduced || !appActive) return undefined;
    spin.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [reduced, appActive, spin]);
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    const c = size / 2;
    const r = c * 0.9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const w = Math.PI / 24;
      p.moveTo(c, c);
      p.lineTo(c + Math.cos(a - w) * r, c + Math.sin(a - w) * r);
      p.lineTo(c + Math.cos(a + w) * r, c + Math.sin(a + w) * r);
      p.close();
    }
    return p;
  }, [size]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, width: size, height: size, alignSelf: 'center' }, style]}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={path}>
          <RadialGradient c={vec(size / 2, size / 2)} r={size * 0.45}
            colors={['#ffe58a73', '#ffe58a40', '#ffe58a00']} positions={[0.15, 0.55, 1]} />
        </Path>
      </Canvas>
    </Animated.View>
  );
}

function HeroRing({ ring }: { readonly ring: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: ring.value === 0 ? 0 : 1 - ring.value, transform: [{ scale: 0.6 + ring.value * 1.6 }] }));
  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  center: { position: 'absolute', alignSelf: 'center' },
  kicker: { zIndex: 2, fontFamily: 'Shark', fontSize: 16, color: BRAND.sky, textTransform: 'uppercase', letterSpacing: 2 },
  title: { zIndex: 2, fontFamily: 'Shark', fontSize: 34, color: BRAND.white, textTransform: 'uppercase', marginTop: 2,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 0 },
  rewards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, maxWidth: 380, minHeight: 150, marginTop: 4 },
  cardWrap: { alignItems: 'center', justifyContent: 'center' },
  card: { width: 108, minHeight: 132, borderRadius: 18, backgroundColor: BRAND.cream, borderWidth: 3.5, borderColor: BRAND.navy,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingTop: 16, paddingBottom: 8, overflow: 'hidden' },
  cardHero: { backgroundColor: BRAND.goldLight, transform: [{ scale: 1.06 }] },
  strip: { position: 'absolute', left: 0, right: 0, top: 0, height: 9 },
  coinText: { fontSize: 15, color: BRAND.navy, textShadowOffset: { width: 0, height: 0 }, marginTop: 6, minWidth: 90 },
  cardText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, textAlign: 'center', marginTop: 6, textTransform: 'uppercase' },
  badge: { fontFamily: 'Shark', fontSize: 11, color: BRAND.white, backgroundColor: BRAND.navy, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1, marginTop: 4, overflow: 'hidden', letterSpacing: 1 },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 6, borderColor: BRAND.gold },
  later: { minHeight: 44, minWidth: 120, paddingHorizontal: 20, borderRadius: 22, borderWidth: 2.5, borderColor: BRAND.sky,
    alignItems: 'center', justifyContent: 'center' },
  laterText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.sky, letterSpacing: 1 },
  pity: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,224,122,0.16)', borderRadius: 16,
    borderWidth: 2, borderColor: BRAND.goldLight, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  pityText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.goldLight, letterSpacing: 1 },
  hint: { fontFamily: 'Knockout', fontSize: 18, color: BRAND.sky, marginBottom: 8, textAlign: 'center' },
  error: { fontFamily: 'Knockout', fontSize: 18, color: BRAND.white, marginBottom: 12, textAlign: 'center' },
});
