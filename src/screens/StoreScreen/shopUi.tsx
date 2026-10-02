/**
 * Shared Shark Shop v2 pieces: the per-pill clock, timer pills, rarity
 * backplates, the set piece strip and a small burst. Kept here so the shelf,
 * tiles and try-on stay in one visual language.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import type { Pill, PieceState } from '../../helpers/shopShelves';
import type { ShopSetPiece } from '../../models/shop-today';
import { BRAND, FONT, GameIcon, type GameIconName } from '../../ui';

/** Max Dynamic Type growth inside tiles and pills, so a big font never breaks a tile. */
export const MAX_FONT = 1.3;

/**
 * Server-clock "now" that ticks on the minute boundary. Each pill owns its
 * own tick, so a tick re-renders one pill, never the shelf.
 */
export function useShopNow(offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now() + offsetMs);
    tick();
    const toBoundary = 60_000 - ((Date.now() + offsetMs) % 60_000) + 50;
    const timeout = setTimeout(() => { tick(); interval = setInterval(tick, 60_000); }, toBoundary);
    return () => { clearTimeout(timeout); if (interval) clearInterval(interval); };
  }, [offsetMs]);
  return now;
}

/** Rarity backplates (top to bottom), Fortnite-style but in Alex's palette. */
export const RARITY_PLATE: Record<number, [string, string]> = {
  1: ['#f1f6fb', '#cfdfee'],
  2: ['#e6f6ff', '#b8e4fb'],
  3: ['#f6e8fb', '#dcb6ec'],
  4: ['#fff1e2', '#ffc58f'],
  5: ['#fff7cf', '#ffd94a'],
};

export function plateFor(rarity: number | undefined): [string, string] {
  return RARITY_PLATE[rarity && rarity >= 1 && rarity <= 5 ? rarity : 1];
}

export const TimerPill = memo(function TimerPill({ pill, still, icon = 'timer', light = false }: {
  pill: Pill; still: boolean; icon?: GameIconName; light?: boolean;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!pill.urgent || still) { pulse.value = 1; return; }
    pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 560 }), withTiming(1, { duration: 560 })), -1, false);
    return () => { pulse.value = 1; };
  }, [pill.urgent, still]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View accessible accessibilityRole="timer" accessibilityLabel={pill.a11y}
      style={[styles.pill, { backgroundColor: pill.urgent ? BRAND.red : light ? 'rgba(255,255,255,0.92)' : 'rgba(5,52,110,0.84)' }, style]}>
      <GameIcon name={icon} size={15} />
      <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.pillText, { color: pill.urgent ? BRAND.white : light ? BRAND.navy : BRAND.white }]}>
        {pill.label}
      </Text>
    </Animated.View>
  );
});

/** Wishlist heart: a full-opacity pink outline when off, solid pink when on (Alex's outline weight). */
export function WishHeart({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21.2s-7.6-4.6-9.6-9.3C1 8.6 3 4.8 6.6 4.8c2.1 0 3.5 1.2 4.4 2.5.9-1.3 2.3-2.5 4.4-2.5 3.6 0 5.6 3.8 4.2 7.1-2 4.7-9.6 9.3-9.6 9.3z"
        fill={on ? '#ff4f8b' : '#ffffff'} stroke={on ? '#c2185b' : '#ff4f8b'} strokeWidth={2.4} strokeLinejoin="round" />
    </Svg>
  );
}

/** A set piece chip: owned (full color + tick), on the shelf today (tap), away (silhouette, comes back). */
export const PieceChip = memo(function PieceChip({ piece, state, size = 58, selected = false, trying = false, onPress }: {
  piece: ShopSetPiece; state: PieceState; size?: number; selected?: boolean;
  /** The item this try-on is about: a gold outline and a TRYING label. */
  trying?: boolean; onPress?: (piece: ShopSetPiece) => void;
}) {
  const away = state === 'away';
  const label = `${piece.name}, ${state === 'owned' ? 'owned' : state === 'in_shop' ? 'in the shop today' : 'comes back later'}`;
  return (
    <Pressable disabled={!onPress} onPress={() => onPress?.(piece)} accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={label} accessibilityState={{ selected }}
      style={[styles.piece, { width: size, height: size },
        state === 'owned' && styles.pieceOwned, selected && styles.pieceOn, away && styles.pieceAway, trying && styles.pieceTrying]}>
      {piece.icon_url ? (
        <Image source={piece.icon_thumb_url ?? piece.icon_url} recyclingKey={`piece-${piece.id}`} cachePolicy="memory-disk"
          style={{ width: size * 0.74, height: size * 0.74, opacity: away ? 0.55 : 1 }} contentFit="contain"
          tintColor={away ? '#8aa0b8' : undefined} />
      ) : null}
      {state === 'owned' && <View style={styles.pieceBadge}><GameIcon name="check" size={18} /></View>}
      {away && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.pieceAwayText}>LATER</Text>}
      {trying && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.pieceTryingText}>TRYING</Text>}
    </Pressable>
  );
});

