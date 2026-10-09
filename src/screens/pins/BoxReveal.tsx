/**
 * The mystery box opening: the best 3 seconds on the Pins page.
 *
 * Per box: the box drops in and waits for your tap (you open it, like tearing
 * a pack). Tap: it shakes harder and harder while a glow builds; the glow is
 * the rarity tell (sky for a regular pin, gold with turning rays for the
 * chaser, which also shakes twice more). Pop: a flash, the lid flies off, the
 * pin flips up out of the box with confetti, then settles big and shiny with
 * its name and one tag: NEW! or +1 Trader (a spare to trade). The chaser gets
 * its own banner and its serial number (#3): low numbers are the flex.
 *
 * Tap anywhere to speed up; it never skips into a broken state (the server
 * already granted every pin before this plays). No buy button lives in here.
 * Bundles show each pin one by one, then all of them together.
 *
 * Cheap: everything runs on the UI thread (Reanimated), confetti is capped at
 * 22 pieces on one shared progress value, rays only for the chaser.
 * Reduce Motion: no shake, flip or confetti; the pin fades in.
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { queueHaptic } from '../../gamekit/Haptics';
import { BRAND, FONT, GameButton } from '../../ui';
import EnamelPin from '../pinTrading/EnamelPin';
import { BOX_ART, PIN_ART, type BoxTone } from './PinArt';
import { PINS_COPY, serialLabel, type Pull } from './pinsModel';

type Phase = 'drop' | 'ready' | 'shake' | 'pop' | 'show' | 'summary';

type Props = {
  readonly pulls: readonly Pull[];
  readonly tone: BoxTone;
  readonly still: boolean;
  readonly onDone: () => void;
  /** 'catch': Pin of the Day, no box: the pin bursts up out of the ground. */
  readonly variant?: 'box' | 'catch';
  /** Override the tag under the pin (default NEW! / +1 Trader). */
  readonly tagFor?: (pull: Pull) => { text: string; tone: 'new' | 'trader' };
};

export const REVEAL_CUES = ['fx.whoosh', 'fx.whooshRev', 'fx.coinTick', 'fx.reveal', 'fx.reward', 'fx.firework', 'ui.tap', 'ui.complete'] as const;

let preloaded: Promise<void> | null = null;
export function preloadRevealAudio(): void {
  preloaded ??= GameAudio.preload([...REVEAL_CUES]).catch(() => undefined);
}
function play(cue: typeof REVEAL_CUES[number], opts: { volume?: number; pitch?: number } = {}) {
  try { GameAudio.play(cue, opts); } catch { /* audio is decoration */ }
}

const CONFETTI = 22;
const CONFETTI_COLORS = ['#ffcf3b', '#ffffff', '#7cc6f5', '#ffe07a', '#ef4a3c', '#3cb85c'];
const GOLD_COLORS = ['#ffcf3b', '#ffe07a', '#ffffff', '#f2a900'];

/** Seeded so a reveal looks the same frame to frame (no Math.random in worklets). */
function pieces(seed: number, chaser: boolean) {
  let s = seed || 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  return Array.from({ length: CONFETTI }, (_, i) => {
    const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.5;
    const speed = 170 + rnd() * 190;
    const colors = chaser ? GOLD_COLORS : CONFETTI_COLORS;
    return {
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (rnd() - 0.5) * 720,
      w: 7 + rnd() * 6, h: 10 + rnd() * 8, color: colors[i % colors.length], round: rnd() > 0.6,
    };
  });
}

function ConfettiPiece({ p, burst }: { p: ReturnType<typeof pieces>[number]; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const b = burst.value;
    if (b <= 0 || b >= 1) return { opacity: 0 };
    return {
      opacity: 1 - b * b * b,
      transform: [
        { translateX: p.vx * b }, { translateY: p.vy * b + 420 * b * b }, { rotate: `${p.spin * b}deg` },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{
      position: 'absolute', width: p.w, height: p.round ? p.w : p.h, borderRadius: p.round ? p.w / 2 : 2, backgroundColor: p.color,
      borderWidth: 1, borderColor: 'rgba(5,52,110,0.35)',
    }, style]} />
  );
}

