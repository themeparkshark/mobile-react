import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { FxPart, RigProps } from '../FxStage';
import { FX_GEOMETRY, PaperBox, phaseOf, windowOf } from '../registry';

const G = FX_GEOMETRY.rigs.reef_halo;
const FISH = [
  { spec: G.fishA, source: require('../../../assets/fx/fish-yellow.png') },
  { spec: G.fishB, source: require('../../../assets/fx/fish-pink.png') },
  { spec: G.fishC, source: require('../../../assets/fx/fish-yellow.png') },
];
export const ORBIT_MS = 5200;
const FLIP_PERIOD = 7000;

/** A fish's spot on the tilted ring: x, y in box fractions and depth (-1 far, +1 near). */
export function ringPoint(angle: number): { x: number; y: number; depth: number } {
  'worklet';
  const r = G.ring;
  const tilt = (r.tilt * Math.PI) / 180;
  const ex = r.rx * Math.cos(angle);
  const ey = r.ry * Math.sin(angle);
  return {
    x: r.cx + ex * Math.cos(tilt) - ey * Math.sin(tilt),
    y: r.cy + ex * Math.sin(tilt) + ey * Math.cos(tilt),
    depth: Math.sin(angle),
  };
}

/** The resting angles match compose.py's rest frame (100, 220 and 340 degrees). */
const REST = [100, 220, 340].map(d => (d * Math.PI) / 180);

function Fish({ t, box, i, near }: RigProps & { i: number; near: boolean }) {
  const { spec, source } = FISH[i];
  const style = useAnimatedStyle(() => {
    const angle = REST[i] + phaseOf(t.value, ORBIT_MS) * Math.PI * 2;
    const p = ringPoint(angle);
    const show = near ? p.depth > 0 : p.depth <= 0;
    const flip = i === 0 ? windowOf(phaseOf(t.value, FLIP_PERIOD, 0.2), 0, 0.12) : -1;
    const hop = flip < 0 ? 0 : Math.sin(Math.PI * flip);
    const scale = 0.8 + 0.2 * (p.depth + 1) / 2;
    // Facing the way it swims: thin at the ring's ends, so the turn reads as a turn.
    const face = -Math.max(-1, Math.min(1, p.depth * 3));
    return {
      opacity: show ? (near ? 1 : 0.85) : 0,
      transform: [
        { translateX: (p.x - 0.5) * box.w },
        { translateY: (p.y - 0.5) * box.h - hop * box.h * 0.045 },
        { scale },
        { scaleX: Math.abs(face) < 0.15 ? (face < 0 ? -0.15 : 0.15) : face },
        { rotate: `${flip < 0 ? 0 : flip * 360}deg` },
      ],
    };
  });
  // Placed at the box centre; the animated translate moves it onto the ring.
  return <FxPart source={source} box={box} spec={{ cx: 0.5, cy: 0.5, w: spec.w, aspect: spec.aspect }} aspect={spec.aspect} style={style} />;
}

function Ring({ box, half }: { box: PaperBox; half: 'back' | 'front' }) {
  const r = G.ring;
  const cx = box.x + r.cx * box.w; const cy = box.y + r.cy * box.h;
  const rx = r.rx * box.w; const ry = r.ry * box.h;
  const sw = Math.max(2, r.stroke * box.w);
  const d = half === 'back'
    ? `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`
    : `M ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`;
  const glint = `M ${cx + rx * 0.2} ${cy + ry * 0.98} A ${rx} ${ry} 0 0 0 ${cx - rx * 0.35} ${cy + ry * 0.94}`;
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Path d={d} stroke="#28405c" strokeWidth={sw + 3} fill="none" strokeLinecap="round" transform={`rotate(${r.tilt} ${cx} ${cy})`} />
      <Path d={d} stroke="#6edcf0" strokeOpacity={0.92} strokeWidth={sw} fill="none" strokeLinecap="round"
        transform={`rotate(${r.tilt} ${cx} ${cy})`} />
      {half === 'front' && <Path d={glint} stroke="#ffffff" strokeOpacity={0.9} strokeWidth={Math.max(1.5, sw / 3)} fill="none"
        strokeLinecap="round" transform={`rotate(${r.tilt} ${cx} ${cy})`} />}
    </Svg>
  );
}

const BUBBLES = [0, 1, 2, 3];

function Bubble({ t, box, i }: RigProps & { i: number }) {
  const size = Math.max(4, box.w * (0.014 + (i % 2) * 0.006));
  const style = useAnimatedStyle(() => {
    const p = phaseOf(t.value, 2300 + i * 210, i / BUBBLES.length);
    const start = ringPoint(REST[i % 3] + i * 1.7);
    return {
      opacity: Math.sin(Math.PI * p) * 0.9,
      transform: [
        { translateX: start.x * box.w + Math.sin(p * 6 + i) * box.w * 0.01 },
        { translateY: start.y * box.h - p * box.h * 0.09 },
      ],
    };
  });
  return <Animated.View style={[styles.bubble, { left: box.x - size / 2, top: box.y - size / 2, width: size, height: size,
    borderRadius: size }, style]} />;
}

/** Behind the shark: the far half of the ring and the fish swimming behind the head. */
export function ReefHaloBack({ t, box, lod }: RigProps) {
  return (
    <>
      <Ring box={box} half="back" />
      {FISH.map((_, i) => <Fish key={i} t={t} box={box} lod={lod} i={i} near={false} />)}
    </>
  );
}

/** In front: the near half of the ring, the near fish and the bubbles. */
export function ReefHaloFront({ t, box, lod }: RigProps) {
  return (
    <>
      <Ring box={box} half="front" />
      {FISH.map((_, i) => <Fish key={i} t={t} box={box} lod={lod} i={i} near />)}
      {lod === 'full' && BUBBLES.map(i => <Bubble key={i} t={t} box={box} lod={lod} i={i} />)}
    </>
  );
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', backgroundColor: 'rgba(220,250,255,0.35)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)' },
});