/** A one-shot burst of dots in a colour (purchase land, heart pop). Nothing renders under Reduce Motion. */
export function Burst({ color, still, size = 160, count = 14, trigger }: {
  color: string; still: boolean; size?: number; count?: number; trigger: number;
}) {
  if (still || !trigger) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {Array.from({ length: count }, (_, i) => (
        <BurstDot key={`${trigger}-${i}`} angle={(i / count) * Math.PI * 2} distance={size / 2} color={i % 3 === 0 ? BRAND.gold : color} />
      ))}
    </View>
  );
}

function BurstDot({ angle, distance, color }: { angle: number; distance: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }); }, []);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [
      { translateX: Math.cos(angle) * distance * t.value },
      { translateY: Math.sin(angle) * distance * t.value },
      { scale: 1.2 - t.value * 0.6 },
    ],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** One diagonal sheen sweep (Epic tiles, the "complete the look" CTA). Runs once, never loops off screen. */
export function Sheen({ still, delay = 300, width = 140 }: { still: boolean; delay?: number; width?: number }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    if (still) return;
    x.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }));
  }, [still]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * width }, { rotate: '20deg' }] }));
  if (still) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.sheen, style]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontFamily: FONT.display, fontSize: 13 },
  piece: { borderRadius: 14, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#d7e6f5' },
  pieceOwned: { borderColor: BRAND.green, backgroundColor: '#effbf2' },
  pieceOn: { borderColor: BRAND.gold, backgroundColor: '#fff6d6' },
  pieceAway: { borderStyle: 'dashed', backgroundColor: '#f2f5f9' },
  pieceBadge: { position: 'absolute', top: -7, right: -7 },
  pieceTrying: { borderColor: BRAND.gold, borderWidth: 3.5 },
  pieceTryingText: { position: 'absolute', bottom: -9, backgroundColor: BRAND.gold, borderRadius: 5, paddingHorizontal: 4,
    fontFamily: FONT.display, fontSize: 9, color: BRAND.navy, overflow: 'hidden' },
  pieceAwayText: { position: 'absolute', bottom: 2, fontFamily: FONT.display, fontSize: 9, color: '#6f849c', letterSpacing: 0.5 },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  sheen: { position: 'absolute', top: -40, bottom: -40, width: 46, left: -46 },
  plinthWrap: { position: 'absolute', left: '14%', right: '14%', bottom: '3%', aspectRatio: 200 / 64 },
  rays: { position: 'absolute', alignSelf: 'center', top: '-25%', width: '150%', aspectRatio: 1, left: '-25%' },
  arcCoin: { position: 'absolute', left: 0, top: 0 },
  flash: { position: 'absolute', width: 240, height: 240 },
  ring: { borderRadius: 120, borderWidth: 10 },
});


/**
 * One stage kit for the hero, try-on and reveal (Alex style): a sky or the
 * worn backdrop, a soft radial light, a cel-shaded round plinth with a rarity
 * rim light, and a contact shadow where the tail meets the plinth. Children
 * (the Playercard) render between the plinth and the light.
 */
