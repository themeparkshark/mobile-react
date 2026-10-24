import { memo, useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import config from '../../config';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { COVER_MAX_MS, LAUNCH_HANDOFF_SHARE } from '../../constants/launchHandoff';

/** The cover color while park tiles load: the game's light sky blue, never a dark scene. */
export const MAP_COVER_SKY = '#dcefff';

const CLOUD = require('../../../assets/images/screens/explore/cloud.png');
const SHARK = require('../../../assets/icons/game/shark.png');

/**
 * Alex's drawn cloud, where it sits (fractions of the cover) and how far it drifts. Small (about a
 * quarter of the width, so the thick outline reads as a cloud, not an empty speech balloon), in the
 * top third and the lower corners, never beside the shark's head or behind a map button.
 */
export const COVER_CLOUDS = [
  { x: 0.05, y: 0.06, w: 0.28, drift: 14 },
  { x: 0.66, y: 0.17, w: 0.26, drift: -12 },
  { x: 0.08, y: 0.74, w: 0.26, drift: 10 },
] as const;

/**
 * What the map shows while park tiles stream in: the game's light sky with Alex's drawn
 * clouds, the shark bobbing in the middle, and the splash's own loading bar picking up where
 * the splash left it (LAUNCH_HANDOFF_SHARE) and filling the rest. Every loop runs on the UI
 * thread from the first frame (Reanimated), so it keeps moving while the map screen's JS is
 * still busy mounting. Reduce Motion keeps the shark and clouds still; the bar still fills.
 * On the map screen the bar is the screen cover's own (mapCover.coverFill), so it finishes
 * exactly as the cover lifts.
 */
function MapCoverSky({ done = false, fill: drivenFill }: {
  readonly done?: boolean;
  /** The screen's cover bar (mapCover.coverFill), on the same clock as the cover's lift. */
  readonly fill?: SharedValue<number>;
}) {
  const window = useWindowDimensions();
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const width = box?.width ?? window.width;
  const height = box?.height ?? window.height;
  const reduced = useUiReducedMotion();
  const t = useSharedValue(0);
  const ownFill = useSharedValue(LAUNCH_HANDOFF_SHARE);
  const fill = drivenFill ?? ownFill;
  useEffect(() => {
    if (reduced) { cancelAnimation(t); t.value = 0; return; }
    t.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [reduced, t]);
  useEffect(() => {
    if (drivenFill) return;
    ownFill.value = done
      ? withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
      : withTiming(1, { duration: COVER_MAX_MS, easing: Easing.out(Easing.cubic) });
  }, [done, drivenFill, ownFill]);
  const sharkSize = Math.round(Math.min(width, height) * 0.26);
  const barWidth = Math.round(Math.min(width * 0.7, 320));
  const sharkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 6 - t.value * 16 }, { rotate: `${-4 + t.value * 8}deg` }] }));
  // Transform only (scaleX from the left edge): no layout pass per frame while the bar fills.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0, Math.min(1, fill.value)) }] }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}
      onLayout={e => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setBox(current => (current && current.width === w && current.height === h ? current : { width: w, height: h }));
      }}>
      {/* Clouds wait for the cover's own size, so they never jump from window spots to cover spots. */}
      {box && COVER_CLOUDS.map((c, i) => <CoverCloud key={i} t={t} cloud={c} width={width} height={height} />)}
      <View style={styles.center}>
        <Animated.View style={sharkStyle}>
          <Image source={SHARK} style={{ width: sharkSize, height: sharkSize }} contentFit="contain" />
        </Animated.View>
        {/* The splash's bar (white rim, navy fill), so the launch reads as one bar finishing. */}
        <View style={[styles.barRim, { width: barWidth }]}>
          <View style={styles.bar}>
            <Animated.View style={[styles.barFill, fillStyle]} />
          </View>
        </View>
      </View>
    </View>
  );
}

function CoverCloud({ t, cloud, width, height }: {
  readonly t: ReturnType<typeof useSharedValue<number>>;
  readonly cloud: (typeof COVER_CLOUDS)[number];
  readonly width: number;
  readonly height: number;
}) {
  const w = Math.round(width * cloud.w);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * cloud.drift }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: width * cloud.x, top: height * cloud.y }, style]}>
      <Image source={CLOUD} style={{ width: w, height: Math.round(w * 155 / 232) }} contentFit="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  barRim: { marginTop: 22, borderRadius: 50, borderColor: 'white', borderWidth: 3 },
  bar: { width: '100%', height: 23, borderRadius: 10, borderWidth: 3, borderColor: config.primary, backgroundColor: 'white', overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transformOrigin: 'left', backgroundColor: config.primary },
});

export default memo(MapCoverSky);
