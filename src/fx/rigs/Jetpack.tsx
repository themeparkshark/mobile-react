import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FxPart, RigProps } from '../FxStage';
import { FX_GEOMETRY, PaperBox, partLayout, phaseOf, windowOf } from '../registry';

const G = FX_GEOMETRY.rigs.jetpack;
const BODY = require('../../../assets/fx/jetpack.png');
const FLAME = require('../../../assets/fx/flame.png');

/** Boost: every 6 s the flame stretches and the shark rises (DESIGN.md 3.1 #1). */
export const BOOST_PERIOD = 6000;
export const BOOST_LENGTH = 0.14;

/** 0..1 boost strength at time t (a smooth hump inside the boost window). */
export function boostAt(t: number): number {
  'worklet';
  const w = windowOf(phaseOf(t, BOOST_PERIOD, 0.5), 0, BOOST_LENGTH);
  return w < 0 ? 0 : Math.sin(Math.PI * w);
}

const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7];
const PUFFS = [0, 1, 2, 3];

/** Where the flame leaves the nozzle, in stage pixels. */
function nozzle(box: PaperBox) {
  return { x: box.x + G.flame.cx * box.w, y: box.y + G.flame.cy * box.h };
}

function Spark({ t, box, i }: RigProps & { i: number }) {
  const n = nozzle(box);
  const size = Math.max(4, box.w * 0.02);
  const style = useAnimatedStyle(() => {
    const period = 620 + i * 47;
    const p = phaseOf(t.value, period, i / SPARKS.length);
    const side = ((i * 37) % 11) / 10 - 0.5;
    const boost = boostAt(t.value);
    return {
      opacity: p < 0.08 ? p / 0.08 : 1 - p,
      transform: [
        { translateX: side * box.w * 0.07 * p },
        { translateY: (0.08 + 0.16 * p * (1 + boost)) * box.h },
        { scale: 1 - 0.6 * p },
      ],
    };
  });
  return <Animated.View style={[styles.spark, { left: n.x - size / 2, top: n.y - size / 2, width: size, height: size,
    borderRadius: size, backgroundColor: i % 3 === 0 ? '#fff4b0' : '#ffb42e' }, style]} />;
}

function Puff({ t, box, i }: RigProps & { i: number }) {
  const n = nozzle(box);
  const size = box.w * 0.05;
  const style = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 1500, i / PUFFS.length);
    const side = i % 2 === 0 ? -1 : 1;
    return {
      opacity: 0.45 * (1 - p) * Math.min(1, p * 6),
      transform: [
        { translateX: side * box.w * 0.035 * p },
        { translateY: (0.13 + 0.07 * p) * box.h },
        { scale: 0.45 + 1.1 * p },
      ],
    };
  });
  return <Animated.View style={[styles.puff, { left: n.x - size / 2, top: n.y - size / 2, width: size, height: size,
    borderRadius: size }, style]} />;
}

/** Drawn in front of the shark: flame, glow, sparks and puffs, then the pack itself. */
export function JetpackFront({ t, box, lod }: RigProps) {
  const flame = useAnimatedStyle(() => {
    const v = t.value;
    const boost = boostAt(v);
    const flicker = 1 + 0.11 * Math.sin(v / 41) + 0.07 * Math.sin(v / 23 + 1.3);
    return {
      transform: [
        { rotate: `${G.flame.rot}deg` },
        { scaleX: 1 - 0.06 * Math.sin(v / 31) + 0.08 * boost },
        { scaleY: flicker * (1 + 0.45 * boost) },
      ],
    };
  });
  const glow = useAnimatedStyle(() => {
    const v = t.value;
    const boost = boostAt(v);
    return {
      opacity: 0.55 + 0.2 * Math.sin(v / 57) + 0.25 * boost,
      transform: [{ scaleX: 1.6 + 0.3 * boost }, { scaleY: 1.25 * (1 + 0.45 * boost) }],
    };
  });
  return (
    <>
      <FxPart source={FLAME} box={box} spec={G.flame} aspect={G.flame.aspect} tint="#ffb52e" blur={10} style={glow} />
      {lod === 'full' && PUFFS.map(i => <Puff key={`p${i}`} t={t} box={box} lod={lod} i={i} />)}
      <FxPart source={FLAME} box={box} spec={G.flame} aspect={G.flame.aspect} style={flame} />
      {lod === 'full' && SPARKS.map(i => <Spark key={`s${i}`} t={t} box={box} lod={lod} i={i} />)}
      <FxPart source={BODY} box={box} spec={G.body} aspect={G.body.aspect} />
    </>
  );
}

/** The shark's float: lifted a little, a slower deeper bob, and a rise on every boost. */
export function jetpackFloat(t: number, height: number): number {
  'worklet';
  return -height * (0.06 + 0.028 * Math.sin((t / 2600) * Math.PI * 2) + 0.06 * boostAt(t));
}

/** Where the flame sits, for the contact shadow and tests. */
export function flameLayout(box: PaperBox) {
  return partLayout(box, G.flame, G.flame.aspect);
}

const styles = StyleSheet.create({
  spark: { position: 'absolute', borderWidth: 1, borderColor: '#5a2a00' },
  puff: { position: 'absolute', backgroundColor: 'rgba(238,241,246,0.9)' },
});
