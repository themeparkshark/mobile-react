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
  1: ['#ffffff', '#e9f3fb'],
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

/** A set piece chip: owned (full color + tick), on the shelf today (tap), away (silhouette, comes back). */
export const PieceChip = memo(function PieceChip({ piece, state, size = 58, selected = false, onPress }: {
  piece: ShopSetPiece; state: PieceState; size?: number; selected?: boolean; onPress?: (piece: ShopSetPiece) => void;
}) {
  const away = state === 'away';
  const label = `${piece.name}, ${state === 'owned' ? 'owned' : state === 'in_shop' ? 'in the shop today' : 'comes back later'}`;
  return (
    <Pressable disabled={!onPress} onPress={() => onPress?.(piece)} accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={label} accessibilityState={{ selected }}
      style={[styles.piece, { width: size, height: size },
        state === 'owned' && styles.pieceOwned, selected && styles.pieceOn, away && styles.pieceAway]}>
      {piece.icon_url ? (
        <Image source={piece.icon_url} recyclingKey={`piece-${piece.id}`} cachePolicy="memory-disk"
          style={{ width: size * 0.74, height: size * 0.74, opacity: away ? 0.55 : 1 }} contentFit="contain"
          tintColor={away ? '#8aa0b8' : undefined} />
      ) : null}
      {state === 'owned' && <View style={styles.pieceBadge}><GameIcon name="check" size={18} /></View>}
      {away && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.pieceAwayText}>LATER</Text>}
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
  pieceAwayText: { position: 'absolute', bottom: 2, fontFamily: FONT.display, fontSize: 9, color: '#6f849c', letterSpacing: 0.5 },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  sheen: { position: 'absolute', top: -40, bottom: -40, width: 46, left: -46 },
});
