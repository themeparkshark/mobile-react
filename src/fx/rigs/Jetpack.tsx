import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FxPart, RigProps, useMomentCue } from '../FxStage';
import { FX_GEOMETRY, PaperBox, momentAt, phaseOf } from '../registry';

const G = FX_GEOMETRY.rigs.jetpack;
// Alex's hand-drawn Jetpack 3000 (items.id 436): the pack and its two cyan flames are cut
// from his paper, so the rest pose is his drawing exactly. The droplets are his cyan drops.
const BODY = require('../../../assets/fx/jetpack.webp');
// Alex's own 3-frame flame loop (his 2023 GIF), stepped like a hand-drawn cycle, never tweened.
const FLAME_FRAMES = [
  require('../../../assets/fx/jet-flame-0.webp'),
  require('../../../assets/fx/jet-flame-1.webp'),
  require('../../../assets/fx/jet-flame-2.webp'),
];
const SIDE_FRAMES = [
  require('../../../assets/fx/jet-flame-side-0.webp'),
  require('../../../assets/fx/jet-flame-side-1.webp'),
  require('../../../assets/fx/jet-flame-side-2.webp'),
];
const DROP = require('../../../assets/fx/jet-drop.webp');
/** Alex's flame cyans (sampled from his paper), for the flat floor light. */
const CYAN = '#00e7ff';
const CYAN_LIGHT = '#bff9ff';
/** One drawing every 80 ms (about 12 fps): the cadence of a hand-drawn loop. Faster on a boost. */
export const FLAME_FRAME_MS = 80;

/** Boost: every ~6 s (and on a tap) the shark dips, then pops up on a big flame. */
export const BOOST_PERIOD = 6000;
export const BOOST_LENGTH = 0.2;
export const STILL_T = 800;

/**
 * The boost curve, -0.35..1: a 100 ms squash down, a fast pop up, then a slow
 * drift back (game feel round 2: anticipation, kick, settle).
 */
export function boostCurve(p: number): number {
  'worklet';
  if (p < 0) return 0;
  if (p < 0.1) return -0.35 * Math.sin((p / 0.1) * Math.PI / 2);
  if (p < 0.28) { const k = (p - 0.1) / 0.18; return -0.35 + 1.35 * (1 - Math.pow(1 - k, 3)); }
  const k = (p - 0.28) / 0.72;
  return 1 - k * k * (3 - 2 * k);
}

export function boostAt(t: number, kick: number): number {
  'worklet';
  return boostCurve(momentAt(t, kick, BOOST_PERIOD, BOOST_LENGTH, 350).p);
}

/** The idle bob, -1..1, with hang time at the top and a quicker drop (weight, not a sine). */
export function hoverBob(t: number): number {
  'worklet';
  const s = Math.sin((t / 2600) * Math.PI * 2);
  return Math.sign(s) * Math.pow(Math.abs(s), s > 0 ? 0.6 : 1.4);
}

/** How high the shark floats at time t, in px of the stage height (negative is up). */
export function jetpackFloat(t: number, kick: number, height: number): number {
  'worklet';
  return -height * (0.1 + 0.025 * hoverBob(t) + 0.07 * boostAt(t, kick));
}

/**
 * Squash and stretch on the shark (game feel: weight). The dip squashes it wide, the pop
 * stretches it tall, and it lands with a small overshoot. Plus a lazy tilt with the bob.
 */
export function jetpackBody(t: number, kick: number): { sx: number; sy: number; rot: number } {
  'worklet';
  const p = momentAt(t, kick, BOOST_PERIOD, BOOST_LENGTH, 350).p;
  let sx = 1;
  let sy = 1;
  if (p >= 0 && p < 0.1) { const k = Math.sin((p / 0.1) * Math.PI / 2); sx = 1 + 0.07 * k; sy = 1 - 0.08 * k; }
  else if (p >= 0.1 && p < 0.3) { const k = Math.sin(((p - 0.1) / 0.2) * Math.PI); sx = 1 - 0.05 * k; sy = 1 + 0.07 * k; }
  else if (p >= 0.3 && p < 0.55) { const k = Math.sin(((p - 0.3) / 0.25) * Math.PI); sx = 1 + 0.025 * k; sy = 1 - 0.03 * k; }
  const b = boostCurve(p);
  return { sx, sy, rot: 1.4 * Math.cos((t / 2600) * Math.PI * 2) - 3 * Math.max(0, b) };
}

const SPARKS = [0, 1, 2, 3, 4, 5];

function nozzle(box: PaperBox) {
  return { x: box.x + G.flame.cx * box.w, y: box.y + G.flame.cy * box.h };
}

/**
 * Alex's cyan droplets drip from the flame (his GIF throws a few each frame) and fall
 * with a little gravity; a boost throws a burst of them.
 */
