import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import useAmbientLoop from '../../power/useAmbientLoop';
import { useIsFocused } from '@react-navigation/native';
import type { PrepItemType } from '../../models/prep-item-type';
import { BRAND } from '../../ui';
import { findImageSource } from './PrepItem';
import { mapGlowColor } from './findPresentation';
import { edgeArrowPlacement } from './findEdges';

export interface EdgeFind {
  readonly item: PrepItemType;
  /** The find's spot in this layer (off screen). */
  readonly point: { x: number; y: number };
  readonly distance: number | null;
}

/**
 * Finds off screen get a small arrow on the screen edge with the item's own
 * thumbnail, pointing the way (like a "Nearby" tracker). Tapping one gives the
 * walk-closer nudge.
 */
function FindEdgeArrows({ finds, size, onPress, insetTop = 70 }: {
  readonly finds: readonly EdgeFind[];
  /** Where the top edge's tokens centre: below the HUD chip row (and the live bar when it shows). */
  readonly insetTop?: number;
  readonly size: { width: number; height: number };
  readonly onPress: (find: EdgeFind) => void;
}) {
  // One shared pulse for every edge token (1.0 to 1.15 every 900 ms): "this way!" with no words. It runs
  // only through the ambient budget (stops idle, in the background, in calm, with Reduce Motion, off focus).
  const pulse = useSharedValue(0);
  const focused = useIsFocused();
  useAmbientLoop(
    () => { pulse.value = 0; pulse.value = withRepeat(withSequence(withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 600, easing: Easing.inOut(Easing.quad) })), -1, false); },
    () => { cancelAnimation(pulse); pulse.value = 0; },
    focused && finds.length > 0,
  );
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.15 * pulse.value }] }));
  if (size.width === 0) return null;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {finds.map(find => {
        const at = edgeArrowPlacement(find.point, size, { top: insetTop, bottom: 190, side: 30 });
        const art = findImageSource(find.item);
        const color = mapGlowColor(find.item.rarity);
        return (
          <Pressable key={find.item.pivot_id ?? find.item.id} accessibilityRole="button"
            accessibilityLabel={`${find.item.name}, off screen. Show how far.`} onPress={() => onPress(find)}
            style={[styles.wrap, { left: at.x - 24, top: at.y - 24 }]}>
            <Animated.View style={[styles.fill, pulseStyle]}>
            <View style={[styles.arrow, { transform: [{ rotate: `${at.angleDeg}deg` }] }]}>
              <View style={[styles.tip, { borderBottomColor: color }]} />
            </View>
            {/* A rarity-coloured disc behind the thumbnail: never a blank white circle while it binds. */}
            <View style={[styles.bubble, { borderColor: color, backgroundColor: `${color}33` }]}>
              {art && <Image source={art} style={styles.art} contentFit="contain" transition={0} cachePolicy="memory-disk"
                recyclingKey={String(find.item.pivot_id ?? find.item.id)} />}
            </View>
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(FindEdgeArrows);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  fill: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  arrow: { position: 'absolute', width: 48, height: 48, alignItems: 'center' },
  tip: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 11, borderLeftColor: 'transparent',
    borderRightColor: 'transparent', marginTop: -6 },
  bubble: { width: 36, height: 36, borderRadius: 18, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center', shadowColor: BRAND.shadow, shadowOffset: { width: 0, height: 2 },
    shadowRadius: 0, shadowOpacity: 0.25 },
  art: { width: 28, height: 28 },
});
