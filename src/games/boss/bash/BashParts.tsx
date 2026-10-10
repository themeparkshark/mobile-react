/**
 * Boss Bash pieces: the pop-up actor, the fin meter, the dizzy target, the
 * callouts, the flying numbers and the water line. Every animation runs on
 * the UI thread (Reanimated); React only re-renders on game events.
 */
import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring,
  withTiming, type SharedValue,
} from 'react-native-reanimated';
import { BRAND } from '../../../ui/tokens';
import { BASH_ART, WM_ASPECT } from './art';
import { usePowerBudget } from '../../../power';
import { DIZZY_DROP_MS, ringScaleAt, type Kind } from './rules';

export type ActorExit = null | 'bonk' | 'sink' | 'ouch' | 'dive';

/** One tentacle (or puffer) rising out of the water in its spot. */
export const PopupActor = memo(function PopupActor({ kind, x, baseY, height, limb, goldLimb, limbAspect, exit, reduced, ghostly, hint }: {
  kind: Kind; x: number; baseY: number; height: number; limb: number; goldLimb?: number; limbAspect: number; exit: ActorExit; reduced: boolean;
  ghostly: boolean; hint: boolean;
}) {
  // Decorative idle loop: stops on Battery Saver / idle (ambient), never at normal power.
  const { ambient: animate } = usePowerBudget();
  const rise = useSharedValue(reduced ? 1 : 0);
  const sway = useSharedValue(0);
  const squash = useSharedValue(1);
  const flash = useSharedValue(0);
  const foam = useSharedValue(0);
  const isPuffer = kind === 'puffer';
  const isGold = kind === 'gold';
  const w = isPuffer ? height * 0.62 : height * limbAspect;
  const h = isPuffer ? height * 0.56 : height;

  useEffect(() => {
    if (reduced) { rise.value = withTiming(1, { duration: 120 }); return; }
    rise.value = withSpring(1, { damping: 11, stiffness: 190, mass: 0.7 });
    foam.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 520 }));
    if (animate) sway.value = withDelay(220, withRepeat(withTiming(1, { duration: isPuffer ? 520 : 820, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => { cancelAnimation(sway); cancelAnimation(rise); };
  }, [reduced, rise, sway, foam, isPuffer, animate]);

  useEffect(() => {
    if (!exit) return;
    cancelAnimation(sway);
    if (exit === 'bonk') {
      flash.value = withSequence(withTiming(1, { duration: 30 }), withTiming(0, { duration: 160 }));
      squash.value = reduced ? 1 : withSequence(withTiming(0.55, { duration: 55 }), withTiming(0.8, { duration: 90 }));
      rise.value = withDelay(reduced ? 0 : 90, withTiming(-0.15, { duration: 210, easing: Easing.in(Easing.quad) }));
    } else if (exit === 'ouch') {
      squash.value = reduced ? 1 : withSequence(withTiming(1.35, { duration: 90, easing: Easing.out(Easing.back(3)) }), withTiming(1.2, { duration: 260 }));
      rise.value = withDelay(320, withTiming(-0.15, { duration: 240 }));
    } else {
      rise.value = withTiming(-0.15, { duration: exit === 'dive' ? 170 : 300, easing: Easing.in(Easing.quad) });
    }
    foam.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 380 }));
  }, [exit, reduced, rise, squash, flash, foam, sway]);

  const body = useAnimatedStyle(() => {
    const swing = isPuffer ? 0 : interpolate(sway.value, [0, 1], [-5, 5]);
    const bob = isPuffer ? interpolate(sway.value, [0, 1], [0, -6]) : 0;
    const s = squash.value;
    return {
      opacity: ghostly ? 0.86 : 1,
      transform: [
        { translateY: (1 - rise.value) * h + bob },
        { translateY: h / 2 }, { rotate: `${swing}deg` },
        { scaleY: isPuffer ? s : s }, { scaleX: isPuffer ? s : 2 - s },
        { translateY: -h / 2 },
      ],
    };
  });
  const white = useAnimatedStyle(() => ({ opacity: flash.value }));
  const foamStyle = useAnimatedStyle(() => ({ opacity: foam.value, transform: [{ scaleX: 0.7 + foam.value * 0.5 }] }));
  const limbSrc = isPuffer ? BASH_ART.puffer : isGold && goldLimb ? goldLimb : limb;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x - w / 2, top: baseY - h - (isPuffer ? h * 0.25 : 0), width: w, height: h + (isPuffer ? h * 0.25 : 0) }}>
      <View style={{ position: 'absolute', left: -w, width: w * 3, top: -h * 0.2, height: h * 1.2 + (isPuffer ? h * 0.25 : 0), overflow: 'hidden' }}>
        <Animated.View style={[{ position: 'absolute', left: w, top: h * 0.2 + (isPuffer ? h * 0.12 : 0), width: w, height: h }, body]}>
          <Image source={limbSrc} style={StyleSheet.absoluteFill} contentFit="contain" />
          {/* Gold tentacle: hand-drawn gold art (Kraken) or the drawn limb washed gold, with sparkles (worth two fins, gone fast). */}
          {isGold && !goldLimb && <Image source={limbSrc} style={[StyleSheet.absoluteFill, { opacity: 0.62 }]} contentFit="contain" tintColor="#ffcf3b" />}
          {isGold && <Image source={BASH_ART.sparkle} style={{ position: 'absolute', width: w * 0.55, height: w * 0.55, left: -w * 0.1, top: h * 0.05 }} contentFit="contain" />}
          {isGold && <Image source={BASH_ART.sparkle} style={{ position: 'absolute', width: w * 0.4, height: w * 0.4, right: -w * 0.05, top: h * 0.4 }} contentFit="contain" />}
          {isGold && <View style={[styles.x2, { left: w * 0.55, top: -4 }]}><Text style={styles.x2Text} maxFontSizeMultiplier={1}>x2</Text></View>}
          <Animated.View style={[StyleSheet.absoluteFill, white]}>
            <Image source={limbSrc} style={StyleSheet.absoluteFill} contentFit="contain" tintColor="#ffffff" />
          </Animated.View>
        </Animated.View>
      </View>
      <Animated.View style={[styles.foam, { width: w * 0.95, left: w * 0.025, top: h + (isPuffer ? h * 0.25 : 0) - 9 }, foamStyle]} />
      {hint && <TapHand x={w * 0.5} y={h * (isPuffer ? 0.4 : 0.42)} reduced={reduced} />}
    </View>
  );
});

