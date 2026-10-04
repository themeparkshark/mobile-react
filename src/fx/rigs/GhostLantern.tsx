import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { RigProps, useMomentCue } from '../FxStage';
import { FX_GEOMETRY, hash01, momentAt, partLayout } from '../registry';

const G = FX_GEOMETRY.rigs.ghost_lantern;
const LANTERN = require('../../../assets/fx/lantern.webp');
const GHOST = require('../../../assets/fx/ghost.webp');
const GLOW = require('../../../assets/fx/glow.webp');
/** The purple flame inside lantern.webp (part fractions). */
export const FLAME_AT = { x: 0.54, y: 0.624 };
export const PEEK_PERIOD = 6000;
export const PEEK_LENGTH = 0.4;
/** Reduce Motion: frozen mid-peek, the ghost waving beside the lantern (its signature moment). */
export const STILL_P = 0.42;

/** The sway about the carrying ring, in degrees. */
export function swayAt(t: number): number {
  'worklet';
  return 6 * Math.sin((t / 2200) * Math.PI * 2);
}

/**
 * Flame light: mostly steady, with brief random dips (40-80 ms), like a real
 * flame rather than a breathing sine (game feel round 2).
 */
export function flickerAt(t: number): number {
  'worklet';
  const slot = Math.floor(t / 90);
  const dip = hash01(slot) > 0.86 ? 0.45 + 0.3 * hash01(slot + 7) : 1;
  return dip * (0.92 + 0.08 * Math.sin(t / 130));
}

/**
 * The ghost's path in lantern sizes, from the lantern's top: it rises out of
 * the top, then loops once all the way around the lantern (art panel round 2)
 * and tucks back in. On the far half of the loop it is drawn behind the
 * lantern and the shark (`front` false), so it never sits on the belly like a
 * sticker. Every other peek it loops the other way.
 */
export function ghostPose(p: number, cycle: number): { x: number; y: number; s: number; o: number; front: boolean } {
  'worklet';
  if (p < 0) return { x: 0, y: 0, s: 0.2, o: 0, front: true };
  if (p < 0.18) { const k = p / 0.18; return { x: 0, y: -0.25 * k, s: 0.3 + 0.7 * k, o: Math.min(1, k * 2.5), front: true }; }
  if (p < 0.82) {
    const k = (p - 0.18) / 0.64;
    const th = k * Math.PI * 2;
    const dir = cycle > 0 && cycle % 2 === 1 ? 1 : -1;
    const x = dir * 0.8 * Math.sin(th);
    const y = 0.35 - 0.6 * Math.cos(th);
    // The near side of the loop (toward open water, left of the lantern) is in front.
    return { x, y, s: 1 - 0.15 * Math.sin(k * Math.PI), o: 1, front: x <= 0.05 };
  }
  const k = (p - 0.82) / 0.18;
  return { x: 0, y: -0.25 * (1 - k), s: 1 - 0.7 * k, o: 1 - k, front: true };
}

/** Lantern-shaped container that sways about the carrying ring (shared by both layers). */
function useLanternFrame({ t, box, lod }: RigProps) {
  const still = lod === 'still';
  const l = partLayout(box, G.lantern, G.lantern.aspect);
  const sway = useAnimatedStyle(() => ({ transform: [{ rotate: `${G.lantern.rot + (still ? 0 : swayAt(t.value))}deg` }] }));
  return { l, sway, still };
}

function Ghost({ t, kick, box, lod, front, l }: RigProps & { front: boolean | 'both'; l: ReturnType<typeof partLayout> }) {
  const still = lod === 'still';
  const ghostW = G.ghost.w * box.w;
  const ghostH = ghostW * G.ghost.aspect;
  const ghost = useAnimatedStyle(() => {
    const m = still ? { p: STILL_P, cycle: 0 } : momentAt(t.value, kick.value, PEEK_PERIOD, PEEK_LENGTH, 350);
    // In a tile the loop always goes right, into the open space (never over the corner tag).
    const g = ghostPose(m.p, front === 'both' ? 1 : m.cycle);
    return { opacity: front === 'both' || g.front === front ? g.o : 0, transform: [{ translateX: g.x * l.width }, { translateY: g.y * l.height }, { scale: g.s }] };
  });
  return (
    <Animated.View style={[styles.abs, { left: l.width / 2 - ghostW / 2, top: l.height * 0.05 - ghostH / 2, width: ghostW, height: ghostH }, ghost]}>
      {/* A violet rim so the white ghost reads against the white belly too. */}
      <Image source={GLOW} style={{ position: 'absolute', left: -ghostW * 0.25, top: -ghostH * 0.25, width: ghostW * 1.5, height: ghostH * 1.5,
        tintColor: '#9b5cff', opacity: 0.8 }} contentFit="fill" cachePolicy="memory" />
      <Image source={GHOST} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
    </Animated.View>
  );
}

/** Behind the shark: the ghost on the far half of its loop. */
export function GhostLanternBack(props: RigProps) {
  const { l, sway } = useLanternFrame(props);
  // Full stages only: a tile keeps the whole loop in front (4 views at lite, perf round 3).
  if (props.lod !== 'full') return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: l.left, top: l.top, width: l.width, height: l.height, transformOrigin: l.origin }, sway]}>
      <Ghost {...props} front={false} l={l} />
    </Animated.View>
  );
}

/** In front of the shark: the swaying lantern with its flickering light, and the ghost's peek. */
export function GhostLanternFront(props: RigProps) {
  const { t, kick, cue } = props;
  const { l, sway, still } = useLanternFrame(props);
  useMomentCue(t, kick, () => { 'worklet'; if (still) return -1; const m = momentAt(t.value, kick.value, PEEK_PERIOD, PEEK_LENGTH, 350); return m.cycle < 0 ? -1 : m.p; }, cue ? () => cue('peek') : undefined);
  const glowSize = l.width * 1.9;
  const glow = useAnimatedStyle(() => {
    const f = still ? 1 : flickerAt(t.value);
    return { opacity: 0.75 * f, transform: [{ scale: 0.9 + 0.12 * f }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: l.left, top: l.top, width: l.width,
      height: l.height, transformOrigin: l.origin }, sway]}>
      {/* Violet light from the flame: a soft glow sprite (no shadow, no blur). */}
      <Animated.Image source={GLOW} style={[styles.abs, { left: FLAME_AT.x * l.width - glowSize / 2, top: FLAME_AT.y * l.height - glowSize / 2,
        width: glowSize, height: glowSize, tintColor: '#b26cff' }, glow]} />
      <Image source={LANTERN} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
      <Ghost {...props} front={props.lod === 'full' ? true : 'both'} l={l} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
