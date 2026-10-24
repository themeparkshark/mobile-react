import { memo, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import config from '../../config';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { COVER_BAR_CREEP_MS, LAUNCH_HANDOFF_SHARE } from '../../constants/launchHandoff';

const CLOUD = require('../../../assets/images/screens/explore/cloud.png');
const SHARK = require('../../../assets/icons/game/shark.png');

/** Alex's drawn cloud, where it sits (fractions of the cover) and how far it drifts. */
export const COVER_CLOUDS = [
  { x: 0.04, y: 0.12, w: 0.40, drift: 18 },
  { x: 0.58, y: 0.27, w: 0.36, drift: -16 },
  { x: 0.10, y: 0.70, w: 0.34, drift: 14 },
] as const;

/**
 * What the map shows while park tiles stream in: the game's light sky with Alex's drawn
 * clouds, the shark bobbing in the middle, and the splash's own loading bar picking up where
 * the splash left it (LAUNCH_HANDOFF_SHARE) and filling the rest. Every loop runs on the UI
 * thread from the first frame (Reanimated), so it keeps moving while the map screen's JS is
 * still busy mounting. Reduce Motion keeps the shark and clouds still; the bar still fills.
 */
function MapCoverSky({ done = false }: { readonly done?: boolean }) {
  const { width, height } = useWindowDimensions();
  const reduced = useUiReducedMotion();
  const t = useSharedValue(0);
  const fill = useSharedValue(LAUNCH_HANDOFF_SHARE);
  useEffect(() => {
    if (reduced) { cancelAnimation(t); t.value = 0; return; }
    t.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [reduced, t]);
  useEffect(() => {
    fill.value = done
      ? withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
      : withTiming(0.96, { duration: COVER_BAR_CREEP_MS, easing: Easing.out(Easing.cubic) });
  }, [done, fill]);
  const sharkSize = Math.round(Math.min(width, height) * 0.26);
  const barWidth = Math.round(Math.min(width * 0.7, 320));
  const sharkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 6 - t.value * 16 }, { rotate: `${-4 + t.value * 8}deg` }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {COVER_CLOUDS.map((c, i) => <CoverCloud key={i} t={t} cloud={c} width={width} height={height} />)}
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
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: config.primary },
});

export default memo(MapCoverSky);