/** The pointing hand that shows a first-timer what to tap. */
export function TapHand({ x, y, reduced, size = 64 }: { x: number; y: number; reduced: boolean; size?: number }) {
  const { animate } = usePowerBudget();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduced && animate) t.value = withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(0, { duration: 420 })), -1, false);
    return () => cancelAnimation(t);
  }, [t, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -t.value * 14 }, { scale: 1 - t.value * 0.06 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - size * 0.42, top: y, width: size, height: size * 1.28 }, style]}>
    <Image source={BASH_ART.tapHand} style={StyleSheet.absoluteFill} contentFit="contain" />
  </Animated.View>;
}

/** Fins: fill them with bonks, the boss gets dizzy when they are full. */
export const FinMeter = memo(function FinMeter({ power, need, headStart, popKey, ready, size, reduced }: {
  power: number; need: number; headStart: number; popKey: number; ready: boolean; size: number; reduced: boolean;
}) {
  // Decorative idle loop: stops on Battery Saver / idle (ambient), never at normal power.
  const { ambient: animate } = usePowerBudget();
  const glow = useSharedValue(0);
  useEffect(() => {
    if (ready && !reduced && animate) glow.value = withRepeat(withSequence(withTiming(1, { duration: 180 }), withTiming(0.35, { duration: 220 })), -1, false);
    else { cancelAnimation(glow); glow.value = withTiming(0, { duration: 120 }); }
    return () => cancelAnimation(glow);
  }, [ready, reduced, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <View style={styles.finRow} accessible accessibilityLabel={`Power ${Math.min(power, need)} of ${need} fins`}>
      <Animated.View style={[styles.finGlow, glowStyle]} />
      {Array.from({ length: need }, (_, i) => (
        <Fin key={i} filled={i < power} bonus={i < headStart} size={size} reduced={reduced} popKey={i === power ? popKey : 0} />
      ))}
    </View>
  );
});

function Fin({ filled, bonus, size, reduced, popKey }: { filled: boolean; bonus: boolean; size: number; reduced: boolean; popKey: number }) {
  const s = useSharedValue(1);
  const lost = useSharedValue(0);
  useEffect(() => {
    if (filled && !reduced) s.value = withSequence(withTiming(1.35, { duration: 70 }), withSpring(1, { damping: 7, stiffness: 260 }));
  }, [filled, reduced, s]);
  useEffect(() => {
    if (!popKey || reduced) return;
    lost.value = 0;
    lost.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
  }, [popKey, reduced, lost]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const lostStyle = useAnimatedStyle(() => ({ opacity: lost.value > 0 && lost.value < 1 ? 1 - lost.value : 0,
    transform: [{ translateY: -lost.value * 40 }, { rotate: `${lost.value * 70}deg` }] }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: BRAND.navy,
    backgroundColor: filled ? (bonus ? BRAND.goldLight : BRAND.gold) : BRAND.sky, alignItems: 'center', justifyContent: 'center' }, style]}>
    <Image source={filled ? BASH_ART.finFull : BASH_ART.finEmpty} style={{ width: size * 0.62, height: size * 0.62, opacity: filled ? 1 : 0.55 }}
      contentFit="contain" />
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, lostStyle]}>
      <Image source={BASH_ART.finPop} style={StyleSheet.absoluteFill} contentFit="contain" />
    </Animated.View>
  </Animated.View>;
}

