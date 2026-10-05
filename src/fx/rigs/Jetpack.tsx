import { StyleSheet } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
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
// Each drawing's keyline: his silhouette grown by 7 px (paper scale) in navy, baked, so it is an
// even line like his charcoal outline round the pack (a scaled copy hid under the drawing on cyan).
const FLAME_KEYS = [
  require('../../../assets/fx/jet-flame-0-key.webp'),
  require('../../../assets/fx/jet-flame-1-key.webp'),
  require('../../../assets/fx/jet-flame-2-key.webp'),
];
const SIDE_KEYS = [
  require('../../../assets/fx/jet-flame-side-0-key.webp'),
  require('../../../assets/fx/jet-flame-side-1-key.webp'),
  require('../../../assets/fx/jet-flame-side-2-key.webp'),
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

/**
 * The bob's warped phase: a smooth time warp (no kink) that lingers about 35% longer at the
 * top and drops quicker through the bottom: weight, not a sine (game feel round 7).
 */
export function hoverPhase(t: number): number {
  'worklet';
  const u = ((t / 2600) % 1 + 1) % 1;
  return u + 0.0557 * (Math.cos(2 * Math.PI * u) - 1);
}

/** The idle bob, -1..1 (1 is the top). */
export function hoverBob(t: number): number {
  'worklet';
  return Math.sin(2 * Math.PI * hoverPhase(t));
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
  return { sx, sy, rot: 1.4 * Math.cos(2 * Math.PI * hoverPhase(t)) - 3 * Math.max(0, b) };
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
  const size = box.w * 0.05;
  const style = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 620 + i * 61, i / SPARKS.length);
    const side = ((i * 37) % 11) / 10 - 0.5;
    const b = Math.max(0, boostAt(t.value, kick.value));
    const dir = side < 0 ? -1 : 1;
    const spread = (0.25 + Math.abs(side)) * box.w * (0.09 + 0.06 * b);
    const fall = box.h * (1 + 0.5 * b);
    // Velocity (d/dp of the path below): the tail points back along it, at the nozzle: a drip, not a bubble.
    const vx = dir * spread * 0.5 / Math.sqrt(Math.max(p, 0.02));
    const vy = (0.11 + 0.18 * p) * fall;
    return {
      opacity: p < 0.08 ? p / 0.08 : 1 - p * p,
      transform: [
        // Thrown outward from the nozzle, then falling: exhaust spit.
        { translateX: n.x - size / 2 + dir * spread * Math.sqrt(p) },
        { translateY: n.y - size / 2 + (0.1 + 0.11 * p + 0.09 * p * p) * fall },
        { rotate: `${(-Math.atan2(vx, vy) * 180) / Math.PI}deg` },
        { scale: (1 - 0.4 * p) * (1 + 0.4 * b) },
      ],
    };
  });
  return <Animated.Image source={DROP} style={[styles.abs, { width: size, height: size }, style]} />;
}

/**
 * The drawing of the loop on screen at time v: stepped, and twice as fast on a boost.
 * Always 0, 1 or 2, also before the clock reaches 0 (a stage's settle delay starts it
 * negative), so exactly one drawing is on screen at every moment.
 */
export function frameAt(v: number, kick: number, delay: number): number {
  'worklet';
  const fast = boostAt(v, kick) > 0.2 ? 2 : 1;
  const n = Math.floor(((v + delay) * fast) / FLAME_FRAME_MS);
  return ((n % 3) + 3) % 3;
}


/**
 * One of Alex's flames: his three drawings swap on a stepped cadence (no blur, no glow),
 * and the boost stretches the drawing long from its nozzle (squashed by the dip).
 */
function Flame({ t, kick, box, lod, spec, delay, frames, keys }: RigProps & { spec: typeof G.flame; delay: number; frames: number[]; keys: number[] }) {
  return (
    <>
      {frames.map((source, k) => <FlameFrame key={k} t={t} kick={kick} box={box} lod={lod} spec={spec} delay={delay} source={source} keyline={keys[k]} k={k} />)}
    </>
  );
}

