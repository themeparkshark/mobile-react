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
import type { Kind } from './rules';

export type ActorExit = null | 'bonk' | 'sink' | 'ouch' | 'dive';

/** One tentacle (or puffer) rising out of the water in its spot. */
export const PopupActor = memo(function PopupActor({ kind, x, baseY, height, limb, limbAspect, exit, reduced, ghostly, hint }: {
  kind: Kind; x: number; baseY: number; height: number; limb: number; limbAspect: number; exit: ActorExit; reduced: boolean;
  ghostly: boolean; hint: boolean;
}) {
  const rise = useSharedValue(reduced ? 1 : 0);
  const sway = useSharedValue(0);
  const squash = useSharedValue(1);
  const flash = useSharedValue(0);
  const foam = useSharedValue(0);
  const isPuffer = kind === 'puffer';
  const w = isPuffer ? height * 0.62 : height * limbAspect;
  const h = isPuffer ? height * 0.56 : height;

  useEffect(() => {
    if (reduced) { rise.value = withTiming(1, { duration: 120 }); return; }
    rise.value = withSpring(1, { damping: 11, stiffness: 190, mass: 0.7 });
    foam.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0.55, { duration: 400 }));
    sway.value = withDelay(220, withRepeat(withTiming(1, { duration: isPuffer ? 520 : 820, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => { cancelAnimation(sway); cancelAnimation(rise); };
  }, [reduced, rise, sway, foam, isPuffer]);

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
  const limbSrc = isPuffer ? BASH_ART.puffer : limb;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x - w / 2, top: baseY - h - (isPuffer ? h * 0.25 : 0), width: w, height: h + (isPuffer ? h * 0.25 : 0) }}>
      <View style={{ position: 'absolute', left: -w, width: w * 3, top: -h * 0.2, height: h * 1.2 + (isPuffer ? h * 0.25 : 0), overflow: 'hidden' }}>
        <Animated.View style={[{ position: 'absolute', left: w, top: h * 0.2 + (isPuffer ? h * 0.12 : 0), width: w, height: h }, body]}>
          <Image source={limbSrc} style={StyleSheet.absoluteFill} contentFit="contain" />
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
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduced) t.value = withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(0, { duration: 420 })), -1, false);
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
  const glow = useSharedValue(0);
  useEffect(() => {
    if (ready && !reduced) glow.value = withRepeat(withSequence(withTiming(1, { duration: 180 }), withTiming(0.35, { duration: 220 })), -1, false);
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

/** The dizzy head: a gold target with a closing ring. Gold ring = PERFECT. */
export function DizzyTarget({ x, y, size, from, until, clock, reduced }: {
  x: number; y: number; size: number; from: number; until: number; clock: SharedValue<number>; reduced: boolean;
}) {
  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = reduced ? 1 : withSpring(1, { damping: 9, stiffness: 240 });
  }, [appear, reduced]);
  const ring = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (clock.value - from) / Math.max(1, until - from)));
    const gold = p <= 0.42;
    return { borderColor: gold ? BRAND.gold : BRAND.white, opacity: 0.95 - p * 0.35,
      transform: [{ scale: (reduced ? 1 : 2.1 - p * 1.1) * appear.value }] };
  });
  const core = useAnimatedStyle(() => ({ transform: [{ scale: appear.value }] }));
  return <View pointerEvents="none" style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }}>
    <Animated.View style={[styles.targetCore, { borderRadius: size / 2 }, core]} />
    <Animated.View style={[styles.targetRing, { borderRadius: size / 2 }, ring]} />
  </View>;
}

/** Stars circling a dizzy head. */
export function DizzyStars({ x, y, r, reduced }: { x: number; y: number; r: number; reduced: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduced) t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
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
export function Wordmark({ id, x, y, width, reduced }: { id: WordmarkId; x: number; y: number; width: number; reduced: boolean }) {
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
}

/** A word bubble in the house font (for words with no drawn wordmark). */
export function Bubble({ text, x, y, tone = 'white', reduced }: { text: string; x: number; y: number; tone?: 'white' | 'gold' | 'red'; reduced: boolean }) {
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
}

/** A damage number that pops at the hit and flies up to the score. */
export const DamageNumber = memo(function DamageNumber({ text, x, y, big, toX, toY, reduced }: {
  text: string; x: number; y: number; big: boolean; toX: number; toY: number; reduced: boolean;
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
    <Text style={[styles.dmg, big && styles.dmgBig]} maxFontSizeMultiplier={1}>{text}</Text>
  </Animated.View>;
});

/** A one-shot sprite (impact star, splash, puff) that pops and fades. */
export const Burst = memo(function Burst({ src, x, y, size, reduced, spin = false }: {
  src: number; x: number; y: number; size: number; reduced: boolean; spin?: boolean;
}) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(1, { duration: reduced ? 200 : 360, easing: Easing.out(Easing.cubic) }); }, [p, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - p.value * p.value,
    transform: [{ scale: reduced ? 1 : 0.4 + p.value * 0.9 }, { rotate: spin ? `${p.value * 40}deg` : '0deg' }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }, style]}>
    <Image source={src} style={StyleSheet.absoluteFill} contentFit="contain" />
  </Animated.View>;
});

const styles = StyleSheet.create({
  foam: { position: 'absolute', height: 14, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.28)' },
  finRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  finGlow: { ...StyleSheet.absoluteFillObject, margin: -8, borderRadius: 30, backgroundColor: 'rgba(255,207,59,0.55)' },
  targetCore: { ...StyleSheet.absoluteFillObject, borderWidth: 5, borderColor: BRAND.navy, backgroundColor: 'rgba(255,207,59,0.45)' },
  targetRing: { ...StyleSheet.absoluteFillObject, borderWidth: 6 },
  bubble: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.white },
  bubbleGold: { backgroundColor: BRAND.gold },
  bubbleRed: { backgroundColor: BRAND.red },
  bubbleText: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, letterSpacing: 0.5, textAlign: 'center' },
  dmg: { fontFamily: 'Shark', fontSize: 26, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0 },
  dmgBig: { color: BRAND.gold },
});
