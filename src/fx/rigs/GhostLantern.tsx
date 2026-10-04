import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { RigProps } from '../FxStage';
import { FX_GEOMETRY, partLayout, phaseOf, windowOf } from '../registry';

const G = FX_GEOMETRY.rigs.ghost_lantern;
const LANTERN = require('../../../assets/fx/lantern.png');
const GHOST = require('../../../assets/fx/ghost.png');
/** The purple flame inside lantern.png (part fractions). */
export const FLAME_AT = { x: 0.54, y: 0.624 };
export const PEEK_PERIOD = 6000;
const PEEK_LENGTH = 0.38;

/** The sway about the carrying ring, in degrees. */
export function swayAt(t: number): number {
  'worklet';
  return 6 * Math.sin((t / 2200) * Math.PI * 2);
}

/** The ghost's peek: -1 hidden, else 0..1 through rise, loop and tuck. */
export function peekAt(t: number): number {
  'worklet';
  return windowOf(phaseOf(t, PEEK_PERIOD, 0.45), 0, PEEK_LENGTH);
}

/** In front of the shark: the swaying lantern with its flickering glow, and the ghost's peek. */
export function GhostLanternFront({ t, box, lod }: RigProps) {
  const l = partLayout(box, G.lantern, G.lantern.aspect);
  const sway = useAnimatedStyle(() => ({ transform: [{ rotate: `${G.lantern.rot + swayAt(t.value)}deg` }] }));
  const glowSize = l.width * 1.3;
  const glow = useAnimatedStyle(() => {
    const v = t.value;
    const flicker = 0.55 + 0.18 * Math.sin(v / 63) + 0.12 * Math.sin(v / 29 + 2);
    return { opacity: flicker, transform: [{ scale: 0.92 + 0.12 * flicker }] };
  });
  const flameSize = l.width * 0.22;
  const flame = useAnimatedStyle(() => {
    const v = t.value;
    return { opacity: 0.55 + 0.35 * Math.sin(v / 47), transform: [{ scaleY: 1 + 0.25 * Math.sin(v / 37) }] };
  });
  const ghostW = G.ghost.w * box.w;
  const ghostH = ghostW * G.ghost.aspect;
  const ghost = useAnimatedStyle(() => {
    const p = peekAt(t.value);
    if (p < 0) return { opacity: 0, transform: [{ scale: 0.2 }] };
    // Rise out of the top (0-0.25), loop once around the lantern (0.25-0.8), tuck back in.
    let x = 0; let y = 0; let s = 1; let o = 1;
    if (p < 0.25) {
      const k = p / 0.25;
      y = -l.height * 0.35 * k; s = 0.3 + 0.7 * k; o = Math.min(1, k * 2.5);
    } else if (p < 0.8) {
      const k = (p - 0.25) / 0.55;
      const a = -Math.PI / 2 + k * Math.PI * 2;
      x = Math.cos(a) * l.width * 0.95; y = Math.sin(a) * l.height * 0.38;
      s = 1 - 0.15 * Math.sin(k * Math.PI);
    } else {
      const k = (p - 0.8) / 0.2;
      y = -l.height * 0.35 * (1 - k); s = 1 - 0.7 * k; o = 1 - k;
    }
    return { opacity: o, transform: [{ translateX: x }, { translateY: y }, { scale: s }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: l.left, top: l.top, width: l.width,
      height: l.height, transformOrigin: l.origin }, sway]}>
      {lod !== 'still' && (
        <Animated.View style={[styles.glow, { left: FLAME_AT.x * l.width - glowSize / 2, top: FLAME_AT.y * l.height - glowSize / 2,
          width: glowSize, height: glowSize, borderRadius: glowSize }, glow]} />
      )}
      <Image source={LANTERN} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
      {lod !== 'still' && (
        <Animated.View style={[styles.flame, { left: FLAME_AT.x * l.width - flameSize / 2, top: FLAME_AT.y * l.height - flameSize * 0.7,
          width: flameSize, height: flameSize * 1.3, borderRadius: flameSize }, flame]} />
      )}
      {lod !== 'still' && (
        <Animated.View style={[{ position: 'absolute', left: l.width / 2 - ghostW / 2, top: l.height * 0.08 - ghostH / 2,
          width: ghostW, height: ghostH }, ghost]}>
          <Image source={GHOST} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', backgroundColor: 'rgba(176,110,255,0.32)', shadowColor: '#b26cff', shadowOpacity: 0.9,
    shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  flame: { position: 'absolute', backgroundColor: 'rgba(235,205,255,0.85)' },
});
