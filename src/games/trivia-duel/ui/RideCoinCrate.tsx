/**
 * Ride coin showcase (design 11.9, rev 7 S1a; Clash / Brawl Stars reward
 * showcase with Star Drop glow escalation). About 3s, tap skips to the arc.
 *
 *  1. In the stage takeover the cream crate (gate-passed tv_coin_crate_v2)
 *     drops onto your podium with a 1-frame squash.
 *  2. Three beat-locked shakes (2, 4, 7px, 120ms each, 441ms apart). On a
 *     2-star run the seams glow cream from shake 2; on a 3-star run they turn
 *     gold on shake 3 and a 4th shake comes.
 *  3. Lid anticipation squash 0.9 x 1.1 (1 frame), the lid pops (open cell),
 *     a burst of 24 Alex coins and 12 sparkles.
 *  4. The ride coin (the app's own coin art for the ride, fallback Alex's
 *     coin) rises to 40% of the screen width and spins 2 turns of scaleX on
 *     twos with a shimmer rim; coin_tick on each half turn.
 *  5. Holds 400ms over a code-drawn ribbon reading RIDE COIN, stars pop one
 *     per 8th.
 *  6. Arcs to the counter (520ms outCubic); success + medium on landing.
 *
 * This is the only place coins fly in Trivia Duel. Reduced motion: the coin
 * fades in over the ribbon, no shakes and no spin.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { ART, C } from '../art';
import { OutlinedText } from './Overlays';

export interface CrateCallbacks {
  onShake?: (n: number) => void;
  onOpen?: (x: number, y: number) => void;
  onHalfTurn?: (n: number) => void;
  onTurn?: (n: number) => void;
  onStar?: (n: number) => void;
  onLand?: () => void;
  onDone?: () => void;
}

interface Props extends CrateCallbacks {
  /** Screen point of your podium top (where the crate lands). */
  podium: { x: number; y: number };
  /** Screen point of the coin counter the coin arcs to. */
  counter: { x: number; y: number };
  width: number;
  height: number;
  stars: number;
  beatMs: number;
  coin?: ImageSourcePropType | null;
  reducedMotion: boolean;
}

const CRATE_W = 118;
const CRATE_H = CRATE_W * (192 / 158);
const FRAME = 83.33;