function Spark({ t, kick, box, i }: RigProps & { i: number }) {
  const n = nozzle(box);
  const size = box.w * 0.024;
  const style = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 620 + i * 61, i / SPARKS.length);
    const side = ((i * 37) % 11) / 10 - 0.5;
    const b = Math.max(0, boostAt(t.value, kick.value));
    return {
      opacity: p < 0.08 ? p / 0.08 : 1 - p * p,
      transform: [
        { translateX: n.x - size / 2 + side * box.w * (0.07 + 0.06 * b) * p },
        { translateY: n.y - size / 2 + (0.1 + 0.11 * p + 0.09 * p * p) * box.h * (1 + 0.5 * b) },
        { scale: (1 - 0.45 * p) * (1 + 0.5 * b) },
      ],
    };
  });
  return <Animated.Image source={DROP} style={[styles.abs, { width: size, height: size }, style]} />;
}

/** The drawing of the loop on screen at time v: stepped, and twice as fast on a boost. */
function frameAt(v: number, kick: number, delay: number): number {
  'worklet';
  const fast = boostAt(v, kick) > 0.2 ? 2 : 1;
  return Math.floor(((v + delay) * fast) / FLAME_FRAME_MS) % 3;
}

/**
 * One of Alex's flames: his three drawings swap on a stepped cadence (no blur, no glow),
 * and the boost stretches the drawing long from its nozzle (squashed by the dip).
 */
function Flame({ t, kick, box, lod, spec, delay, frames }: RigProps & { spec: typeof G.flame; delay: number; frames: number[] }) {
  return (
    <>
      {frames.map((source, k) => <FlameFrame key={k} t={t} kick={kick} box={box} lod={lod} spec={spec} delay={delay} source={source} k={k} />)}
    </>
  );
}

function FlameFrame({ t, kick, box, lod, spec, delay, source, k }: Pick<RigProps, 't' | 'kick' | 'box' | 'lod'> & { spec: typeof G.flame; delay: number; source: number; k: number }) {
  const style = useAnimatedStyle(() => {
    // Reduce Motion holds frame 0: Alex's paper drawing exactly.
    if (lod === 'still') return { opacity: k === 0 ? 1 : 0 };
    const v = t.value;
    const b = boostAt(v, kick.value);
    return {
      opacity: frameAt(v, kick.value, delay) === k ? 1 : 0,
      transform: [{ rotate: `${spec.rot}deg` }, { scaleX: 1 + 0.08 * Math.max(0, b) }, { scaleY: 1 + 0.55 * b }],
    };
  });
  return <FxPart source={source} box={box} spec={spec} aspect={spec.aspect} style={style} />;
}

/**
 * The flame lights the floor: a flat, two-tone cel pool in Alex's cyans (no soft glow), that
 * stays on the floor while the shark floats and flares on every boost.
 */
function GroundPool({ t, kick, box }: RigProps) {
  const w = box.w * 0.42;
  const h = w * 0.2;
  const style = useAnimatedStyle(() => {
    const b = Math.max(0, boostAt(t.value, kick.value));
    const lift = 0.5 + 0.5 * hoverBob(t.value);
    return {
      // Smaller and fainter the higher the shark hangs; a boost flares it.
      opacity: 0.32 - 0.08 * lift + 0.3 * b,
      transform: [{ translateY: -jetpackFloat(t.value, kick.value, box.h) }, { scaleX: 1 - 0.1 * lift + 0.3 * b }, { scaleY: 1 - 0.1 * lift + 0.2 * b }],
    };
  });
  const left = box.x + G.flame.cx * box.w - w / 2;
  const top = box.y + 0.93 * box.h - h / 2;
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left, top, width: w, height: h }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: h, backgroundColor: CYAN }]} />
      <View style={{ position: 'absolute', left: w * 0.22, top: h * 0.22, width: w * 0.56, height: h * 0.56, borderRadius: h, backgroundColor: CYAN_LIGHT }} />
    </Animated.View>
  );
}

/** In front of the shark: the glow, the floor light, the side flame, the pack, the main flame and the droplets. */
export function JetpackFront(props: RigProps) {
  const { t, kick, box, lod, cue } = props;
  useMomentCue(t, kick, () => { 'worklet'; if (lod === 'still') return -1; const m = momentAt(t.value, kick.value, BOOST_PERIOD, BOOST_LENGTH, 350); return m.cycle < 0 ? -1 : m.p; }, cue ? () => cue('boost') : undefined);
  return (
    <>
      {lod === 'full' && <GroundPool {...props} />}
      <Flame {...props} spec={G.flame2} delay={40} frames={SIDE_FRAMES} />
      <FxPart source={BODY} box={box} spec={G.body} aspect={G.body.aspect} />
      <Flame {...props} spec={G.flame} delay={0} frames={FLAME_FRAMES} />
      {lod === 'full' && SPARKS.map(i => <Spark key={`s${i}`} {...props} i={i} />)}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
