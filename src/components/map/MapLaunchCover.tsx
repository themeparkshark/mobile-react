import { memo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import MapCoverSky, { MAP_COVER_SKY } from './MapCoverSky';
import { coverFill, coverOpacity, useMapCovered } from './mapCover';

/**
 * The map's loading cover: light sky, Alex's clouds, the bobbing shark and the launch bar.
 * Opacity, scale and bar all run on the UI thread from mapCover's shared values, so it lifts on
 * time even while the screen's JS is busy. The map screen draws it above its whole HUD (under
 * the header and footer), so no button, card or tip shows half-loaded on the sky.
 */
function MapLaunchCover({ style, blockTouches = false }: {
  readonly style?: StyleProp<ViewStyle>;
  /** Swallow taps while the cover is up, so a hidden button under the sky is never pressed. */
  readonly blockTouches?: boolean;
}) {
  const covered = useMapCovered();
  const lift = useAnimatedStyle(() => ({
    opacity: coverOpacity.value,
    transform: [{ scale: 1.06 - 0.06 * coverOpacity.value }],
  }));
  if (!covered) return null;
  return (
    <Animated.View testID="map-launch-cover" pointerEvents={blockTouches ? 'auto' : 'none'}
      accessibilityLabel="Loading the map" accessibilityRole="progressbar"
      style={[StyleSheet.absoluteFill, styles.sky, style, lift]}>
      <MapCoverSky fill={coverFill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sky: { backgroundColor: MAP_COVER_SKY },
});

export default memo(MapLaunchCover);
