import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FxPart, RigProps } from '../FxStage';
import { FX_GEOMETRY, partLayout, phaseOf, windowOf } from '../registry';

const G = FX_GEOMETRY.rigs.plasma_blade.blade;
const BLADE = require('../../../assets/fx/blade.png');

export const SWING_PERIOD = 4500;
export const SWING_LENGTH = 0.2;
const SWING_DEG = -34; // outward, away from the face

/** Extra rotation of the blade at time t: a quick slash out and back every 4.5 s. */
export function swingAt(t: number): number {
  'worklet';
  const w = windowOf(phaseOf(t, SWING_PERIOD, 0.35), 0, SWING_LENGTH);
  if (w < 0) return 0;
  // Fast out (ease out), slower settle back.
  const out = w < 0.35 ? Math.sin((w / 0.35) * Math.PI / 2) : Math.cos(((w - 0.35) / 0.65) * Math.PI / 2);
  return SWING_DEG * out;
}

const TRAIL = [1, 2, 3];

function Trail({ t, box, i }: RigProps & { i: number }) {
  const style = useAnimatedStyle(() => {
    const now = swingAt(t.value);
    const lag = swingAt(t.value - i * 34);
    const moving = Math.abs(now - lag);
    return {
      opacity: Math.min(1, moving / 6) * (0.5 - i * 0.13),
      transform: [{ rotate: `${G.rot + lag}deg` }],
    };
  });
  return <FxPart source={BLADE} box={box} spec={G} aspect={G.aspect} tint="#7fe8ff" style={style} />;
}

/** A light mote that runs from the hilt to the tip along the blade. */
function Mote({ t, box }: RigProps) {
  const l = partLayout(box, G, G.aspect);
  const size = Math.max(4, box.w * 0.016);
  const gripX = l.left + (G.ax ?? 0.5) * l.width;
  const gripY = l.top + (G.ay ?? 0.5) * l.height;
  const length = l.height * 0.66;
  const style = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 1600);
    const angle = ((G.rot + swingAt(t.value)) * Math.PI) / 180;
    const d = length * (0.12 + 0.88 * p);
    return {
      opacity: Math.sin(Math.PI * p),
      transform: [{ translateX: Math.sin(angle) * d }, { translateY: -Math.cos(angle) * d }],
    };
  });
  return <Animated.View style={[styles.mote, { left: gripX - size / 2, top: gripY - size / 2, width: size, height: size,
    borderRadius: size }, style]} />;
}

/** In front of the shark: the glow, the swing trail, the blade, and a light mote. */
export function PlasmaBladeFront({ t, box, lod }: RigProps) {
  const glow = useAnimatedStyle(() => {
    const v = t.value;
    const s = swingAt(v);
    return {
      opacity: 0.5 + 0.25 * Math.sin((v / 1600) * Math.PI * 2) + Math.abs(s) / 90,
      transform: [{ rotate: `${G.rot + s}deg` }, { scale: 1.12 }],
    };
  });
  const blade = useAnimatedStyle(() => ({ transform: [{ rotate: `${G.rot + swingAt(t.value)}deg` }] }));
  return (
    <>
      <FxPart source={BLADE} box={box} spec={G} aspect={G.aspect} tint="#5fd8ff" blur={12} style={glow} />
      {lod === 'full' && TRAIL.map(i => <Trail key={i} t={t} box={box} lod={lod} i={i} />)}
      <FxPart source={BLADE} box={box} spec={G} aspect={G.aspect} style={blade} />
      {lod === 'full' && <Mote t={t} box={box} lod={lod} />}
    </>
  );
}

const styles = StyleSheet.create({
  mote: { position: 'absolute', backgroundColor: '#ffffff', shadowColor: '#9ff0ff', shadowOpacity: 1, shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 } },
});