export function RideCoinCrate({ podium, counter, width, height, stars, beatMs, coin, reducedMotion, onShake, onOpen, onHalfTurn, onTurn, onStar, onLand, onDone }: Props) {
  const crateY = useSharedValue(-height);
  const crateSX = useSharedValue(1);
  const crateSY = useSharedValue(1);
  const shakeX = useSharedValue(0);
  const glow = useSharedValue(0);
  const coinX = useSharedValue(podium.x);
  const coinY = useSharedValue(podium.y - CRATE_H * 0.5);
  const coinS = useSharedValue(0);
  const coinSX = useSharedValue(1);
  const coinO = useSharedValue(0);
  const ribbonS = useSharedValue(0);
  const crateO = useSharedValue(1);
  const [open, setOpen] = useState(false);
  const [glowColor, setGlowColor] = useState<string>(C.cream);
  const [starsShown, setStarsShown] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const skipped = useRef(false);
  const coinBig = width * 0.4;

  const at = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const arc = useCallback((startMs: number) => {
    at(startMs, () => {
      ribbonS.value = withTiming(0, { duration: 160 });
      coinX.value = withTiming(counter.x, { duration: 520, easing: Easing.out(Easing.cubic) });
      coinY.value = withSequence(
        withTiming(Math.min(coinY.value, counter.y) - 60, { duration: 220, easing: Easing.out(Easing.quad) }),
        withTiming(counter.y, { duration: 300, easing: Easing.in(Easing.quad) }),
      );
      coinS.value = withTiming(28 / coinBig, { duration: 520, easing: Easing.out(Easing.cubic) });
      crateO.value = withDelay(200, withTiming(0, { duration: 300 }));
    });
    at(startMs + 520, () => {
      onLand?.();
      coinO.value = withDelay(120, withTiming(0, { duration: 160 }));
    });
    at(startMs + 900, () => onDone?.());
  }, [at, coinBig, coinO, coinS, coinX, coinY, counter.x, counter.y, crateO, onDone, onLand, ribbonS]);

  useEffect(() => {
    const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
    if (reducedMotion) {
      setOpen(true);
      crateY.value = 0;
      coinX.value = width / 2;
      coinY.value = height * 0.38;
      coinS.value = 1;
      coinO.value = withTiming(1, { duration: 300 });
      ribbonS.value = withTiming(1, { duration: 300 });
      setStarsShown(stars);
      at(300, () => onOpen?.(podium.x, podium.y - CRATE_H * 0.5));
      arc(1400);
      return clear;
    }
    // 1. Drop with a 1-frame squash.
    crateY.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) });
    crateSX.value = withDelay(220, withSequence(withTiming(1.12, { duration: FRAME }), withSpring(1, { damping: 9, stiffness: 320 })));
    crateSY.value = withDelay(220, withSequence(withTiming(0.86, { duration: FRAME }), withSpring(1, { damping: 9, stiffness: 320 })));
    // 2. Beat-locked shakes, with Star Drop glow escalation.
    const amps = stars >= 3 ? [2, 4, 7, 9] : [2, 4, 7];
    const t0 = 220 + beatMs;
    amps.forEach((a, i) => {
      at(t0 + i * beatMs, () => {
        shakeX.value = withSequence(
          withTiming(a, { duration: 30 }), withTiming(-a, { duration: 30 }), withTiming(a * 0.6, { duration: 30 }), withTiming(0, { duration: 30 }),
        );
        if (stars >= 2 && i === 1) { setGlowColor(C.cream); glow.value = withTiming(0.8, { duration: 120 }); }
        if (stars >= 3 && i === 2) { setGlowColor(C.gold); glow.value = withSequence(withTiming(1.25, { duration: 80 }), withTiming(1, { duration: 120 })); }
        onShake?.(i);
      });
    });
    // 3. Lid anticipation, pop, burst.
    const tOpen = t0 + amps.length * beatMs;
    at(tOpen - FRAME, () => {
      crateSX.value = withTiming(0.9, { duration: FRAME });
      crateSY.value = withTiming(1.1, { duration: FRAME });
    });
    at(tOpen, () => {
      setOpen(true);
      crateSX.value = withSpring(1, { damping: 8, stiffness: 300 });
      crateSY.value = withSpring(1, { damping: 8, stiffness: 300 });
      onOpen?.(podium.x, podium.y - CRATE_H * 0.55);
      // 4. The ride coin rises to 40% of the width.
      coinO.value = 1;
      coinX.value = withTiming(width / 2, { duration: 360, easing: Easing.out(Easing.cubic) });
      coinY.value = withTiming(height * 0.36, { duration: 360, easing: Easing.out(Easing.back(1.4)) });
      coinS.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.back(1.4)) });
    });
    // 2 turns of scaleX on twos (16 frames of 83ms): a half turn every 4 frames.
    const tSpin = tOpen + 360;
    for (let f = 0; f <= 16; f++) {
      at(tSpin + f * FRAME, () => {
        coinSX.value = Math.cos((f / 8) * Math.PI * 2) || 0.04;
        if (f > 0 && f % 4 === 0) onHalfTurn?.(f / 4);
        if (f > 0 && f % 8 === 0) onTurn?.(f / 8);
      });
    }
    // 5. Hold over the ribbon, stars one per 8th.
    const tHold = tSpin + 16 * FRAME;
    at(tHold, () => { ribbonS.value = withSequence(withTiming(1.15, { duration: 100 }), withSpring(1, { damping: 9, stiffness: 300 })); });
    for (let k = 1; k <= stars; k++) at(tHold + k * (beatMs / 2), () => { setStarsShown(k); onStar?.(k); });
    // 6. Arc to the counter.
    arc(tHold + Math.max(400, stars * (beatMs / 2) + 120));
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = useCallback(() => {
    if (skipped.current) return;
    skipped.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setOpen(true);
    crateY.value = 0;
    coinO.value = 1;
    coinSX.value = 1;
    coinX.value = width / 2;
    coinY.value = height * 0.36;
    coinS.value = 1;
    setStarsShown(stars);
    arc(0);
  }, [arc, coinO, coinS, coinSX, coinX, coinY, crateY, height, stars, width]);

  const crateStyle = useAnimatedStyle(() => ({
    opacity: crateO.value,
    transform: [{ translateX: shakeX.value }, { translateY: crateY.value }, { scaleX: crateSX.value }, { scaleY: crateSY.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, glow.value), transform: [{ scale: 0.9 + 0.15 * glow.value }] }));
  const coinStyle = useAnimatedStyle(() => ({
    opacity: coinO.value,
    transform: [{ translateX: coinX.value - coinBig / 2 }, { translateY: coinY.value - coinBig / 2 }, { scale: coinS.value }, { scaleX: coinSX.value }],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: Math.abs(coinSX.value) > 0.9 ? 0.85 : 0.2 }));
  const ribbonStyle = useAnimatedStyle(() => ({ opacity: ribbonS.value > 0.02 ? 1 : 0, transform: [{ scale: ribbonS.value }] }));

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityLabel="Skip to your ride coin">
      <Animated.View style={[styles.crate, { left: podium.x - CRATE_W / 2, top: podium.y - CRATE_H }, crateStyle]} pointerEvents="none">
        <Animated.View style={[styles.glow, { backgroundColor: glowColor }, glowStyle]} />
        <Image source={open ? ART.crateOpen : ART.crateClosed} style={{ width: CRATE_W, height: CRATE_H }} resizeMode="contain" />
      </Animated.View>
      <Animated.View style={[styles.ribbon, { top: height * 0.36 + coinBig * 0.38 }, ribbonStyle]} pointerEvents="none">
        <Image source={ART.ribbon} style={styles.ribbonImg} resizeMode="stretch" />
        <OutlinedText text="RIDE COIN" size={24} color="#ffffff" width={2} style={styles.ribbonText} />
        <View style={styles.stars}>
          {[1, 2, 3].map((k) => (
            <View key={k} style={[styles.star, k <= starsShown ? styles.starOn : styles.starOff]} />
          ))}
        </View>
      </Animated.View>
      <Animated.View style={[styles.coin, { width: coinBig, height: coinBig }, coinStyle]} pointerEvents="none">
        <Image source={coin ?? ART.coin} style={{ width: coinBig, height: coinBig, borderRadius: coinBig / 2 }} resizeMode="contain" />
        <Animated.View style={[styles.shimmer, { width: coinBig, height: coinBig, borderRadius: coinBig / 2 }, shimmerStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  crate: { position: 'absolute', width: CRATE_W, height: CRATE_H, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: CRATE_W * 1.25, height: CRATE_H * 0.9, borderRadius: 40 },
  coin: { position: 'absolute', left: 0, top: 0 },
  shimmer: { position: 'absolute', left: 0, top: 0, borderWidth: 5, borderColor: '#fff6c8' },
  ribbon: { position: 'absolute', alignSelf: 'center', width: 300, height: 92, alignItems: 'center' },
  ribbonImg: { position: 'absolute', width: 300, height: 64 },
  ribbonText: { marginTop: 12 },
  stars: { position: 'absolute', top: 62, flexDirection: 'row' },
  star: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: C.ink, marginHorizontal: 4, transform: [{ rotate: '45deg' }] },
  starOn: { backgroundColor: C.gold },
  starOff: { backgroundColor: C.cream },
});
