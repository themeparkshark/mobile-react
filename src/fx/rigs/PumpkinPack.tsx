import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FxPart, RigProps, useMomentCue } from '../FxStage';
import { FX_GEOMETRY, hash01, momentAt, phaseOf } from '../registry';
import { BOOST_JITTER, BOOST_LENGTH, BOOST_PERIOD, frameAt, thrustAt } from './Jetpack';

/**
 * Pumpkin Rocket Pack (Halloween, secret-shop/DESIGN-WAVE2.md 4.1): the Jetpack 3000 rig with a
 * jack-o'-lantern tank. Same calm float and boost (FX_FLOATS, jetpackFloat), so the shark moves
 * exactly as Dustin approved; the flame is Alex's own three Jetpack 3000 drawings recoloured pumpkin
 * orange, stepped like his loop, with a dark keyline. The carved face flickers like a candle inside.
 */
const G = FX_GEOMETRY.rigs.pumpkin_pack;
const BODY = require('../../../assets/fx/pumpkin-pack.webp');
const FRAMES = [
  require('../../../assets/fx/pump-flame-0.webp'),
  require('../../../assets/fx/pump-flame-1.webp'),
  require('../../../assets/fx/pump-flame-2.webp'),
];
const KEYS = [
  require('../../../assets/fx/pump-flame-0-key.webp'),
  require('../../../assets/fx/pump-flame-1-key.webp'),
  require('../../../assets/fx/pump-flame-2-key.webp'),
];
const DROP = require('../../../assets/fx/pump-drop.webp');
const GLOW = require('../../../assets/fx/glow.webp');

/** Candle light in the carved face: mostly steady, small slow swells, a rare soft dip (never a strobe). */
export function candleAt(t: number): number {
  'worklet';
  const slot = Math.floor(t / 140);
  const dip = hash01(slot + 3) > 0.9 ? 0.8 : 1;
  return dip * (0.86 + 0.08 * Math.sin(t / 310) + 0.06 * Math.sin(t / 173));
}

function FlameFrame({ t, kick, box, lod, source, keyline, k }: Pick<RigProps, 't' | 'kick' | 'box' | 'lod'> & { source: number; keyline: number; k: number }) {
  const style = useAnimatedStyle(() => {
    if (lod === 'still') return { opacity: k === 0 ? 1 : 0 };
    const v = t.value;
    const th = thrustAt(v, kick.value);
    return {
      opacity: frameAt(v, kick.value, 0) === k ? 1 : 0,
      transform: [{ scaleX: 1 + 0.08 * Math.max(0, th) }, { scaleY: 1 + 0.6 * Math.max(0, th) + 0.6 * Math.min(0, th) }],
    };
  });
  const core = useAnimatedStyle(() => {
    if (lod === 'still') return { opacity: k === 0 ? 0.85 : 0, transform: [{ scale: 0.55 }] };
    const v = t.value;
    const th = thrustAt(v, kick.value);
    return {
      opacity: frameAt(v, kick.value, 0) === k ? 0.85 : 0,
      transform: [{ scaleX: 0.55 * (1 + 0.08 * Math.max(0, th)) }, { scaleY: 0.55 * (1 + 0.6 * Math.max(0, th) + 0.6 * Math.min(0, th)) }],
    };
  });
  return (
    <>
      <FxPart source={keyline} box={box} spec={G.flame} aspect={G.flame.aspect} style={style} />
      <FxPart source={source} box={box} spec={G.flame} aspect={G.flame.aspect} style={style} />
      {/* A yellow-hot core (the same drawing, tinted, smaller at the nozzle), so the flame reads apart from the pumpkin. */}
      <FxPart source={source} box={box} spec={G.flame} aspect={G.flame.aspect} tint="#fff1b0" style={core} />
    </>
  );
}

const DROPS = [0, 1, 2];

/** A few embers off the flame (Alex's droplet, recoloured orange), fading fast; a little livelier on a boost. */
function Drop({ t, kick, box, i }: RigProps & { i: number }) {
  const size = box.w * 0.045;
  const x0 = box.x + G.flame.cx * box.w;
  const y0 = box.y + G.flame.cy * box.h;
  const style = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 700 + i * 67, i / DROPS.length);
    const side = ((i * 37) % 11) / 10 - 0.5;
    const b = Math.max(0, thrustAt(t.value, kick.value));
    const dir = side < 0 ? -1 : 1;
    const spread = (0.25 + Math.abs(side)) * box.w * (0.07 + 0.05 * b);
    const fall = box.h * (0.9 + 0.4 * b);
    return {
      opacity: p < 0.08 ? p / 0.08 : (1 - p) * (1 - p),
      transform: [{ translateX: x0 - size / 2 + dir * spread * Math.sqrt(p) },
        { translateY: y0 - size / 2 + (0.09 + 0.1 * p + 0.08 * p * p) * fall }, { scale: (1 - 0.4 * p) * (1 + 0.3 * b) }],
    };
  });
  return <Animated.Image source={DROP} style={[styles.abs, { width: size, height: size }, style]} />;
}

/** The face's candle glow (a soft sprite, no blur), brighter on a boost. */
function FaceGlow({ t, kick, box, lod }: Pick<RigProps, 't' | 'kick' | 'box' | 'lod'>) {
  const size = G.face.w * box.w;
  const style = useAnimatedStyle(() => {
    if (lod === 'still') return { opacity: 0.85 };
    const b = Math.max(0, thrustAt(t.value, kick.value));
    return { opacity: Math.min(1, 0.7 * candleAt(t.value) + 0.3 * b), transform: [{ scale: 0.95 + 0.1 * candleAt(t.value + 500) }] };
  });
  return <Animated.Image source={GLOW} style={[styles.abs, { left: box.x + G.face.cx * box.w - size / 2,
    top: box.y + G.face.cy * box.h - size / 2, width: size, height: size, tintColor: '#ffb21a' }, style]} />;
}

/** In front of the shark: the flame (behind the tank), the pumpkin pack, its candle glow and the drips. */
export function PumpkinPackFront(props: RigProps) {
  const { t, kick, lod, cue } = props;
  useMomentCue(t, kick, () => { 'worklet'; if (lod === 'still') return -1; const m = momentAt(t.value, kick.value, BOOST_PERIOD, BOOST_LENGTH, 350, BOOST_JITTER); return m.cycle < 0 ? -1 : m.p; },
    cue ? () => cue('pumpkin_boost') : undefined);
  return (
    <>
      {FRAMES.map((source, k) => <FlameFrame key={k} {...props} source={source} keyline={KEYS[k]} k={k} />)}
      <FxPart source={BODY} box={props.box} spec={G.body} aspect={G.body.aspect} />
      <FaceGlow {...props} />
      {lod === 'full' && DROPS.map(i => <Drop key={`d${i}`} {...props} i={i} />)}
    </>
  );
}


const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