function FlameFrame({ t, kick, box, lod, spec, delay, source, keyline, k }: Pick<RigProps, 't' | 'kick' | 'box' | 'lod'> & { spec: typeof G.flame; delay: number; source: number; keyline: number; k: number }) {
  const shape = (pad: number) => {
    'worklet';
    // Reduce Motion holds frame 0: Alex's paper drawing exactly.
    if (lod === 'still') return { opacity: k === 0 ? 1 : 0, transform: [{ scaleX: pad }, { scaleY: pad }] };
    const v = t.value;
    const b = boostAt(v, kick.value);
    return {
      opacity: frameAt(v, kick.value, delay) === k ? 1 : 0,
      // Stretched from the nozzle (the part's anchor): squashed by the dip, 1.6x on the pop.
      transform: [{ rotate: `${spec.rot}deg` }, { scaleX: pad * (1 + 0.08 * Math.max(0, b)) }, { scaleY: pad * (1 + 0.6 * b) }],
    };
  };
  const style = useAnimatedStyle(() => shape(1));
  // The navy keyline behind the drawing moves with it exactly (same style): his flame reads on any
  // backdrop, his drawing untouched on top.

  // A white-hot core: the same drawing, tinted white, small at the nozzle (it sits on his own white core).
  const core = useAnimatedStyle(() => { const s = shape(0.6); return { ...s, opacity: s.opacity * 0.9 }; });
  return (
    <>
      <FxPart source={keyline} box={box} spec={spec} aspect={spec.aspect} style={style} />
      <FxPart source={source} box={box} spec={spec} aspect={spec.aspect} style={style} />
      <FxPart source={source} box={box} spec={spec} aspect={spec.aspect} tint="#ffffff" style={core} />
    </>
  );
}

/**
 * The flame's light on the floor: a flat 1:4 cel oval in Alex's cyans, centred under the
 * nozzle, never rotated (drawn outside the moving shark). It shrinks and fades the higher the
 * shark hangs, so a boost makes it smaller and fainter, never bigger.
 */
export function JetpackFloorLight({ t, kick, box, floorY }: Pick<RigProps, 't' | 'kick' | 'box'> & { floorY: number }) {
  const w = box.w * 0.2;
  const h = w / 4;
  const style = useAnimatedStyle(() => {
    // 0 at rest height, about 1 at the top of a boost: the pool shrinks to 0.8x as the shark rises...
    const lift = Math.min(1, Math.max(0, (-jetpackFloat(t.value, kick.value, box.h) / box.h - 0.075) / 0.17));
    const k = 1 - 0.2 * lift;
    // ...but the pop itself flashes the floor for 150 ms: the thrust hits, then eases off.
    const p = momentAt(t.value, kick.value, BOOST_PERIOD, BOOST_LENGTH, 350).p;
    const popMs = BOOST_PERIOD * BOOST_LENGTH;
    const since = p < 0 ? -1 : p * popMs - 0.1 * popMs;
    const flash = since >= 0 && since < 150 ? 0.3 * (1 - since / 150) : 0;
    return { opacity: Math.min(1, 0.8 * k + flash), transform: [{ scaleX: k }, { scaleY: k }] };
  });
  const left = box.x + G.flame.cx * box.w - w / 2;
  // On the floor the shark stands on (the contact shadow's line: the plinth top in the shop).
  const top = floorY - h / 2;
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left, top, width: w, height: h }, style]}>
      {/* A true ellipse in two flat cel bands (no straight edges, no blur). */}
      <Svg width={w} height={h} viewBox="0 0 100 25">
        <Ellipse cx="50" cy="12.5" rx="50" ry="12.5" fill={CYAN} fillOpacity={0.25} />
        <Ellipse cx="50" cy="12.5" rx="27" ry="6.5" fill={CYAN_LIGHT} fillOpacity={0.35} />
      </Svg>
    </Animated.View>
  );
}

/** In front of the shark: the glow, the floor light, the side flame, the pack, the main flame and the droplets. */
export function JetpackFront(props: RigProps) {
  const { t, kick, box, lod, cue } = props;
  useMomentCue(t, kick, () => { 'worklet'; if (lod === 'still') return -1; const m = momentAt(t.value, kick.value, BOOST_PERIOD, BOOST_LENGTH, 350); return m.cycle < 0 ? -1 : m.p; }, cue ? () => cue('boost') : undefined);
  return (
    <>
      <Flame {...props} spec={G.flame2} delay={40} frames={SIDE_FRAMES} keys={SIDE_KEYS} />
      <FxPart source={BODY} box={box} spec={G.body} aspect={G.body.aspect} />
      <Flame {...props} spec={G.flame} delay={0} frames={FLAME_FRAMES} keys={FLAME_KEYS} />
      {lod === 'full' && SPARKS.map(i => <Spark key={`s${i}`} {...props} i={i} />)}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