/**
 * The dizzy head: a clean gold bullseye (outline only, the face shows through)
 * and a white ring closing onto it. While the ring sits on the core it turns
 * gold and the core pulses: that is PERFECT (shape and motion, not colour alone).
 */
export function DizzyTarget({ x, y, size, from, until, reduced, paused, band }: {
  x: number; y: number; size: number; from: number; until: number; clock?: SharedValue<number>; reduced: boolean; paused?: boolean;
  band: readonly [number, number];
}) {
  const appear = useSharedValue(0);
  // The ring runs its own UI-thread timer, so a JS hitch never freezes the PERFECT timing.
  const prog = useSharedValue(0);
  useEffect(() => {
    appear.value = reduced ? 1 : withSpring(1, { damping: 9, stiffness: 240 });
  }, [appear, reduced]);
  useEffect(() => {
    if (paused) { cancelAnimation(prog); return; }
    const left = Math.max(1, (until - from) * (1 - prog.value));
    // The window opens after the flop (DIZZY_DROP_MS): the ring waits for it, so the gold you see is the gold that scores.
    const wait = prog.value === 0 ? DIZZY_DROP_MS : 0;
    prog.value = withDelay(wait, withTiming(1, { duration: left, easing: Easing.linear }));
    return () => cancelAnimation(prog);
  }, [from, until, paused, prog]);
  const ring = useAnimatedStyle(() => {
    const p = prog.value;
    const on = p >= band[0] && p <= band[1];
    const scale = ringScaleAt(p, band);
    return { borderColor: on ? BRAND.gold : BRAND.white, borderWidth: on ? 9 : 6, opacity: p > band[1] ? 0.55 : 1,
      transform: [{ scale: scale * appear.value }] };
  });
  const core = useAnimatedStyle(() => {
    const p = prog.value;
    const on = p >= band[0] && p <= band[1];
    return { transform: [{ scale: appear.value * (on && !reduced ? 1 + Math.sin(p * 60) * 0.06 : 1) }] };
  });
  return <View pointerEvents="none" style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }}>
    <Animated.View style={[styles.targetCore, { borderRadius: size / 2 }, core]}>
      <View style={[styles.targetInner, { borderRadius: size / 2 }]} />
    </Animated.View>
    <Animated.View style={[styles.targetRing, { borderRadius: size / 2 }, ring]} />
  </View>;
}

/** Ink on the lens: splats in, wobbles, fades away (looks only). */
export const InkSplat = memo(function InkSplat({ x, y, size, rot, life, reduced }: { x: number; y: number; size: number; rot: number; life: number; reduced: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? withSequence(withTiming(1, { duration: 60 }), withDelay(life - 400, withTiming(2, { duration: 300 })))
      : withSequence(withSpring(1, { damping: 7, stiffness: 320 }), withDelay(life - 650, withTiming(2, { duration: 450 })));
  }, [p, reduced, life]);
  const style = useAnimatedStyle(() => {
    const v = p.value;
    return { opacity: v <= 1 ? 1 : 2 - v, transform: [{ rotate: `${rot}deg` }, { scale: v <= 1 ? 0.3 + v * 0.7 : 1 + (v - 1) * 0.05 },
      { translateY: v > 1 ? (v - 1) * 18 : 0 }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }, style]}>
    <Image source={BASH_ART.ink} style={StyleSheet.absoluteFill} contentFit="contain" />
  </Animated.View>;
});

