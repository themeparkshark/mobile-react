import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { RigProps } from '../FxStage';
import { FX_GEOMETRY, partLayout, phaseOf, windowOf } from '../registry';

const G = FX_GEOMETRY.rigs.saucer.ufo;
const UFO = require('../../../assets/fx/ufo.png');
/** Rim lights on ufo.png (part fractions), left to right. */
export const RIM_LIGHTS = [
  { x: 0.174, y: 0.783, color: '#ff6b6b' },
  { x: 0.348, y: 0.792, color: '#ffe066' },
  { x: 0.543, y: 0.777, color: '#7dff8a' },
  { x: 0.739, y: 0.729, color: '#7cc8ff' },
  { x: 0.89, y: 0.654, color: '#ff8fd8' },
];
export const BEAM_PERIOD = 5000;
const BEAM_LENGTH = 0.36;

/** 0..1 beam strength: fades on, holds, fades off once every 5 s. */
export function beamAt(t: number): number {
  'worklet';
  const w = windowOf(phaseOf(t, BEAM_PERIOD, 0.6), 0, BEAM_LENGTH);
  if (w < 0) return 0;
  return w < 0.2 ? w / 0.2 : w > 0.8 ? (1 - w) / 0.2 : 1;
}

function Light({ t, i, size }: { t: SharedValue<number>; i: number; size: number }) {
  const l = RIM_LIGHTS[i];
  const style = useAnimatedStyle(() => {
    // The chase: one bright light runs around the rim.
    const p = phaseOf(t.value, 1100);
    const d = Math.abs(p * RIM_LIGHTS.length - i);
    const on = Math.max(0, 1 - Math.min(d, RIM_LIGHTS.length - d));
    return { opacity: 0.15 + 0.85 * on, transform: [{ scale: 0.8 + 0.5 * on }] };
  });
  return <Animated.View style={[styles.light, { left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: size, height: size,
    marginLeft: -size / 2, marginTop: -size / 2, borderRadius: size, backgroundColor: '#fff', shadowColor: l.color }, style]} />;
}

/** In front of the shark: the saucer on its figure-8 drift, the chase lights and the beam moment. */
export function SaucerFront({ t, box, lod }: RigProps) {
  const l = partLayout(box, G, G.aspect);
  const drift = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 4200) * Math.PI * 2;
    return {
      transform: [
        { translateX: Math.sin(p) * box.w * 0.018 },
        { translateY: Math.sin(p * 2) * box.h * 0.012 },
        { rotate: `${G.rot + Math.sin(p) * 4}deg` },
      ],
    };
  });
  const beam = useAnimatedStyle(() => ({ opacity: beamAt(t.value) * 0.85 }));
  const lift = useAnimatedStyle(() => {
    const b = beamAt(t.value);
    const p = windowOf(phaseOf(t.value, BEAM_PERIOD, 0.6), 0.1, 0.24);
    return {
      opacity: b > 0 && p >= 0 ? Math.sin(Math.PI * p) : 0,
      transform: [{ translateY: p < 0 ? 0 : -p * l.height * 1.15 }, { rotate: `${p * 180}deg` }],
    };
  });
  const beamW = l.width * 0.9;
  const beamH = l.height * 1.5;
  const sparkle = Math.max(6, l.width * 0.09);
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: l.left, top: l.top, width: l.width,
      height: l.height, transformOrigin: l.origin }, drift]}>
      {lod !== 'still' && (
        <Animated.View style={[{ position: 'absolute', left: (l.width - beamW) / 2, top: l.height * 0.72, width: beamW,
          height: beamH }, beam]}>
          <Svg width={beamW} height={beamH}>
            <Defs>
              <LinearGradient id="saucerBeam" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#c9fbff" stopOpacity={0.95} />
                <Stop offset="1" stopColor="#7be3ff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Polygon points={`${beamW * 0.36},0 ${beamW * 0.64},0 ${beamW},${beamH} 0,${beamH}`} fill="url(#saucerBeam)" />
          </Svg>
          <Animated.View style={[styles.sparkle, { left: beamW / 2 - sparkle / 2, top: beamH * 0.8, width: sparkle,
            height: sparkle }, lift]}>
            <View style={[styles.sparkleBar, { width: sparkle, height: sparkle * 0.28, top: sparkle * 0.36 }]} />
            <View style={[styles.sparkleBar, { width: sparkle * 0.28, height: sparkle, left: sparkle * 0.36 }]} />
          </Animated.View>
        </Animated.View>
      )}
      <Image source={UFO} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
      {lod !== 'still' && RIM_LIGHTS.map((_, i) => <Light key={i} t={t} i={i} size={Math.max(4, l.width * 0.07)} />)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  light: { position: 'absolute', shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  sparkle: { position: 'absolute' },
  sparkleBar: { position: 'absolute', backgroundColor: '#fffbe0', borderRadius: 4, borderWidth: 1, borderColor: '#2a3550' },
});
