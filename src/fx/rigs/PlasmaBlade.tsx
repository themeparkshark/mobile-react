import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FxPart, RigProps, useMomentCue } from '../FxStage';
import { FX_GEOMETRY, momentAt, partLayout, phaseOf } from '../registry';

const G = FX_GEOMETRY.rigs.plasma_blade.blade;
const BLADE = require('../../../assets/fx/blade.webp');
const GLOW = require('../../../assets/fx/glow.webp');
const SPARK = require('../../../assets/fx/spark.webp');

export const SWING_PERIOD = 4500;
export const SWING_LENGTH = 0.22;
/** Outward, away from the face. */
const SLASH_DEG = -52;
/** Reduce Motion and the rest frame: the blade at its proudest, glowing. */
export const STILL_T = 1100;

/** One slash: 0-0.1 wind-up (a few degrees back), 0.1-0.24 the slash out, then a springy settle. */
export function slashCurve(p: number): number {
  'worklet';
  if (p < 0.1) return -SLASH_DEG * 0.15 * Math.sin((p / 0.1) * Math.PI / 2);
  if (p < 0.24) {
    const k = (p - 0.1) / 0.14;
    return -SLASH_DEG * 0.15 + (SLASH_DEG + SLASH_DEG * 0.15) * (1 - Math.pow(1 - k, 3));
  }
  const k = (p - 0.24) / 0.76;
  // The overshoot back stays small (under 5 degrees), so the blade never sweeps over the face.
  return SLASH_DEG * Math.cos(k * Math.PI * 1.5) * Math.exp(-3.6 * k);
}

/**
 * Extra rotation of the blade at time t: a wind-up back, a fast outward slash,
 * then a springy settle (game feel round 2). Every third swing is a double
 * slash. A worklet helper must be declared above the worklet that calls it.
 */
export function swingAt(t: number, kick: number): number {
  'worklet';
  const m = momentAt(t, kick, SWING_PERIOD, SWING_LENGTH, 350);
  if (m.p < 0) return 0;
  // Always outward, away from the face. Every third swing is a quick double slash (the variant).
  const double = m.cycle > 0 && m.cycle % 3 === 2;
  if (!double) return slashCurve(m.p);
  return m.p < 0.5 ? slashCurve(m.p * 2) : 0.7 * slashCurve((m.p - 0.5) * 2);
}


/** 0..1 how fast the blade is moving right now (trail strength). */
function speedAt(t: number, kick: number): number {
  'worklet';
  return Math.min(1, Math.abs(swingAt(t, kick) - swingAt(t - 24, kick)) / 7);
}

const TRAIL = [1, 2, 3];

function Trail({ t, kick, box, i }: RigProps & { i: number }) {
  const style = useAnimatedStyle(() => {
    const lag = swingAt(t.value - i * 30, kick.value);
    return {
      opacity: speedAt(t.value, kick.value) * (i === 1 ? 0.9 : i === 2 ? 0.55 : 0.3),
      transform: [{ rotate: `${G.rot + lag}deg` }, { scaleX: 1.15 }],
    };
  });
  // The first ghost is white-hot (reads on a light backdrop), the rest cyan.
  return <FxPart source={BLADE} box={box} spec={G} aspect={G.aspect} tint={i === 1 ? '#ffffff' : '#1fb8e6'} style={style} />;
}

/** The grip and blade length in stage pixels (computed on JS, read in worklets). */
function bladeAxis(box: RigProps['box']) {
  const l = partLayout(box, G, G.aspect);
  return { gx: l.left + (G.ax ?? 0.5) * l.width, gy: l.top + (G.ay ?? 0.5) * l.height, len: l.height * 0.8 };
}

/** Where along the blade a point at `d` (0 hilt .. 1 tip) sits for a rotation. */
function bladePoint(axis: { gx: number; gy: number; len: number }, d: number, deg: number) {
  'worklet';
  const a = (deg * Math.PI) / 180;
  return { x: axis.gx + Math.sin(a) * axis.len * d, y: axis.gy - Math.cos(a) * axis.len * d };
}

