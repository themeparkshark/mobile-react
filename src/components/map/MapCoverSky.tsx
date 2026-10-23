import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

const CLOUD = require('../../../assets/images/screens/explore/cloud.png');
const SHARK = require('../../../assets/icons/game/shark.png');

/** Alex's drawn cloud, where it sits (fractions of the cover) and how far it drifts. */
export const COVER_CLOUDS = [
  { x: 0.06, y: 0.16, w: 0.30, drift: 18, ms: 5200 },
  { x: 0.62, y: 0.30, w: 0.26, drift: -16, ms: 6100 },
  { x: 0.18, y: 0.66, w: 0.24, drift: 14, ms: 5600 },
] as const;

/**
 * What the map shows for the second while park tiles stream in: the game's light sky with
 * Alex's drawn clouds and the shark bobbing in the middle, so the hand-off never shows a blank
 * sheet. Native-driver loops only (cheap), still under Reduce Motion, and it unmounts with the cover.
 */
function MapCoverSky() {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedGameMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { t.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(t, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, t]);
  const sharkSize = Math.round(Math.min(width, height) * 0.26);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {COVER_CLOUDS.map((c, i) => {
        const w = Math.round(width * c.w);
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: width * c.x, top: height * c.y, opacity: 0.9,
            transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, c.drift] }) }],
          }}>
            <Image source={CLOUD} style={{ width: w, height: Math.round(w * 155 / 232) }} contentFit="contain" />
          </Animated.View>
        );
      })}
      <View style={styles.center}>
        <Animated.View style={{ transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [4, -8] }) }] }}>
          <Image source={SHARK} style={{ width: sharkSize, height: sharkSize }} contentFit="contain" />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});

export default memo(MapCoverSky);
