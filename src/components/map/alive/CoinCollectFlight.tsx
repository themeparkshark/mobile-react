/**
 * The collect moment: after a ride win, back on the map, the ride's coin pops
 * up out of its island with a ring of sparkles, arcs across the screen trailing
 * stars, and lands on the player's shelf button (the avatar), which gulps it
 * with a bounce, a ring and a chime. One progress value on the UI thread drives
 * the whole flight. Reduce Motion skips the flight: the coin simply appears on
 * the shelf button with its label.
 */
import { Image } from 'expo-image';
import { memo, useContext, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { SoundEffectContext } from '../../../context/SoundEffectProvider';
import { haptic } from '../../../gamekit/Haptics';
import { BRAND } from '../../../ui';
import { flightPoint, type Point } from './presence';

const RIDE_COIN = require('../../../../assets/images/map/ride-coin.png');
const SPARKLE = require('../../../../assets/images/map/fx/sparkle.png');
const LAND_SOUND = require('../../../../assets/sounds/purchase_item_success.mp3');

const TOTAL_MS = 1500;
// Phases as fractions of the timeline: pop out, hang, fly, land.
const POP = 0.18;
const HANG = 0.26;
const LAND = 0.78;
const COIN = 44;

function TrailStar({ p, from, to, lag, size }: { p: SharedValue<number>; from: Point; to: Point; lag: number; size: number }) {
  const style = useAnimatedStyle(() => {
    const f = (p.value - HANG) / (LAND - HANG) - lag;
    if (f <= 0 || f >= 1) return { opacity: 0 };
    const at = flightPoint({ x: from.x, y: from.y - 56 }, to, f);
    return { opacity: (1 - lag * 4) * Math.sin(f * Math.PI), transform: [{ translateX: at.x - size / 2 }, { translateY: at.y - size / 2 }, { rotate: `${f * 200}deg` }] };
  });
  return <Animated.Image source={SPARKLE} tintColor="#ffe27a" resizeMode="contain" style={[styles.abs, { width: size, height: size }, style]} />;
}

function Ring({ p, at, start, color }: { p: SharedValue<number>; at: Point; start: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const f = (p.value - start) / 0.2;
    if (f <= 0 || f >= 1) return { opacity: 0 };
    return { opacity: 1 - f, transform: [{ translateX: at.x - 30 }, { translateY: at.y - 30 }, { scale: 0.4 + f * 1.3 }] };
  });
  return <Animated.View style={[styles.abs, styles.ring, { borderColor: color }, style]} />;
}

export const CoinCollectFlight = memo(function CoinCollectFlight({ from, to, coinUrl, label, reducedMotion, onLand, onDone }: {
  readonly from: Point;
  readonly to: Point;
  readonly coinUrl?: string | null;
  /** Shown by the shelf button as the coin lands. */
  readonly label?: string | null;
  readonly reducedMotion: boolean;
  readonly onLand?: () => void;
  readonly onDone: () => void;
}) {
  const { playSound } = useContext(SoundEffectContext);
  const p = useSharedValue(reducedMotion ? LAND : 0);
  const tag = useSharedValue(0);
  useEffect(() => {
    const flight = reducedMotion ? 0 : TOTAL_MS * LAND;
    p.value = withTiming(1, { duration: reducedMotion ? 600 : TOTAL_MS, easing: Easing.linear });
    tag.value = withDelay(flight, withSequence(withTiming(1, { duration: 220 }), withDelay(1100, withTiming(0, { duration: 300 }))));
    const land = setTimeout(() => {
      haptic('success');
      void playSound(LAND_SOUND, { volume: 0.55, rate: 1.15 });
      onLand?.();
    }, flight);
    const done = setTimeout(onDone, flight + 1700);
    return () => { clearTimeout(land); clearTimeout(done); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coin = useAnimatedStyle(() => {
    const v = p.value;
    let x = from.x; let y = from.y; let scale = 1; let spin = 1;
    if (v < POP) {
      const k = v / POP;
      const ease = 1 - (1 - k) * (1 - k);
      y = from.y - 56 * ease;
      scale = 0.3 + 1.3 * ease;
      spin = Math.cos(k * Math.PI * 4);
    } else if (v < HANG) {
      y = from.y - 56 + Math.sin(((v - POP) / (HANG - POP)) * Math.PI) * -4;
      scale = 1.6;
    } else if (v < LAND) {
      const k = (v - HANG) / (LAND - HANG);
      const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const at = flightPoint({ x: from.x, y: from.y - 56 }, to, eased);
      x = at.x; y = at.y;
      scale = 1.6 - 1.05 * eased;
      spin = Math.cos(eased * Math.PI * 6);
    } else {
      const k = (v - LAND) / (1 - LAND);
      x = to.x; y = to.y;
      scale = 0.55 * (1 - k);
    }
    return { opacity: v >= 0.97 ? 0 : 1, transform: [{ translateX: x - COIN / 2 }, { translateY: y - COIN / 2 }, { scaleX: scale * (0.25 + 0.75 * Math.abs(spin)) }, { scaleY: scale }] };
  });
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tag.value,
    transform: [{ translateX: to.x - 90 }, { translateY: to.y - 74 - tag.value * 10 }, { scale: 0.8 + tag.value * 0.2 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {!reducedMotion && <Ring p={p} at={{ x: from.x, y: from.y - 40 }} start={0.02} color={BRAND.gold} />}
      {!reducedMotion && [0, 0.06, 0.12, 0.18].map((lag, i) => (
        <TrailStar key={lag} p={p} from={from} to={to} lag={lag} size={18 - i * 3} />
      ))}
      <Ring p={p} at={to} start={LAND} color={BRAND.white} />
      <Ring p={p} at={to} start={LAND + 0.04} color={BRAND.gold} />
      <Animated.View style={[styles.abs, styles.coin, coin]}>
        <Image source={coinUrl ? { uri: coinUrl } : RIDE_COIN} style={styles.coinImage} contentFit="contain" />
      </Animated.View>
      {label ? <Animated.View style={[styles.abs, styles.tag, tagStyle]}>
        <Text style={styles.tagText} numberOfLines={1}>{label}</Text>
      </Animated.View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  coin: { width: COIN, height: COIN },
  coinImage: { width: COIN, height: COIN },
  ring: { width: 60, height: 60, borderRadius: 30, borderWidth: 4 },
  tag: { width: 180, alignItems: 'center' },
  tagText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy, backgroundColor: BRAND.gold, overflow: 'hidden',
    borderRadius: 10, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 10, paddingVertical: 3 },
});
