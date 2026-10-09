/**
 * Shared collection pieces in Alex's look: the set badge and item art lookups,
 * the springy press, the star burst and the blue popup panel (item card and
 * reveal). The Collections page itself is built from BookParts.tsx. Every move
 * runs on the UI thread and Reduce Motion swaps it for a fade or a still.
 */
import type { ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import prepItemImage from '../../helpers/prepItemImages';
import { BRAND } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import type { DexItem, DexSet } from './dexModel';

export const GIFT = require('../../../assets/images/screens/player/gift.png');
export const RIBBON = require('../../../assets/images/ribbon.png');
export const CLOSE_X = require('../../../assets/images/alex-ui/close-red.webp');

/** Bundled badge art for the legacy sets that never had a server badge. */
const LEGACY_BADGES: Readonly<Record<string, string>> = {
  churro_collection: 'churro_01', pretzel_collection: 'pretzel_01', night_lights: 'flashlight_40',
  rain_parade: 'umbrella_40', camera_crew: 'camera_40',
};

export function setBadge(set: Pick<DexSet, 'slug' | 'badgeUrl'>): ImageSource {
  if (set.badgeUrl) return { uri: set.badgeUrl };
  const local = LEGACY_BADGES[set.slug] ? prepItemImage(LEGACY_BADGES[set.slug]) : null;
  return local ?? GIFT;
}

export function itemArt(item: Pick<DexItem, 'variantSlug' | 'iconUrl'>): ImageSource {
  return (item.variantSlug ? prepItemImage(item.variantSlug) : null)
    ?? (item.iconUrl ? { uri: item.iconUrl } : null)
    ?? GIFT;
}

/** The silhouette ink for missing items. */
export const SILHOUETTE = '#1b3a5c';

/** Squishes on press, springs back on release (a plain press with Reduce Motion). */
export function SpringPress({ onPress, children, style, disabled, accessibilityLabel, accessibilityHint, accessibilityState, scaleTo = 0.94 }: {
  readonly onPress?: () => void;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly accessibilityState?: { selected?: boolean; disabled?: boolean; expanded?: boolean };
  readonly scaleTo?: number;
}) {
  const reduced = useUiReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState} disabled={disabled} onPress={onPress}
      onPressIn={() => { if (!reduced) scale.value = withSpring(scaleTo, { damping: 15, stiffness: 420 }); }}
      onPressOut={() => { if (!reduced) scale.value = withSpring(1, { damping: 7, stiffness: 260 }); }}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

/** A small burst of stars. Mount with a new key to fire. Skipped with Reduce Motion. */
export function StarBurst({ color = BRAND.gold, size = 160, solid = false }: {
  readonly color?: string; readonly size?: number;
  /** Opaque two-tone sparks (gold and pale gold, outlined) that pop out instead of fading: they never go khaki on navy. */
  readonly solid?: boolean;
}) {
  const reduced = useUiReducedMotion();
  const parts = useMemo(() => Array.from({ length: 10 }, (_, index) => (index / 10) * Math.PI * 2), []);
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {parts.map((angle, index) => (
        <Spark key={index} angle={angle} distance={size / 2} delay={index * 12} solid={solid}
          color={solid ? (index % 2 ? BRAND.goldLight : color) : index % 2 ? BRAND.white : color} />
      ))}
    </View>
  );
}

function Spark({ angle, distance, color, delay, solid }: { angle: number; distance: number; color: string; delay: number; solid: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) })); }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: solid ? (t.value < 0.8 ? 1 : (1 - t.value) * 5) : 1 - t.value,
    transform: [
      { translateX: Math.cos(angle) * distance * t.value },
      { translateY: Math.sin(angle) * distance * t.value },
      { scale: 0.4 + t.value * 0.8 },
      { rotate: '45deg' },
    ],
  }));
  return <Animated.View style={[styles.spark, solid && styles.sparkSolid, { backgroundColor: color }, style]} />;
}

/** The Alex-style blue popup body: flat blue, darker lip, one gloss band. */
export function BluePanel({ children, style }: { readonly children: ReactNode; readonly style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.bluePanel, style]}>
      <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={styles.blueGloss} pointerEvents="none" />
      {children}
    </View>
  );
}

/** Darker shade of a #RRGGBB color. */
export function shade(hex: string, amount = 0.28): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => Math.max(0, Math.round(((value >> shift) & 255) * (1 - amount)));
  return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

const styles = StyleSheet.create({
  spark: { position: 'absolute', width: 14, height: 14, borderRadius: 3 },
  sparkSolid: { width: 16, height: 16, borderWidth: 2, borderColor: '#7a3d00' },
  bluePanel: {
    backgroundColor: '#1a8fe3', borderRadius: 22, borderWidth: 4, borderColor: BRAND.white, borderBottomWidth: 8,
    borderBottomColor: '#0b5aa0', overflow: 'hidden',
  },
  blueGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '35%' },
});
