import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FxPart, RigProps, useMomentCue } from '../FxStage';
import { FX_GEOMETRY, PaperBox, momentAt, phaseOf } from '../registry';

const G = FX_GEOMETRY.rigs.reef_halo;
const RING = require('../../../assets/fx/waterring.webp');
const FISH = [
  { spec: G.fishA, source: require('../../../assets/fx/fish-yellow.webp') },
  { spec: G.fishB, source: require('../../../assets/fx/fish-pink.webp') },
  { spec: G.fishC, source: require('../../../assets/fx/fish-yellow.webp') },
];
export const ORBIT_MS = 5200;
export const FLIP_PERIOD = 6500;
const FLIP_LENGTH = 0.14;
export const STILL_T = 0;

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

/**
 * Orbit angle with ease: quicker across the front, slower behind the head, so
 * the depth reads (game feel round 2).
 */
export function orbitAngle(t: number, i: number): number {
  'worklet';
  const a = phaseOf(t, ORBIT_MS) * Math.PI * 2;
  return REST[i] + a + 0.35 * Math.sin(a + REST[i]);
}

/** Which fish flip in this moment: one fish in turn, all three on a tap. */
function flipping(cycle: number, i: number): boolean {
  'worklet';
  return cycle < 0 || cycle % 3 === i;
}

function Fish({ t, kick, box, i, near, lod }: RigProps & { i: number; near: boolean }) {
  const { spec, source } = FISH[i];
  const style = useAnimatedStyle(() => {
    const v = lod === 'still' ? STILL_T : t.value;
    const p = ringPoint(orbitAngle(v, i));
    const show = near ? p.depth > 0 : p.depth <= 0;
    const m = momentAt(v, kick.value, FLIP_PERIOD, FLIP_LENGTH, 350);
    const flip = m.p >= 0 && flipping(m.cycle, i) ? m.p : -1;
    const hop = flip < 0 ? 0 : Math.sin(Math.PI * flip);
    const scale = 0.8 + 0.2 * (p.depth + 1) / 2;
    // Facing the way it swims: thin at the ring's ends, so the turn reads as a turn.
    const face = -Math.max(-1, Math.min(1, p.depth * 3));
    return {
      opacity: show ? (near ? 1 : 0.85) : 0,
      transform: [
        { translateX: (p.x - 0.5) * box.w },
        { translateY: (p.y - 0.5) * box.h - hop * box.h * 0.08 },
        { scale: scale * (1 + 0.15 * hop) },
        { scaleX: Math.abs(face) < 0.15 ? (face < 0 ? -0.15 : 0.15) : face },
        { rotate: `${flip < 0 ? 0 : flip * 360}deg` },
      ],
    };
  });
  // Placed at the box centre; the animated translate moves it onto the ring.
  return <FxPart source={source} box={box} spec={{ cx: 0.5, cy: 0.5, w: spec.w, aspect: spec.aspect }} aspect={spec.aspect} style={style} />;
}

/** Half of the drawn water ring: the far half behind the head, the near half in front. */
function Ring({ box, half }: { box: PaperBox; half: 'back' | 'front' }) {
  const r = G.ring;
  const w = 2 * r.rx * box.w * r.scale;
  const h = w * r.aspect;
  const cx = box.x + r.cx * box.w;
  const cy = box.y + r.cy * box.h;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h,
      transform: [{ rotate: `${r.tilt}deg` }] }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: half === 'back' ? 0 : h / 2, height: h / 2, overflow: 'hidden' }}>
        <Image source={RING} style={{ position: 'absolute', left: 0, top: half === 'back' ? 0 : -h / 2, width: w, height: h }}
          contentFit="fill" cachePolicy="memory" />
      </View>
    </View>
  );
}

const SPLASH = [0, 1, 2, 3];

/** A splash of bubbles off the flipping fish (full LOD). */
function Splash({ t, kick, box, j }: RigProps & { j: number }) {
  const size = box.w * (0.02 + (j % 2) * 0.012);
  const style = useAnimatedStyle(() => {
    const m = momentAt(t.value, kick.value, FLIP_PERIOD, FLIP_LENGTH, 350);
    if (m.p < 0) return { opacity: 0 };
    const i = m.cycle < 0 ? j % 3 : m.cycle % 3;
    const p = ringPoint(orbitAngle(t.value, i));
    const a = (j / SPLASH.length) * Math.PI * 2;
    const d = m.p * box.w * 0.07;
    return {
      opacity: Math.sin(Math.PI * m.p),
      transform: [{ translateX: p.x * box.w + box.x + Math.cos(a) * d - size / 2 },
        { translateY: p.y * box.h + box.y - Math.abs(Math.sin(a)) * d - m.p * box.h * 0.04 - size / 2 }],
    };
  });
  return <Animated.View style={[styles.bubble, { width: size, height: size, borderRadius: size }, style]} />;
}

/** Behind the shark: the far half of the ring and the fish swimming behind the head. */
export function ReefHaloBack(props: RigProps) {
  return (
    <>
      <Ring box={props.box} half="back" />
      {FISH.map((_, i) => <Fish key={i} {...props} i={i} near={false} />)}
    </>
  );
}

/** In front: the near half of the ring, the near fish and the bubble splash. */
export function ReefHaloFront(props: RigProps) {
  const { t, kick, lod, cue } = props;
  useMomentCue(() => { 'worklet'; return lod === 'still' ? -1 : momentAt(t.value, kick.value, FLIP_PERIOD, FLIP_LENGTH, 350).p; }, cue ? () => cue('flip') : undefined);
  return (
    <>
      <Ring box={props.box} half="front" />
      {FISH.map((_, i) => <Fish key={i} {...props} i={i} near />)}
      {lod === 'full' && SPLASH.map(j => <Splash key={j} {...props} j={j} />)}
    </>
  );
}

// Bubbles: a pale ring with a white rim (drawn style), not a soft blur.
const styles = StyleSheet.create({
  bubble: { position: 'absolute', left: 0, top: 0, backgroundColor: 'rgba(225,250,255,0.45)', borderWidth: 2, borderColor: '#28405c' },
});
