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
 * The ghost's path, in lantern sizes from the lantern's top: rise out of the
 * top, loop once around the outside (away from the shark's body, on the left),
 * then tuck back in. Varies its side every other peek.
 */
export function ghostPose(p: number, cycle: number): { x: number; y: number; s: number; o: number } {
  'worklet';
  if (p < 0) return { x: 0, y: 0, s: 0.2, o: 0 };
  const side = cycle > 0 && cycle % 2 === 1 ? 0.6 : -1;
  if (p < 0.22) { const k = p / 0.22; return { x: 0, y: -0.38 * k, s: 0.3 + 0.7 * k, o: Math.min(1, k * 2.5) }; }
  if (p < 0.8) {
    const k = (p - 0.22) / 0.58;
    const a = k * Math.PI * 2;
    // One loop centred off to the side, starting and ending above the lantern, so the
    // ghost never crosses the white belly.
    return { x: side * 0.65 * (1 - Math.cos(a)), y: -0.38 - 0.42 * Math.sin(a), s: 1 - 0.12 * Math.sin(k * Math.PI), o: 1 };
  }
  const k = (p - 0.8) / 0.2;
  return { x: 0, y: -0.38 * (1 - k), s: 1 - 0.7 * k, o: 1 - k };
}

/** In front of the shark: the swaying lantern with its flickering light, and the ghost's peek. */
export function GhostLanternFront({ t, kick, box, lod, cue }: RigProps) {
  const still = lod === 'still';
  useMomentCue(() => { 'worklet'; return still ? -1 : momentAt(t.value, kick.value, PEEK_PERIOD, PEEK_LENGTH, 350).p; }, cue ? () => cue('peek') : undefined);
  const l = partLayout(box, G.lantern, G.lantern.aspect);
  const sway = useAnimatedStyle(() => ({ transform: [{ rotate: `${G.lantern.rot + (still ? 0 : swayAt(t.value))}deg` }] }));
  const glowSize = l.width * 1.9;
  const glow = useAnimatedStyle(() => {
    const f = still ? 1 : flickerAt(t.value);
    return { opacity: 0.75 * f, transform: [{ scale: 0.9 + 0.12 * f }] };
  });
  const ghostW = G.ghost.w * box.w;
  const ghostH = ghostW * G.ghost.aspect;
  const ghost = useAnimatedStyle(() => {
    const m = still ? { p: STILL_P, cycle: 0 } : momentAt(t.value, kick.value, PEEK_PERIOD, PEEK_LENGTH, 350);
    const g = ghostPose(m.p, m.cycle);
    return { opacity: g.o, transform: [{ translateX: g.x * l.width }, { translateY: g.y * l.height }, { scale: g.s }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: l.left, top: l.top, width: l.width,
      height: l.height, transformOrigin: l.origin }, sway]}>
      {/* Violet light from the flame: a soft glow sprite (no shadow, no blur). */}
      <Animated.Image source={GLOW} style={[styles.abs, { left: FLAME_AT.x * l.width - glowSize / 2, top: FLAME_AT.y * l.height - glowSize / 2,
        width: glowSize, height: glowSize, tintColor: '#b26cff' }, glow]} />
      <Image source={LANTERN} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
      <Animated.View style={[styles.abs, { left: l.width / 2 - ghostW / 2, top: l.height * 0.1 - ghostH / 2, width: ghostW, height: ghostH }, ghost]}>
        {/* A violet rim so the white ghost reads against the white belly too. */}
        <Image source={GLOW} style={{ position: 'absolute', left: -ghostW * 0.25, top: -ghostH * 0.25, width: ghostW * 1.5, height: ghostH * 1.5,
          tintColor: '#9b5cff', opacity: 0.8 }} contentFit="fill" cachePolicy="memory" />
        <Image source={GHOST} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
