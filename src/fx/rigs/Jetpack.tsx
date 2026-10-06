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

/**
 * Boost: about every 9 s, a little randomly (8 to 11 s apart), and on a tap. Calm and floaty
 * (Dustin, October 5: "how the shark jumps around"): the shark eases up on a bigger flame, hangs,
 * and eases back down. No squash, no pop, no snap: zero velocity at both ends.
 */
export const BOOST_PERIOD = 9000;
export const BOOST_LENGTH = 2500 / BOOST_PERIOD;
export const BOOST_JITTER = 0.22;
export const STILL_T = 800;

/** 0..1..0 with zero velocity and acceleration at both ends (smootherstep). */
function smoother(k: number): number {
  'worklet';
  const x = Math.min(1, Math.max(0, k));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** The rise: starts moving at once (gently, with the flame's flare) and arrives at rest at the top. */
function rise(k: number): number {
  'worklet';
  const x = Math.min(1, Math.max(0, k));
  return 0.1 * (1 - (1 - x) * (1 - x)) + 0.9 * (0.5 - 0.5 * Math.cos(Math.PI * x));
}

/** The fall: leaves the top at rest and lands at rest (no kink at the top, no snap at the bottom). */
function fall(k: number): number {
  'worklet';
  const x = Math.min(1, Math.max(0, k));
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/** The boost lift, 0..1: up over 1.2 s and back down over 1.3 s, near-symmetric, no hop. */
export function boostCurve(p: number): number {
  'worklet';
  if (p < 0 || p >= 1) return 0;
  return p < 0.48 ? rise(p / 0.48) : 1 - fall((p - 0.48) / 0.52);
}

/** The boost window in ms. */
const BOOST_MS = BOOST_PERIOD * BOOST_LENGTH;

/**
 * The flame's thrust, -0.25..1, in real time: it flares with the sound (full within 150 ms),
 * holds to 450 ms, eases off by 900 ms, then burns a little low (0.85x) while the shark settles.
 * Drives the flame, so the flame visibly causes the rise.
 */
export function thrustCurve(p: number): number {
  'worklet';
  if (p < 0 || p >= 1) return 0;
  const ms = p * BOOST_MS;
  if (ms < 150) return smoother(ms / 150);
  if (ms < 450) return 1;
  if (ms < 900) return 1 - 1.25 * smoother((ms - 450) / 450);
  return -0.25 * (1 - smoother((ms - 900) / (BOOST_MS - 900)));
}

export function thrustAt(t: number, kick: number): number {
  'worklet';
  return thrustCurve(momentAt(t, kick, BOOST_PERIOD, BOOST_LENGTH, 350, BOOST_JITTER).p);
}

export function boostAt(t: number, kick: number): number {
  'worklet';
  return boostCurve(momentAt(t, kick, BOOST_PERIOD, BOOST_LENGTH, 350, BOOST_JITTER).p);
}

/**
 * How much of the idle bob applies, 0..1: it fades out over the first second of a boost, stays
 * out through it (so every boost takes off and lands at rest height, 16 pt each way), and fades
 * back in over 1 s after the landing.
 */
export function bobWeight(t: number, kick: number): number {
  'worklet';
  const now = momentAt(t, kick, BOOST_PERIOD, BOOST_LENGTH, 350, BOOST_JITTER).p;
  if (now >= 0) return 1 - smoother((now * BOOST_MS) / 1000);
  // Landed within the last second? A boost lasts 2.5 s, so 1 s ago it was still under way.
  const back = momentAt(t - 1000, kick, BOOST_PERIOD, BOOST_LENGTH, 350, BOOST_JITTER).p;
  if (back < 0) return 1;
  const landedAgo = 1000 - (1 - back) * BOOST_MS;
  return landedAgo <= 0 ? 0 : smoother(landedAgo / 1000);
}

/**
 * How high the shark floats at time t, in px of the stage height (negative is up): a steady lift,
 * a small slow hover bob (a plain sine, 5.4 s), and the boost. The bob fades out during a boost,
 * so every boost peaks at the same height (0.033 of the card above rest).
 */
export function jetpackFloat(t: number, kick: number, height: number): number {
  'worklet';
  const b = boostAt(t, kick);
  return -height * (0.09 + 0.011 * Math.sin((t / 5400) * Math.PI * 2) * bobWeight(t, kick) + 0.033 * b);
}


/** A lazy lean with the boost (never a squash or stretch). */
export function jetpackBody(t: number, kick: number): { sx: number; sy: number; rot: number } {
  'worklet';
  return { sx: 1, sy: 1, rot: 0.8 * Math.sin((t / 5400) * Math.PI * 2) - 1.5 * boostAt(t, kick) };
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
    // A burst of drops with the thrust, not the height.
    const b = Math.max(0, thrustAt(t.value, kick.value));
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
  const fast = thrustAt(v, kick) > 0.2 ? 2 : 1;
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
    const th = thrustAt(v, kick.value);
    return {
      opacity: frameAt(v, kick.value, delay) === k ? 1 : 0,
      // Stretched from the nozzle (the part's anchor) by the thrust: 1.6x as it pushes, a little short as it settles.
      transform: [{ rotate: `${spec.rot}deg` }, { scaleX: pad * (1 + 0.08 * Math.max(0, th)) },
        { scaleY: pad * (1 + 0.6 * Math.max(0, th) + 0.6 * Math.min(0, th)) }],
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
    const p = momentAt(t.value, kick.value, BOOST_PERIOD, BOOST_LENGTH, 350, BOOST_JITTER).p;
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
  useMomentCue(t, kick, () => { 'worklet'; if (lod === 'still') return -1; const m = momentAt(t.value, kick.value, BOOST_PERIOD, BOOST_LENGTH, 350, BOOST_JITTER); return m.cycle < 0 ? -1 : m.p; }, cue ? () => cue('boost') : undefined);
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
