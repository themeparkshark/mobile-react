import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { BRAND, GameText, SHADOW } from '../../ui';
import { SPRING } from '../../ui/motion';
import { FAN_CHIP, FAN_LABEL_W, fanSpots } from './clusterFanLayout';


/** One ride in a folded cluster. */
export interface FanRide { readonly id: number; readonly name: string; readonly art: number }

/**
 * A folded cluster's coins fan out around their island so a kid can pick Peter Pan or Snow White
 * (T017). Each coin springs out from the island (a fade under Reduce Motion); a tap picks that ride,
 * a tap anywhere else folds them back. No dark backdrop: the map stays in view.
 */
export default function ClusterFan({ rides, at, reducedMotion, onPick, onClose, top, bottom }: {
  readonly rides: readonly FanRide[];
  /** The island's point in window coordinates. */
  readonly at: { readonly x: number; readonly y: number };
  readonly reducedMotion: boolean;
  readonly onPick: (id: number) => void;
  readonly onClose: () => void;
  /** Window y the coins stay below (the guide card's bottom) and the height kept clear at the bottom (footer, PLAY!). */
  readonly top: number;
  readonly bottom: number;
}) {
  const screen = useWindowDimensions();
  const spots = fanSpots(rides.length, at, screen, { top, bottom });
  return (
    <View style={styles.layer} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fold the rides back" />
      {spots.map((spot, i) => <FanCoin key={rides[i].id} ride={rides[i]} from={at} to={spot} index={i}
        reducedMotion={reducedMotion} onPress={() => onPick(rides[i].id)} />)}
    </View>
  );
}

function FanCoin({ ride, from, to, index, reducedMotion, onPress }: {
  readonly ride: FanRide; readonly from: { x: number; y: number }; readonly to: { x: number; y: number };
  readonly index: number; readonly reducedMotion: boolean; readonly onPress: () => void;
}) {
  const out = useSharedValue(0);
  useEffect(() => {
    out.value = reducedMotion ? withTiming(1, { duration: 120 }) : withDelay(index * 35, withSpring(1, SPRING.pop));
  }, [out, index, reducedMotion]);
  const dx = from.x - to.x, dy = from.y - to.y;
  const style = useAnimatedStyle(() => reducedMotion
    ? { opacity: out.value }
    : { opacity: Math.min(1, out.value * 2), transform: [{ translateX: dx * (1 - out.value) }, { translateY: dy * (1 - out.value) },
      { scale: 0.4 + 0.6 * out.value }] });
  return (
    <Animated.View style={[styles.slot, { left: to.x - FAN_LABEL_W / 2, top: to.y - FAN_CHIP / 2 }, style]} pointerEvents="box-none">
      <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${ride.name}. Pick this ride.`}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
        <Image source={ride.art} style={styles.coin} contentFit="contain" />
      </Pressable>
      <View style={styles.label} pointerEvents="none">
        <GameText preset="caption" tone="onBlue" align="center" numberOfLines={2} style={styles.labelText}>{ride.name}</GameText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Over the map and its markers, under the header and footer chrome's own layers.
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 30 },
  slot: { position: 'absolute', width: FAN_LABEL_W, alignItems: 'center' },
  chip: { width: FAN_CHIP, height: FAN_CHIP, borderRadius: FAN_CHIP / 2, borderWidth: 3, borderColor: BRAND.white,
    backgroundColor: BRAND.blue, alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  pressed: { transform: [{ scale: 0.94 }] },
  // The ride's own island picture, a little larger than the disc (it reads as a picture, not a dot).
  coin: { width: FAN_CHIP + 6, height: FAN_CHIP + 6, marginTop: -8 },
  label: { marginTop: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9, backgroundColor: BRAND.navy, maxWidth: FAN_LABEL_W },
  labelText: { fontSize: 11, lineHeight: 13 },
});