/** 3, 2, 1: the last seconds, big and short. */
export const CountBeat = memo(function CountBeat({ text, x, y, reduced }: { text: string; x: number; y: number; reduced: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? withSequence(withTiming(1, { duration: 60 }), withDelay(500, withTiming(2, { duration: 200 })))
      : withSequence(withSpring(1, { damping: 6, stiffness: 340 }), withDelay(350, withTiming(2, { duration: 260 })));
  }, [p, reduced, text]);
  const style = useAnimatedStyle(() => ({ opacity: p.value <= 1 ? p.value : 2 - p.value,
    transform: [{ scale: p.value <= 1 ? 0.4 + p.value * 0.6 : 1 + (p.value - 1) * 0.3 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - 60, top: y - 60, width: 120, height: 120,
    alignItems: 'center', justifyContent: 'center' }, style]}>
    <Text style={styles.countText} maxFontSizeMultiplier={1}>{text}</Text>
  </Animated.View>;
});

/** Stars circling a dizzy head. */
export function DizzyStars({ x, y, r, reduced }: { x: number; y: number; r: number; reduced: boolean }) {
  // Decorative idle loop: stops on Battery Saver / idle (ambient), never at normal power.
  const { ambient: animate } = usePowerBudget();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduced && animate) t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t, reduced]);
  return <View pointerEvents="none" style={{ position: 'absolute', left: x, top: y }}>
    {[0, 1, 2].map(i => <OrbitStar key={i} t={t} phase={i / 3} r={r} />)}
  </View>;
}
function OrbitStar({ t, phase, r }: { t: SharedValue<number>; phase: number; r: number }) {
  const style = useAnimatedStyle(() => {
    const a = (t.value + phase) * Math.PI * 2;
    return { transform: [{ translateX: Math.cos(a) * r - 14 }, { translateY: Math.sin(a) * r * 0.32 - 14 }, { scale: 0.8 + Math.sin(a) * 0.2 }] };
  });
  return <Animated.View style={[{ position: 'absolute', width: 28, height: 28 }, style]}>
    <Image source={BASH_ART.star} style={StyleSheet.absoluteFill} contentFit="contain" />
  </Animated.View>;
}

export type WordmarkId = keyof typeof BASH_ART.wm;

/** One hero callout at a time: a drawn wordmark that slams in and lifts away. */
export const Wordmark = memo(function Wordmark({ id, x, y, width, reduced }: { id: WordmarkId; x: number; y: number; width: number; reduced: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = reduced ? withSequence(withTiming(1, { duration: 80 }), withDelay(700, withTiming(2, { duration: 160 })))
      : withSequence(withSpring(1, { damping: 8, stiffness: 320 }), withDelay(520, withTiming(2, { duration: 220 })));
  }, [id, p, reduced]);
  const style = useAnimatedStyle(() => {
    const v = p.value;
    const scale = v <= 1 ? 0.4 + v * 0.6 : 1 + (v - 1) * 0.15;
    return { opacity: v <= 1 ? Math.min(1, v * 2) : 2 - v, transform: [{ translateY: v > 1 ? -(v - 1) * 26 : 0 }, { scale }] };
  });
  const h = width / WM_ASPECT[id];
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - width / 2, top: y - h / 2, width, height: h }, style]}>
    <Image source={BASH_ART.wm[id]} style={StyleSheet.absoluteFill} contentFit="contain" />
  </Animated.View>;
});

/** A word bubble in the house font (for words with no drawn wordmark). */
export const Bubble = memo(function Bubble({ text, x, y, tone = 'white', reduced }: { text: string; x: number; y: number; tone?: 'white' | 'gold' | 'red'; reduced: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = reduced ? withTiming(1, { duration: 80 }) : withSpring(1, { damping: 9, stiffness: 300 });
  }, [text, p, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 2), transform: [{ scale: 0.5 + p.value * 0.5 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - 120, top: y - 22, width: 240, alignItems: 'center' }, style]}>
    <View style={[styles.bubble, tone === 'gold' && styles.bubbleGold, tone === 'red' && styles.bubbleRed]}>
      <Text style={[styles.bubbleText, tone === 'white' && { color: BRAND.navy }]} maxFontSizeMultiplier={1.2}>{text}</Text>
    </View>
  </Animated.View>;
});

