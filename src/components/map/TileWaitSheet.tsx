import { memo, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import MapCoverSky, { MAP_COVER_SKY } from './MapCoverSky';

/** The longest the sheet waits for tiles after the cover lifted, before it fades anyway. */
export const TILE_WAIT_MAX_MS = 6000;
const FADE_MS = 320;

/**
 * If the loading cover had to lift before the map's tiles drew (its 4 s safety, a slow network),
 * a kid would see a bare flat lawn. This light sky sheet stays over the map (under the header,
 * the HUD and the buttons) until the first fully drawn frame, then fades on the UI thread. It is
 * the loading cover's own living sky (Alex's clouds drifting, the shark bobbing; still under
 * Reduce Motion), so a slow map never looks blank or frozen. It never blocks a tap, and it never
 * stays longer than TILE_WAIT_MAX_MS.
 */
function TileWaitSheet({ drawn, armed = true }: {
  readonly drawn: boolean;
  /** The loading cover has lifted: the sheet's wait starts counting now (under the cover it just waits). */
  readonly armed?: boolean;
}) {
  // Already drawn when it would mount: nothing to hide, never mount.
  const [gone, setGone] = useState(drawn);
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (gone) return;
    // Tiles drew: fade now (under the cover, unseen). Not yet: once the cover has lifted, wait for
    // them at most TILE_WAIT_MAX_MS.
    if (!drawn && !armed) return;
    const hide = (finished?: boolean) => { 'worklet'; if (finished) runOnJS(setGone)(true); };
    opacity.value = withDelay(drawn ? 0 : TILE_WAIT_MAX_MS,
      withTiming(0, { duration: FADE_MS, easing: Easing.out(Easing.quad) }, hide));
  }, [drawn, armed, gone, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, styles.sheet, style]}>
      <MapCoverSky bar={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: MAP_COVER_SKY },
});

export default memo(TileWaitSheet);