export const ShopStage = memo(function ShopStage({ rim, backdropUrl, tone = 'sky', rays = false, still, children }: {
  rim: string; backdropUrl?: string | null; tone?: 'sky' | 'night'; rays?: boolean; still: boolean; children?: React.ReactNode;
}) {
  const sky = tone === 'night' ? ['#0f3b7a', '#0a2a5c'] as const : ['#dff3ff', '#9fd6f8'] as const;
  return (
    <View style={StyleSheet.absoluteFill}>
      {backdropUrl ? (
        <Image source={backdropUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <LinearGradient colors={[...sky]} style={StyleSheet.absoluteFill} />
      )}
      {rays && <Rays still={still} />}
      {/* Soft light: white core fading to the rarity colour, never a flat disc. */}
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="light" cx="50%" cy="46%" r="46%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={tone === 'night' ? 0.55 : 0.75} />
            <Stop offset="0.65" stopColor={rim} stopOpacity={0.22} />
            <Stop offset="1" stopColor={rim} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="46" rx="46" ry="44" fill="url(#light)" />
      </Svg>
      <View pointerEvents="none" style={styles.plinthWrap}>
        <Svg width="100%" height="100%" viewBox="0 0 200 64">
          <Ellipse cx="100" cy="36" rx="94" ry="24" fill="#2f6ea6" stroke="#05346e" strokeWidth={3} />
          <Ellipse cx="100" cy="27" rx="94" ry="22" fill="#cfe8fa" stroke="#05346e" strokeWidth={3} />
          <Path d="M10 27 A90 20 0 0 1 190 27" fill="none" stroke={rim} strokeWidth={4} strokeOpacity={0.95} />
          <Ellipse cx="100" cy="29" rx="78" ry="15" fill="#e8f5ff" />
          {/* Contact shadow under the tail (right of centre, where the tail rests). */}
          <Ellipse cx="116" cy="29" rx="34" ry="7" fill="#05346e" fillOpacity={0.24} />
        </Svg>
      </View>
      {children}
    </View>
  );
});

function Rays({ still }: { still: boolean }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    spin.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => { spin.value = 0; };
  }, [still]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const b = a + Math.PI / 24;
    return `M100 100 L${100 + Math.cos(a) * 140} ${100 + Math.sin(a) * 140} L${100 + Math.cos(b) * 140} ${100 + Math.sin(b) * 140} Z`;
  }).join(' ');
  return (
    <Animated.View pointerEvents="none" style={[styles.rays, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 200 200"><Path d={rays} fill="#ffffff" fillOpacity={0.09} /></Svg>
    </Animated.View>
  );
}

/** Coins arc from the balance pill into the stage (the purchase payoff). */
export function CoinArc({ from, to, count = 7, still, trigger }: {
  from: { x: number; y: number }; to: { x: number; y: number }; count?: number; still: boolean; trigger: number;
}) {
  if (still || !trigger) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => <ArcCoin key={`${trigger}-${i}`} i={i} from={from} to={to} />)}
    </View>
  );
}

function ArcCoin({ i, from, to }: { i: number; from: { x: number; y: number }; to: { x: number; y: number } }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(i * 55, withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) })); }, []);
  const lift = 80 + (i % 3) * 22;
  const style = useAnimatedStyle(() => {
    const x = from.x + (to.x - from.x) * t.value + (i - 3) * 6 * t.value;
    const y = from.y + (to.y - from.y) * t.value - lift * 4 * t.value * (1 - t.value);
    return { opacity: t.value < 0.95 ? 1 : (1 - t.value) * 20, transform: [{ translateX: x - 11 }, { translateY: y - 11 }, { scale: 1 - t.value * 0.35 }] };
  });
  return <Animated.View style={[styles.arcCoin, style]}><GameIcon name="coin" size={22} /></Animated.View>;
}

/** A rarity ring and starburst that flash behind the shark when a piece lands. */
export function LandFlash({ color, still, trigger }: { color: string; still: boolean; trigger: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still || !trigger) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [trigger]);
  const ring = useAnimatedStyle(() => ({ opacity: t.value === 0 ? 0 : 1 - t.value, transform: [{ scale: 0.4 + t.value * 1.3 }] }));
  const burst = useAnimatedStyle(() => ({ opacity: t.value === 0 ? 0 : Math.max(0, 1 - t.value * 1.4), transform: [{ scale: 0.6 + t.value * 0.9 }, { rotate: `${t.value * 40}deg` }] }));
  if (still || !trigger) return null;
  const star = Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 === 0 ? 96 : 52;
    const a = (i / 16) * Math.PI * 2;
    return `${i === 0 ? 'M' : 'L'}${100 + Math.cos(a) * r} ${100 + Math.sin(a) * r}`;
  }).join(' ') + ' Z';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={[styles.flash, burst]}>
        <Svg width="100%" height="100%" viewBox="0 0 200 200"><Path d={star} fill={color} fillOpacity={0.55} /></Svg>
      </Animated.View>
      <Animated.View style={[styles.flash, styles.ring, { borderColor: color }, ring]} />
    </View>
  );
}