/** A damage number that pops at the hit and flies up to the score. */
const OUTLINE = [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5], [-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]] as const;
export const DamageNumber = memo(function DamageNumber({ text, x, y, big, badge = true, toX, toY, reduced }: {
  text: string; x: number; y: number; big: boolean; badge?: boolean; toX: number; toY: number; reduced: boolean;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? withTiming(2, { duration: 600 }) : withSequence(
      withSpring(1, { damping: 7, stiffness: 300 }),
      withDelay(big ? 260 : 90, withTiming(2, { duration: big ? 420 : 340, easing: Easing.in(Easing.cubic) })));
  }, [p, reduced, big]);
  const style = useAnimatedStyle(() => {
    const v = p.value;
    const fly = Math.max(0, v - 1);
    return {
      opacity: v < 1.85 ? 1 : (2 - v) / 0.15,
      transform: [
        { translateX: (toX - x) * fly }, { translateY: (toY - y) * fly - (v <= 1 ? v * 26 : 26 * (1 - fly)) },
        { scale: (v <= 1 ? 0.5 + v * 0.5 : 1 - fly * 0.55) * (big ? 1.6 : 1) },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - 70, top: y - 24, width: 140, alignItems: 'center' }, style]}>
    {big && badge && <Image source={BASH_ART.impactGold} style={styles.dmgBadge} contentFit="contain" />}
    {/* Hand-drawn look: a thick navy outline (8 offset copies on big hits, 4 on small ones) under the number. */}
    {(big ? OUTLINE : OUTLINE.slice(0, 4)).map(([dx, dy], i) => <Text key={i} style={[styles.dmg, styles.dmgOutline, { transform: [{ translateX: dx }, { translateY: dy }] }]}
      maxFontSizeMultiplier={1}>{text}</Text>)}
    <Text style={[styles.dmg, big && styles.dmgBig]} maxFontSizeMultiplier={1}>{text}</Text>
  </Animated.View>;
});

/** A filled fin flying in an arc from a gold tentacle into the fin row (Reduce Motion: appears at the row). */
export const FinFly = memo(function FinFly({ x, y, toX, toY, delay, size, reduced }: {
  x: number; y: number; toX: number; toY: number; delay: number; size: number; reduced: boolean;
}) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { if (!reduced) p.value = withDelay(delay, withTiming(1, { duration: 440, easing: Easing.in(Easing.quad) })); }, [p, reduced, delay]);
  const style = useAnimatedStyle(() => {
    const v = p.value;
    return { opacity: v > 0.92 ? (1 - v) / 0.08 : 1,
      transform: [{ translateX: (toX - x) * v }, { translateY: (toY - y) * v - Math.sin(v * Math.PI) * 90 }, { scale: 1.25 - v * 0.35 },
        { rotate: `${v * 360}deg` }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }, style]}>
    <Image source={BASH_ART.finFull} style={StyleSheet.absoluteFill} contentFit="contain" />
  </Animated.View>;
});

/** A one-shot sprite (impact star, splash, puff) that pops and fades. */
export const Burst = memo(function Burst({ src, x, y, size, reduced, spin = false, delay = 0 }: {
  src: number; x: number; y: number; size: number; reduced: boolean; spin?: boolean; delay?: number;
}) {
  const p = useSharedValue(0);
  // delay = hit-stop: the burst shows at its impact size and holds, then blooms.
  useEffect(() => { p.value = withDelay(delay, withTiming(1, { duration: reduced ? 200 : 360, easing: Easing.out(Easing.cubic) })); }, [p, reduced, delay]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - p.value * p.value,
    transform: [{ scale: reduced ? 1 : 0.4 + p.value * 0.9 }, { rotate: spin ? `${p.value * 40}deg` : '0deg' }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }, style]}>
    <Image source={src} style={StyleSheet.absoluteFill} contentFit="contain" />
  </Animated.View>;
});

const styles = StyleSheet.create({
  // A ripple ring at the waterline as it pops up, then gone (never a pad).
  foam: { position: 'absolute', height: 16, borderRadius: 999, borderWidth: 3, borderColor: '#ffffff', backgroundColor: 'transparent' },
  finRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  finGlow: { ...StyleSheet.absoluteFillObject, margin: -8, borderRadius: 30, backgroundColor: 'rgba(255,207,59,0.55)' },
  targetCore: { ...StyleSheet.absoluteFillObject, borderWidth: 4, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  targetInner: { ...StyleSheet.absoluteFillObject, margin: 3, borderWidth: 7, borderColor: BRAND.gold },
  targetRing: { ...StyleSheet.absoluteFillObject, borderWidth: 6 },
  countText: { fontFamily: 'Shark', fontSize: 84, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 5 },
    textShadowRadius: 0 },
  bubble: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.white },
  bubbleGold: { backgroundColor: BRAND.gold },
  bubbleRed: { backgroundColor: BRAND.red },
  bubbleText: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, letterSpacing: 0.5, textAlign: 'center' },
  dmg: { fontFamily: 'Shark', fontSize: 26, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0 },
  x2: { position: 'absolute', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 12, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.gold,
    transform: [{ rotate: '-8deg' }] },
  x2Text: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  dmgBig: { color: BRAND.white },
  dmgOutline: { position: 'absolute', color: BRAND.navy, textShadowRadius: 0, textShadowOffset: { width: 0, height: 0 } },
  dmgBadge: { position: 'absolute', width: 64, height: 64, top: -14 },
});