/** Gold rays behind the chaser (one SVG, turned on the UI thread). */
function Rays({ size, spin, on }: { size: number; spin: SharedValue<number>; on: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ rotate: `${spin.value}deg` }, { scale: 0.8 + on.value * 0.2 }] }));
  const r = size / 2;
  const wedges = Array.from({ length: 12 }, (_, i) => {
    const a0 = (i / 12) * Math.PI * 2; const a1 = a0 + Math.PI / 18;
    return `M${r},${r} L${r + Math.cos(a0) * r},${r + Math.sin(a0) * r} L${r + Math.cos(a1) * r},${r + Math.sin(a1) * r} Z`;
  }).join(' ');
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="rayfade" cx="50%" cy="50%" r="50%">
            <Stop offset="0.15" stopColor="#ffe07a" stopOpacity="0.85" />
            <Stop offset="1" stopColor="#ffcf3b" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <G><Path d={wedges} fill="url(#rayfade)" /></G>
      </Svg>
    </Animated.View>
  );
}

function Glow({ size, color, amount }: { size: number; color: string; amount: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: amount.value, transform: [{ scale: 0.7 + amount.value * 0.45 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`glow${color}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity="0.95" />
            <Stop offset="0.45" stopColor={color} stopOpacity="0.45" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#glow${color})`} />
      </Svg>
    </Animated.View>
  );
}

export default function BoxReveal({ pulls, tone, still, onDone, variant = 'box', tagFor }: Props) {
  const isCatch = variant === 'catch';
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('drop');
  const pull = pulls[Math.min(index, pulls.length - 1)];
  const chaser = !!pull?.is_chaser;
  const art = BOX_ART[tone];
  const boxSize = Math.min(240, width * 0.58);
  const pinSize = Math.min(210, width * 0.52);
  const centerY = height * 0.42;

  const drop = useSharedValue(0);
  const shake = useSharedValue(0);
  const glow = useSharedValue(0);
  const rays = useSharedValue(0);
  const raySpin = useSharedValue(0);
  const opened = useSharedValue(0); // 0 closed box, 1 base + flying lid
  const lid = useSharedValue(0);
  const flash = useSharedValue(0);
  const rise = useSharedValue(0);
  const flip = useSharedValue(0);
  const settle = useSharedValue(0);
  const burst = useSharedValue(0);
  const shine = useSharedValue(0);
  const hint = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  const confetti = useMemo(() => pieces((pull?.id ?? 1) * 7919, chaser), [pull?.id, chaser]);

  // A new box arrives: reset and drop it in.
  useEffect(() => {
    if (!pull) return;
    clearTimers();
    [shake, glow, rays, opened, lid, flash, rise, flip, settle, burst, shine].forEach(v => { cancelAnimation(v); v.value = 0; });
    drop.value = 0;
    setPhase('drop');
    if (isCatch) { drop.value = 1; later(still ? 60 : 280, () => (still ? showPin(true) : pop())); return; }
    play('fx.whoosh', { volume: 0.7 });
    drop.value = still ? withTiming(1, { duration: 180 }) : withSpring(1, { damping: 11, stiffness: 170, mass: 0.9 });
    later(still ? 200 : 520, () => setPhase('ready'));
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Tap!" hint bobs while the box waits.
  useEffect(() => {
    if (phase === 'ready' && !still) {
      hint.value = withRepeat(withSequence(withTiming(1, { duration: 520 }), withTiming(0, { duration: 520 })), -1, false);
    } else {
      cancelAnimation(hint); hint.value = 0;
    }
  }, [phase, still, hint]);

  const showPin = useCallback((instant: boolean) => {
    clearTimers();
    setPhase('show');
    const p = pulls[index];
    opened.value = 1;
    if (instant || still) {
      [shake].forEach(v => { cancelAnimation(v); v.value = 0; });
      lid.value = 1; rise.value = 1; flip.value = 1; settle.value = withTiming(1, { duration: still ? 220 : 160 });
      glow.value = withTiming(p?.is_chaser ? 0.9 : 0.55, { duration: 160 });
      if (p?.is_chaser && !still) { rays.value = withTiming(1, { duration: 200 }); }
    }
    if (!still) {
      shine.value = 0;
      shine.value = withDelay(500, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }));
    }
    if (p) {
      AccessibilityInfo.announceForAccessibility(`You got ${p.name}. ${p.is_chaser ? 'The chaser! ' : ''}${p.duplicate ? 'Plus one trader.' : 'New!'}`);
    }
  }, [index, pulls, still]); // eslint-disable-line react-hooks/exhaustive-deps

  const pop = useCallback(() => {
    setPhase('pop');
    const p = pulls[index];
    const isChaser = !!p?.is_chaser;
    flash.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 260 }));
    opened.value = 1;
    shake.value = 0;
    lid.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    rise.value = withSpring(1, { damping: 12, stiffness: 140, mass: 0.9 });
    flip.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) });
    settle.value = withDelay(380, withSpring(1, { damping: 14, stiffness: 180 }));
    burst.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) });
    glow.value = withTiming(isChaser ? 1 : 0.6, { duration: 200 });
    if (isChaser) {
      rays.value = withTiming(1, { duration: 300 });
      play('fx.reward'); later(120, () => play('fx.firework'));
      queueHaptic('comboHeavy', 2); later(260, () => queueHaptic('success', 2));
    } else {
      play('fx.reveal');
      queueHaptic('hitMedium', 2);
      if (!p?.duplicate) later(240, () => queueHaptic('success', 1));
    }
    later(650, () => showPin(false));
  }, [index, pulls, showPin]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback(() => {
    if (phase !== 'ready') return;
    const isChaser = !!pulls[index]?.is_chaser;
    if (still) { play('fx.reveal'); queueHaptic('hitMedium', 2); showPin(true); return; }
    setPhase('shake');
    play('fx.whooshRev', { volume: 0.9 });
    // Shakes get bigger and faster; the glow builds. The chaser shakes twice more, in gold.
    const beats = isChaser ? [6, 8, 10, 12, 15] : [5, 7, 10];
    const step = isChaser ? 190 : 175;
    const seq = beats.flatMap((deg, i) => [
      withTiming(-deg, { duration: step / 2 - i * 6 }), withTiming(deg, { duration: step / 2 - i * 6 }),
    ]);
    shake.value = withSequence(...seq, withTiming(0, { duration: 60 }));
    glow.value = withTiming(isChaser ? 0.95 : 0.6, { duration: beats.length * step });
    if (isChaser) rays.value = withDelay(beats.length * step * 0.5, withTiming(0.7, { duration: beats.length * step * 0.5 }));
    beats.forEach((_, i) => later(i * step, () => {
      play('fx.coinTick', { pitch: 1 + i * 0.12, volume: 0.8 });
      queueHaptic(i === beats.length - 1 ? 'hitMedium' : 'tickSelection', 1);
    }));
    later(beats.length * step + 40, pop);
  }, [phase, pulls, index, still, pop, showPin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chaser rays keep turning slowly while it's on screen.
  useEffect(() => {
    if (chaser && !still && (phase === 'show' || phase === 'pop' || phase === 'shake')) {
      raySpin.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1, false);
    } else { cancelAnimation(raySpin); }
    return () => cancelAnimation(raySpin);
  }, [chaser, still, phase, raySpin]);

  const next = useCallback(() => {
    play('ui.tap');
    if (index < pulls.length - 1) { setIndex(i => i + 1); return; }
    if (pulls.length > 1 && phase !== 'summary') { setPhase('summary'); play('ui.complete', { volume: 0.7 }); return; }
    onDone();
  }, [index, pulls.length, phase, onDone]);

  const onBackdrop = () => {
    if (phase === 'ready') open();
    else if (phase === 'shake' || phase === 'pop') showPin(true);
  };

  const boxStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(drop.value, [0, 1], [-height * 0.6, 0]) + settle.value * 70 },
      { rotate: `${shake.value}deg` },
      { scale: 1 + Math.abs(shake.value) * 0.004 + interpolate(settle.value, [0, 1], [0, -0.18]) },
    ],
    opacity: 1 - settle.value * 0.75,
  }));
  const closedStyle = useAnimatedStyle(() => ({ opacity: opened.value > 0 ? 0 : 1 }));
  const baseStyle = useAnimatedStyle(() => ({ opacity: opened.value > 0 ? 1 : 0 }));
  const lidStyle = useAnimatedStyle(() => ({
    opacity: opened.value > 0 ? 1 - lid.value * lid.value : 0,
    transform: [
      { translateX: lid.value * boxSize * 0.55 }, { translateY: -lid.value * boxSize * 1.1 }, { rotate: `${lid.value * 38}deg` },
    ],
  }));
  const pinStyle = useAnimatedStyle(() => ({
    opacity: still ? settle.value : Math.min(1, rise.value * 3),
    transform: [
      { translateY: interpolate(rise.value, [0, 1], [boxSize * 0.15, -boxSize * 0.55]) + settle.value * -10 },
      { perspective: 600 },
      { rotateY: `${(1 - flip.value) * 540}deg` },
      { scale: still ? 1 : interpolate(rise.value, [0, 1], [0.35, 1]) },
    ],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const infoStyle = useAnimatedStyle(() => ({ opacity: settle.value, transform: [{ translateY: (1 - settle.value) * 16 }] }));
  const hintStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -hint.value * 8 }, { scale: 1 + hint.value * 0.05 }] }));

  if (!pull) return null;
  const glowColor = chaser ? '#ffcf3b' : '#bfe5ff';

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => (phase === 'show' || phase === 'summary') && next()}>
      <Pressable style={styles.scrim} onPress={onBackdrop} accessibilityRole="button"
        accessibilityLabel={phase === 'ready' ? 'Open the box' : 'Mystery box'}>
        {/* Stage: everything centred on the box. */}
        <View pointerEvents="none" style={[styles.stage, { top: centerY - boxSize / 2, width, height: boxSize }]}>
          <Glow size={boxSize * 2.3} color={glowColor} amount={glow} />
          {chaser && !still && <Rays size={boxSize * 2.6} spin={raySpin} on={rays} />}
          <Animated.View style={[{ width: boxSize, height: boxSize, opacity: isCatch ? 0 : 1 }, boxStyle]}>
            <Animated.View style={[StyleSheet.absoluteFill, closedStyle]}>
              <Image source={art.closed} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, baseStyle]}>
              <Image source={art.base} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
            </Animated.View>
            <Animated.View style={[{ position: 'absolute', left: boxSize * 0.044, top: -boxSize * 0.146, width: boxSize * 0.915, height: boxSize * 0.915 }, lidStyle]}>
              <Image source={art.lid} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
            </Animated.View>
          </Animated.View>
          {phase !== 'drop' && phase !== 'ready' && phase !== 'shake' && phase !== 'summary' && (
            <Animated.View style={[styles.pin, { width: pinSize, height: pinSize, top: (boxSize - pinSize) / 2 }, pinStyle]}>
              {pull.icon_url && <EnamelPin uri={pull.icon_url} size={pinSize} shine={still ? undefined : shine} lag={0} lagSpan={0} surface="panel" />}
            </Animated.View>
          )}
          <View style={[styles.confettiOrigin, { top: boxSize * 0.2 }]}>
            {!still && phase !== 'summary' && confetti.map((p, i) => <ConfettiPiece key={i} p={p} burst={burst} />)}
          </View>
        </View>

        {phase === 'ready' && (
          <Animated.View pointerEvents="none" style={[styles.tapHint, { top: centerY + boxSize / 2 + 18 }, hintStyle]}>
            <Text maxFontSizeMultiplier={1.2} style={styles.tapText}>Tap to open!</Text>
          </Animated.View>
        )}

        {phase === 'show' && (
          <Animated.View style={[styles.info, { top: centerY + pinSize * 0.42 }, infoStyle]} pointerEvents="box-none">
            {pull.is_chaser && (
              <View style={styles.chaserBanner}>
                <Image source={PIN_ART.chaser} style={{ width: 30, height: 30 }} contentFit="contain" />
                <Text maxFontSizeMultiplier={1.1} style={styles.chaserText}>CHASER {serialLabel(pull.serial)}</Text>
              </View>
            )}
            <Text maxFontSizeMultiplier={1.2} style={styles.name} numberOfLines={2}>{pull.name}</Text>
            {(() => {
              const tag = tagFor ? tagFor(pull) : { text: pull.duplicate ? PINS_COPY.trader : PINS_COPY.newPin, tone: pull.duplicate ? 'trader' as const : 'new' as const };
              const trader = tag.tone === 'trader';
              return (
                <View style={[styles.tag, trader ? styles.tagTrader : styles.tagNew]}>
                  {trader && !isCatch && <Image source={PIN_ART.trade} style={{ width: 22, height: 22 }} contentFit="contain" />}
                  {isCatch && <Image source={PIN_ART.seal} style={{ width: 24, height: 24 }} contentFit="contain" />}
                  <Text maxFontSizeMultiplier={1.1} style={[styles.tagText, trader && { color: BRAND.white }]}>{tag.text}</Text>
                </View>
              );
            })()}
          </Animated.View>
        )}

        {phase === 'summary' && (
          <View style={[styles.summary, { top: height * 0.2 }]}>
            <Text maxFontSizeMultiplier={1.2} style={styles.summaryTitle}>You got</Text>
            <View style={styles.summaryRow}>
              {pulls.map(p => (
                <View key={p.id} style={styles.summaryItem}>
                  {p.icon_url && <EnamelPin uri={p.icon_url} size={Math.min(84, (width - 64) / 3.4)} surface="panel" />}
                  {p.is_chaser && <Image source={PIN_ART.chaser} style={styles.summaryStar} contentFit="contain" />}
                  <View style={[styles.miniTag, p.duplicate ? styles.tagTrader : styles.tagNew]}>
                    <Text maxFontSizeMultiplier={1} style={[styles.miniTagText, p.duplicate && { color: BRAND.white }]}>{p.duplicate ? '+1' : 'NEW'}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />

        {(phase === 'show' || phase === 'summary') && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 18 }]}>
            {pulls.length > 1 && phase === 'show' && (
              <View style={styles.pips} accessible accessibilityLabel={`Box ${index + 1} of ${pulls.length}`}>
                {pulls.map((p, i) => <View key={p.id} style={[styles.pip, i <= index && styles.pipOn, p.is_chaser && i <= index && styles.pipGold]} />)}
              </View>
            )}
            <GameButton label={index < pulls.length - 1 ? 'Next box' : pulls.length > 1 && phase === 'show' ? 'See all' : 'Done'}
              icon={index < pulls.length - 1 ? 'gift' : 'check'} onPress={next} />
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(4,38,92,0.88)' },
  stage: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', alignSelf: 'center' },
  confettiOrigin: { position: 'absolute', alignSelf: 'center', width: 1, height: 1 },
  flash: { backgroundColor: '#ffffff' },
  tapHint: { position: 'absolute', alignSelf: 'center', backgroundColor: BRAND.gold, borderColor: BRAND.navy, borderWidth: 3, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 6 },
  tapText: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, paddingTop: 3 },
  info: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 10 },
  chaserBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.gold, borderColor: BRAND.navy, borderWidth: 3,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, transform: [{ rotate: '-3deg' }],
  },
  chaserText: { fontFamily: FONT.display, fontSize: 24, color: BRAND.navy, letterSpacing: 1, paddingTop: 3 },
  name: {
    fontFamily: FONT.display, fontSize: 32, color: BRAND.white, textAlign: 'center',
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0,
  },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 3, paddingHorizontal: 14, paddingVertical: 4 },
  tagNew: { backgroundColor: BRAND.gold, borderColor: BRAND.navy },
  tagTrader: { backgroundColor: BRAND.blueBright, borderColor: BRAND.white },
  tagText: { fontFamily: FONT.display, fontSize: 20, color: BRAND.navy, paddingTop: 2 },
  summary: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  summaryTitle: { fontFamily: FONT.display, fontSize: 34, color: BRAND.white, marginBottom: 18, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18 },
  summaryItem: { alignItems: 'center' },
  summaryStar: { position: 'absolute', left: -8, top: -8, width: 28, height: 28 },
  miniTag: { marginTop: 6, borderRadius: 999, borderWidth: 2, paddingHorizontal: 9, paddingVertical: 1 },
  miniTagText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, paddingTop: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 12 },
  pips: { flexDirection: 'row', gap: 8 },
  pip: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  pipOn: { backgroundColor: BRAND.white },
  pipGold: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
});

