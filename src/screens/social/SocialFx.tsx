/**
 * Social moments (UI thread, Reduce Motion aware):
 * - Burst: a ring of stars and hearts that pops out of a point (a new friend).
 * - FlyHeart: a heart that arcs from the button to the friend's shark and
 *   lands with a coin sparkle (a heart sent).
 * - SharkFace: a player's own shark from the server composite, one image
 *   instead of 3 to 8 live layers, recycle-safe, with a silhouette placeholder.
 */
import { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Avatar, { DEFAULT_PORTRAIT } from '../../components/Avatar';
import type { PlayerType } from '../../models/player-type';
import GameIcon from '../../ui/GameIcon';
import type { GameIconName } from '../../ui/iconNames';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { INK } from './SocialKit';

const PIECES: readonly { icon: GameIconName; angle: number; dist: number; size: number }[] = Array.from({ length: 10 }, (_, i) => ({
  icon: (i % 3 === 0 ? 'heart' : i % 3 === 1 ? 'star' : 'sparkle') as GameIconName,
  angle: (Math.PI * 2 * i) / 10 + (i % 2 ? 0.2 : -0.1),
  dist: 46 + (i % 3) * 14,
  size: 18 + (i % 2) * 6,
}));

function Piece({ icon, angle, dist, size, delay, big }: { icon: GameIconName; angle: number; dist: number; size: number; delay: number; big: number }) {
  const t = useSharedValue(0);
  dist *= big;
  size = Math.round(size * (0.8 + 0.25 * big));
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 650 + 250 * big, easing: Easing.out(Easing.cubic) }));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
    transform: [
      { translateX: Math.cos(angle) * dist * t.value },
      { translateY: Math.sin(angle) * dist * t.value - 10 * t.value },
      { scale: 0.4 + 0.8 * Math.min(1, t.value * 2) },
      { rotate: `${angle * 40 * t.value}deg` },
    ],
  }));
  return <Animated.View style={[styles.piece, style]}><GameIcon name={icon} size={size} /></Animated.View>;
}

/** Pops once where it is mounted; with Reduce Motion it draws nothing. */
export const Burst = memo(function Burst({ style, onDone, big = 1 }: { readonly style?: StyleProp<ViewStyle>; readonly onDone?: () => void; readonly big?: number }) {
  const reduced = useUiReducedMotion();
  const ring = useSharedValue(0);
  useEffect(() => {
    if (reduced) { const t = setTimeout(() => onDone?.(), 900); return () => clearTimeout(t); }
    ring.value = withSequence(withTiming(1, { duration: 380 }), withTiming(2, { duration: 380 + 300 * (big - 1) }, f => { if (f && onDone) runOnJS(onDone)(); }));
    return undefined;
  }, [reduced, ring, onDone]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value < 1 ? 0.9 : 0.9 * (2 - ring.value),
    transform: [{ scale: (0.3 + 0.9 * Math.min(1, ring.value)) * big }],
  }));
  return (
    <View pointerEvents="none" style={[styles.burst, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {/* Reduce Motion: no burst; the green card and "New friend!" carry the moment. */}
      {reduced ? null : (
        <>
          <Animated.View style={[styles.ring, ringStyle]} />
          {(big > 1 ? [...PIECES, ...PIECES.map(p => ({ ...p, angle: p.angle + 0.3, dist: p.dist * 0.6 }))] : PIECES)
            .map((p, i) => <Piece key={i} {...p} big={big} delay={i * 6} />)}
        </>
      )}
    </View>
  );
});

/** A heart that flies from (0,0) to (dx,dy) on an arc, then a coin sparkle. */
export const FlyHeart = memo(function FlyHeart({ dx, dy, onDone }: { readonly dx: number; readonly dy: number; readonly onDone: () => void }) {
  const reduced = useUiReducedMotion();
  const t = useSharedValue(0);
  const land = useSharedValue(0);
  useEffect(() => {
    if (reduced) { onDone(); return; }
    t.value = withTiming(1, { duration: 560, easing: Easing.inOut(Easing.quad) }, f => {
      if (!f) return;
      land.value = withSequence(withSpring(1, { damping: 8, stiffness: 260 }), withTiming(0, { duration: 260 }, g => { if (g) runOnJS(onDone)(); }));
    });
  }, [reduced, t, land, onDone]);
  const heart = useAnimatedStyle(() => ({
    opacity: t.value < 0.95 ? 1 : 0,
    transform: [
      { translateX: dx * t.value },
      { translateY: dy * t.value - 70 * Math.sin(Math.PI * t.value) },
      { scale: 1 + 0.5 * Math.sin(Math.PI * t.value) },
    ],
  }));
  const coin = useAnimatedStyle(() => ({
    opacity: land.value,
    transform: [{ translateX: dx }, { translateY: dy - 6 - 18 * land.value }, { scale: 0.6 + 0.6 * land.value }],
  }));
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={styles.fly}>
      <Animated.View style={heart}><GameIcon name="heart" size={30} /></Animated.View>
      <Animated.View style={[styles.flyCoin, coin]}><GameIcon name="coin" size={24} /></Animated.View>
    </View>
  );
});

/**
 * A player's own shark. Lists use the server composite (one image, recycled
 * by player id); without one it falls back to the live layers.
 */
export const SharkFace = memo(function SharkFace({ player, size = 60, ring = true }: { readonly player: PlayerType; readonly size?: number; readonly ring?: boolean }) {
  const url = player.avatar_url;
  const composite = typeof url === 'string' && url.length > 0;
  return (
    <View style={[ring && styles.faceRing, { width: size + (ring ? 8 : 0), height: size + (ring ? 8 : 0), borderRadius: 999 }]}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#BFE5FF' }}>
        {composite ? (
          <Image source={{ uri: url }} recyclingKey={String(player.id)} placeholder={DEFAULT_PORTRAIT} placeholderContentFit="contain"
            contentFit="cover" contentPosition="top" transition={120} style={{ width: size, height: size * 1.12 }} accessibilityIgnoresInvertColors />
        ) : (
          <View style={{ marginLeft: -2, marginTop: -2 }}><Avatar player={player} size={size >= 70 ? 'lg' : 'md'} /></View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  burst: { position: 'absolute', width: 1, height: 1, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },
  ring: { position: 'absolute', width: 90, height: 90, borderRadius: 45, borderWidth: 5, borderColor: '#FFCF3B' },
  fly: { position: 'absolute', left: 0, top: 0 },
  flyCoin: { position: 'absolute', left: 2, top: 2 },
  faceRing: { borderWidth: 3, borderColor: INK, backgroundColor: '#BFE5FF', alignItems: 'center', justifyContent: 'center' },
});

/** A shark that hops in its circle: up, squash on landing, settle (a new friend). */
export function useHop(active: boolean) {
  const reduced = useUiReducedMotion();
  const y = useSharedValue(0);
  const sq = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) return;
    y.value = withSequence(withTiming(-14, { duration: 160, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }),
      withTiming(-7, { duration: 120 }), withTiming(0, { duration: 120 }));
    sq.value = withDelay(320, withSequence(withTiming(1, { duration: 70 }), withSpring(0, { damping: 6, stiffness: 300 })));
  }, [active, reduced, y, sq]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scaleX: 1 + 0.12 * sq.value }, { scaleY: 1 - 0.12 * sq.value }] }));
}
