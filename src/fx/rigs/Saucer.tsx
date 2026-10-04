import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { RigProps, useMomentCue } from '../FxStage';
import { FX_GEOMETRY, momentAt, partLayout, phaseOf } from '../registry';

const G = FX_GEOMETRY.rigs.saucer.ufo;
const UFO = require('../../../assets/fx/ufo.webp');
const GLOW = require('../../../assets/fx/glow.webp');
const SPARK = require('../../../assets/fx/spark.webp');
/** Rim lights on ufo.webp (part fractions), left to right. */
export const RIM_LIGHTS = [
  { x: 0.174, y: 0.783, color: '#ff6b6b' },
  { x: 0.348, y: 0.792, color: '#ffe066' },
  { x: 0.543, y: 0.777, color: '#7dff8a' },
  { x: 0.739, y: 0.729, color: '#7cc8ff' },
  { x: 0.89, y: 0.654, color: '#ff8fd8' },
];
export const BEAM_PERIOD = 5000;
export const BEAM_LENGTH = 0.42;
/** Reduce Motion: frozen with the beam on and the star halfway up (its signature moment). */
export const STILL_P = 0.5;
/** The beam leans toward the shark's head. */
const BEAM_TILT = 24;

/** 0..1 beam strength: fades on, holds, fades off. */
export function beamOf(p: number): number {
  'worklet';
  if (p < 0) return 0;
  return p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
}

function beamP(t: SharedValue<number>, kick: SharedValue<number>, still: boolean): number {
  'worklet';
  return still ? STILL_P : momentAt(t.value, kick.value, BEAM_PERIOD, BEAM_LENGTH, 350).p;
}

function Light({ t, i, size }: { t: SharedValue<number>; i: number; size: number }) {
  const l = RIM_LIGHTS[i];
  const style = useAnimatedStyle(() => {
    // The chase: one bright light runs around the rim.
    const p = phaseOf(t.value, 1100);
    const d = Math.abs(p * RIM_LIGHTS.length - i);
    const on = Math.max(0, 1 - Math.min(d, RIM_LIGHTS.length - d));
    return { opacity: 0.2 + 0.8 * on, transform: [{ scale: 0.8 + 0.6 * on }] };
  });
  return <Animated.Image source={GLOW} style={[styles.abs, { left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: size, height: size,
    marginLeft: -size / 2, marginTop: -size / 2, tintColor: l.color }, style]} />;
}

/** In front of the shark: the saucer on its figure-8 hover, chase lights, and the tractor beam moment. */
export function SaucerFront(props: RigProps) {
  const { t, kick, box, lod, cue } = props;
  const still = lod === 'still';
  useMomentCue(() => { 'worklet'; return still ? -1 : beamP(t, kick, false); }, cue ? () => cue('beam') : undefined);
  const l = partLayout(box, G, G.aspect);
  const drift = useAnimatedStyle(() => {
    const p = still ? 0 : phaseOf(t.value, 4200) * Math.PI * 2;
    // While beaming it holds still over its target.
    const hold = 1 - 0.8 * beamOf(beamP(t, kick, still));
    return {
      transform: [
        { translateX: Math.sin(p) * box.w * 0.05 * hold },
        { translateY: Math.sin(p * 2) * box.h * 0.022 * hold },
        { rotate: `${G.rot + Math.sin(p) * 6 * hold}deg` },
      ],
    };
  });
  const beam = useAnimatedStyle(() => ({ opacity: beamOf(beamP(t, kick, still)) * 0.9 }));
  const beamW = l.width * 0.95;
  const beamH = l.height * 2.1;
  const star = l.width * 0.3;
  const lift = useAnimatedStyle(() => {
    const p = beamP(t, kick, still);
    const k = p < 0.12 ? -1 : (p - 0.12) / 0.7;
    if (k < 0 || k > 1) return { opacity: 0 };
    return {
      opacity: k < 0.85 ? 1 : (1 - k) / 0.15,
      transform: [{ translateY: (1 - k) * beamH * 0.8 }, { scale: 1 - 0.55 * k }, { rotate: `${k * 240}deg` }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: l.left, top: l.top, width: l.width,
      height: l.height, transformOrigin: l.origin }, drift]}>
      <Animated.View style={[styles.abs, { left: (l.width - beamW) / 2, top: l.height * 0.7, width: beamW, height: beamH,
          transformOrigin: '50% 0%', transform: [{ rotate: `${BEAM_TILT}deg` }] }, beam]}>
          <Svg width={beamW} height={beamH}>
            <Defs>
              <LinearGradient id="saucerBeam" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#d6fdff" stopOpacity={0.95} />
                <Stop offset="1" stopColor="#7be3ff" stopOpacity={0.05} />
              </LinearGradient>
            </Defs>
            {/* A drawn beam: charcoal-edged cone, like the rest of the art. */}
            <Polygon points={`${beamW * 0.36},0 ${beamW * 0.64},0 ${beamW * 0.98},${beamH} ${beamW * 0.02},${beamH}`} fill="url(#saucerBeam)"
              stroke="#2a3550" strokeOpacity={0.45} strokeWidth={2} />
          </Svg>
          <Animated.Image source={SPARK} style={[styles.abs, { left: beamW / 2 - star / 2, top: 0, width: star, height: star }, lift]} />
        </Animated.View>
      <Image source={UFO} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
      {lod === 'full' && RIM_LIGHTS.map((_, i) => <Light key={i} t={t} i={i} size={Math.max(6, l.width * 0.13)} />)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
