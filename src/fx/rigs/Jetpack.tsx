import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FxPart, RigProps, useMomentCue } from '../FxStage';
import { FX_GEOMETRY, PaperBox, momentAt, partLayout, phaseOf } from '../registry';

const G = FX_GEOMETRY.rigs.jetpack;
const BODY = require('../../../assets/fx/jetpack.webp');
const FLAME = require('../../../assets/fx/flame.webp');
const GLOW = require('../../../assets/fx/glow.webp');
const SPARK = require('../../../assets/fx/spark.webp');
const PUFF = require('../../../assets/fx/puff.webp');

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

/** How high the shark floats at time t, in px of the stage height (negative is up). */
export function jetpackFloat(t: number, kick: number, height: number): number {
  'worklet';
  return -height * (0.1 + 0.025 * Math.sin((t / 2600) * Math.PI * 2) + 0.07 * boostAt(t, kick));
}

const SPARKS = [0, 1, 2, 3, 4, 5];
const PUFFS = [0, 1, 2];

function nozzle(box: PaperBox) {
  return { x: box.x + G.flame.cx * box.w, y: box.y + G.flame.cy * box.h };
}

/** Drawn spark stars spray from the nozzle; a boost throws a burst of them. */
function Spark({ t, kick, box, i }: RigProps & { i: number }) {
  const n = nozzle(box);
  const size = box.w * 0.035;
  const style = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 700 + i * 53, i / SPARKS.length);
    const side = ((i * 37) % 11) / 10 - 0.5;
    const b = Math.max(0, boostAt(t.value, kick.value));
    return {
      opacity: p < 0.08 ? p / 0.08 : 1 - p,
      transform: [
        { translateX: n.x - size / 2 + side * box.w * (0.08 + 0.06 * b) * p },
        { translateY: n.y - size / 2 + (0.09 + 0.15 * p * (1 + b)) * box.h },
        { scale: (1 - 0.6 * p) * (1 + 0.6 * b) },
        { rotate: `${p * 180}deg` },
      ],
    };
  });
  return <Animated.Image source={SPARK} style={[styles.abs, { width: size, height: size }, style]} />;
}

/** Drawn smoke puffs roll out under the flame. */
function Puff({ t, box, i }: RigProps & { i: number }) {
  const n = nozzle(box);
  const w = box.w * 0.07;
  const h = w * 0.7578;
  const style = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 1700, i / PUFFS.length);
    const side = i === 1 ? 1 : -1;
    return {
      opacity: 0.85 * (1 - p) * Math.min(1, p * 6),
      transform: [
        { translateX: n.x - w / 2 + side * box.w * 0.04 * p },
        { translateY: n.y - h / 2 + (0.14 + 0.07 * p) * box.h },
        { scale: 0.4 + 0.9 * p },
      ],
    };
  });
  return <Animated.Image source={PUFF} style={[styles.abs, { width: w, height: h }, style]} />;
}

function Flame({ t, kick, box, lod, spec, delay }: RigProps & { spec: typeof G.flame; delay: number }) {
  const style = useAnimatedStyle(() => {
    const v = (lod === 'still' ? STILL_T : t.value) + delay;
    const b = boostAt(v, kick.value);
    const flicker = 1 + 0.11 * Math.sin(v / 41) + 0.07 * Math.sin(v / 23 + 1.3);
    return {
      transform: [
        { rotate: `${spec.rot}deg` },
        { scaleX: 1 - 0.06 * Math.sin(v / 31) + 0.1 * Math.max(0, b) },
        // The dip squashes the flame, the pop stretches it long.
        { scaleY: flicker * (1 + 0.6 * b) },
      ],
    };
  });
  return <FxPart source={FLAME} box={box} spec={spec} aspect={spec.aspect} style={style} />;
}

/** In front of the shark: the far flame, the pack, the near flame, glow, sparks and puffs. */
export function JetpackFront(props: RigProps) {
  const { t, kick, box, lod, cue } = props;
  useMomentCue(() => { 'worklet'; return lod === 'still' ? -1 : momentAt(t.value, kick.value, BOOST_PERIOD, BOOST_LENGTH, 350).p; }, cue ? () => cue('boost') : undefined);
  const f = partLayout(box, G.flame, G.flame.aspect);
  const glowSize = f.width * 3.2;
  const glow = useAnimatedStyle(() => {
    const v = lod === 'still' ? STILL_T : t.value;
    const b = boostAt(v, kick.value);
    return { opacity: 0.6 + 0.15 * Math.sin(v / 57) + 0.25 * Math.max(0, b), transform: [{ scaleY: 1.3 + 0.5 * Math.max(0, b) }] };
  });
  return (
    <>
      {/* A warm glow sprite around the flames (never a blurred copy). */}
      <Animated.Image source={GLOW} style={[styles.abs, { left: f.left + f.width / 2 - glowSize / 2, top: f.top - glowSize * 0.15,
        width: glowSize, height: glowSize, tintColor: '#ffb43a' }, glow]} />
      {lod === 'full' && PUFFS.map(i => <Puff key={`p${i}`} {...props} i={i} />)}
      <Flame {...props} spec={G.flame2} delay={90} />
      <FxPart source={BODY} box={box} spec={G.body} aspect={G.body.aspect} />
      <Flame {...props} spec={G.flame} delay={0} />
      {lod === 'full' && SPARKS.map(i => <Spark key={`s${i}`} {...props} i={i} />)}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