/** A drawn spark that pops at the tip when the slash lands, and a light mote that runs up the blade. */
function TipSpark({ t, kick, box }: RigProps) {
  const size = box.w * 0.07;
  const axis = bladeAxis(box);
  const style = useAnimatedStyle(() => {
    const { p } = momentAt(t.value, kick.value, SWING_PERIOD, SWING_LENGTH, 350);
    const w = p < 0.2 ? -1 : (p - 0.2) / 0.25;
    if (w < 0 || w > 1) return { opacity: 0 };
    const pt = bladePoint(axis, 1, G.rot + swingAt(t.value, kick.value));
    return { opacity: 1 - w, transform: [{ translateX: pt.x - size / 2 }, { translateY: pt.y - size / 2 }, { scale: 0.4 + 0.9 * w }, { rotate: `${w * 90}deg` }] };
  });
  return <Animated.Image source={SPARK} style={[styles.abs, { width: size, height: size }, style]} />;
}

function Mote({ t, kick, box }: RigProps) {
  const size = Math.max(5, box.w * 0.03);
  const axis = bladeAxis(box);
  const style = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 1600);
    const pt = bladePoint(axis, 0.12 + 0.88 * p, G.rot + swingAt(t.value, kick.value));
    return { opacity: Math.sin(Math.PI * p), transform: [{ translateX: pt.x - size / 2 }, { translateY: pt.y - size / 2 }] };
  });
  return <Animated.Image source={GLOW} style={[styles.abs, { width: size, height: size }, style]} />;
}

/** The blade lights the shark: a cyan wash on the near side that flares with each slash (game feel round 2). */
function BladeLight({ t, kick, box }: RigProps) {
  const size = box.w * 0.42;
  const axis = bladeAxis(box);
  const style = useAnimatedStyle(() => ({
    opacity: 0.16 + 0.04 * Math.sin((t.value / 1600) * Math.PI * 2) + 0.34 * speedAt(t.value, kick.value),
  }));
  return <Animated.Image source={GLOW} style={[styles.abs, { left: axis.gx - size * 0.3, top: axis.gy - size * 0.7, width: size, height: size,
    tintColor: '#7fe8ff' }, style]} />;
}

/** In front of the shark: the glow, the swing trail, the blade, a tip spark and a light mote. */
export function PlasmaBladeFront(props: RigProps) {
  const { t, kick, box, lod, cue } = props;
  const still = lod === 'still';
  useMomentCue(() => { 'worklet'; if (still) return -1; const m = momentAt(t.value, kick.value, SWING_PERIOD, SWING_LENGTH, 350); return m.cycle < 0 ? -1 : m.p; }, cue ? () => cue('swing') : undefined);
  const glow = useAnimatedStyle(() => {
    const v = still ? STILL_T : t.value;
    const s = swingAt(v, kick.value);
    return {
      opacity: 0.5 + 0.2 * Math.sin((v / 1600) * Math.PI * 2) + 0.3 * speedAt(v, kick.value),
      transform: [{ rotate: `${G.rot + s}deg` }, { scaleX: 1.7 }, { scaleY: 1.08 }],
    };
  });
  const blade = useAnimatedStyle(() => ({ transform: [{ rotate: `${G.rot + swingAt(still ? STILL_T : t.value, kick.value)}deg` }] }));
  return (
    <>
      {/* A soft cyan glow sprite stretched along the blade (never a blurred copy). */}
      <FxPart source={GLOW} box={box} spec={G} aspect={G.aspect} tint="#5fe2ff" fit="fill" style={glow} />
      {lod === 'full' && TRAIL.map(i => <Trail key={i} {...props} i={i} />)}
      <FxPart source={BLADE} box={box} spec={G} aspect={G.aspect} style={blade} />
      {lod === 'full' && <TipSpark {...props} />}
      {lod === 'full' && <BladeLight {...props} />}
      {lod === 'full' && <Mote {...props} />}
    </>
  );
}

/** The shark leans into the slash (a few degrees about its tail). */
export function bladeLean(t: number, kick: number): number {
  'worklet';
  return swingAt(t, kick) * 0.07;
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
