import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FxPart, RigProps, useMomentCue } from '../FxStage';
import { FX_GEOMETRY, momentAt, phaseOf, windowOf } from '../registry';

const G = FX_GEOMETRY.rigs.midway_fireworks;
export const BACKDROP = require('../../../assets/fx/backdrop.webp');
const GLOW = require('../../../assets/fx/glow.webp');
const SPARK = require('../../../assets/fx/spark.webp');
const ART: Record<string, number> = {
  'burst-gold.webp': require('../../../assets/fx/burst-gold.webp'),
  'burst-pink.webp': require('../../../assets/fx/burst-pink.webp'),
};

/** Shell timing: launch, then the burst (bloom, droop, fade). Windows of each shell's own period. */
const LAUNCH = 0.18;
const BURST = 0.42;
export const FINALE_PERIOD = 9000;
export const FINALE_LENGTH = 0.32;
/** Reduce Motion: two bursts frozen in full bloom. */
export const STILL_BURSTS = 2;

type Shell = { file: string; cx: number; cy: number; w: number; period: number; offset: number; finale?: number; flash: string };

/**
 * The steady shells (geometry.json bursts) plus a 3-shell finale (about 9 s,
 * and on a tap). Every shell stays inside the visible safe area of a portrait
 * card (cover-fitted square: x 0.15 to 0.85, below y 0.08).
 */
export const SHELLS: Shell[] = [
  ...G.bursts.map((b, i) => ({ ...b, period: [3100, 3700, 4300, 5200][i] ?? 4000, offset: [0.82, 0.1, 0.55, 0.35][i] ?? 0,
    flash: b.file.includes('gold') ? '#fff2c0' : '#ffd6f3' })),
  { file: 'burst-pink.webp', cx: 0.36, cy: 0.12, w: 0.16, period: FINALE_PERIOD, offset: 0, finale: 0, flash: '#ffd6f3' },
  { file: 'burst-gold.webp', cx: 0.66, cy: 0.22, w: 0.15, period: FINALE_PERIOD, offset: 0, finale: 0.12, flash: '#fff2c0' },
  { file: 'burst-gold.webp', cx: 0.8, cy: 0.12, w: 0.13, period: FINALE_PERIOD, offset: 0, finale: 0.24, flash: '#fff2c0' },
];

/** Where a shell is in its life: launch progress, burst progress, or idle (-1, -1). */
export function shellAt(t: number, kick: number, s: Shell): { launch: number; burst: number } {
  'worklet';
  if (s.finale !== undefined) {
    // The finale: one moment, the three shells staggered inside it.
    const m = momentAt(t, kick, FINALE_PERIOD, FINALE_LENGTH, 350);
    if (m.p < 0) return { launch: -1, burst: -1 };
    const p = (m.p - s.finale) / (1 - 0.24);
    return { launch: windowOf(p, 0, 0.3), burst: windowOf(p, 0.3, 0.7) };
  }
  const p = phaseOf(t, s.period, s.offset);
  return { launch: windowOf(p, 0, LAUNCH), burst: windowOf(p, LAUNCH, BURST) };
}

const FADE_AT = 0.36;
const FADE_LEN = 0.12;

function burstShape(b: number, h: number) {
  'worklet';
  const grow = 1 - Math.pow(1 - Math.min(1, b / 0.3), 3);
  const fall = Math.max(0, b - 0.3);
  return [{ translateY: fall * fall * h * 0.09 }, { scale: 0.15 + 0.85 * grow }, { scaleY: 1 + 0.18 * fall }, { rotate: `${b * 10}deg` }];
}

/**
 * The burst: a quick bloom, then it droops with gravity and fades into embers. While it fades,
 * the colour copy drops fast and a white-hot copy carries it out, so a fading burst reads lighter
 * and softer, never a murky olive or grey-blue half-alpha on navy (art panel round 5).
 */
function Burst({ t, kick, box, i, lod }: RigProps & { i: number }) {
  const s = SHELLS[i];
  const still = lod === 'still';
  const style = useAnimatedStyle(() => {
    if (still) return i < STILL_BURSTS ? { opacity: 1, transform: [{ scale: 1 }] } : { opacity: 0 };
    const { burst: b } = shellAt(t.value, kick.value, s);
    if (b < 0) return { opacity: 0, transform: [{ scale: 0.1 }] };
    const u = (b - FADE_AT) / FADE_LEN;
    // Lite has no white copy, so its colour fade is quicker still.
    const k = lod === 'full' ? 1.8 : 2.6;
    return { opacity: u < 0 ? 1 : Math.max(0, 1 - u * k), transform: burstShape(b, box.h) };
  });
  return (
    <>
      <FxPart source={ART[s.file]} box={box} spec={{ cx: s.cx, cy: s.cy, w: s.w }} style={style} />
      {lod === 'full' && <BurstWhite t={t} kick={kick} box={box} s={s} />}
    </>
  );
}

function BurstWhite({ t, kick, box, s }: Pick<RigProps, 't' | 'kick' | 'box'> & { s: Shell }) {
  const style = useAnimatedStyle(() => {
    const { burst: b } = shellAt(t.value, kick.value, s);
    const u = b < 0 ? -1 : (b - FADE_AT) / FADE_LEN;
    if (u < 0 || u >= 1) return { opacity: 0 };
    return { opacity: 0.8 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u * 0.5), transform: burstShape(b, box.h) };
  });
  return <FxPart source={ART[s.file]} box={box} spec={{ cx: s.cx, cy: s.cy, w: s.w }} tint="#fff8ea" style={style} />;
}

/** Full LOD only: the rocket trail up and a bright flash of light at the bloom. */
function ShellExtras({ t, kick, box, i }: RigProps & { i: number }) {
  const s = SHELLS[i];
  const size = Math.max(4, box.w * 0.012);
  const flashSize = s.w * box.w * 1.7;
  const rocket = useAnimatedStyle(() => {
    const { launch } = shellAt(t.value, kick.value, s);
    if (launch < 0) return { opacity: 0 };
    const y = 0.92 + (s.cy - 0.92) * (1 - Math.pow(1 - launch, 2));
    return { opacity: 1 - launch * 0.3, transform: [{ translateY: (y - s.cy) * box.h }, { rotate: `${launch * 360}deg` }] };
  });
  const flash = useAnimatedStyle(() => {
    const { burst: b } = shellAt(t.value, kick.value, s);
    return { opacity: b < 0 ? 0 : Math.max(0, 0.9 - b * 2.2), transform: [{ scale: 0.6 + b }] };
  });
  return (
    <>
      {/* The rocket: a drawn spark star rising, not a blurred streak (art panel round 3). */}
      <Animated.Image source={SPARK} style={[styles.abs, { left: box.x + s.cx * box.w - size * 1.5, top: box.y + s.cy * box.h - size * 1.5,
        width: size * 3, height: size * 3 }, rocket]} />
      <Animated.Image source={GLOW} style={[styles.abs, { left: box.x + s.cx * box.w - flashSize / 2, top: box.y + s.cy * box.h - flashSize / 2,
        width: flashSize, height: flashSize, tintColor: s.flash }, flash]} />
    </>
  );
}

/**
 * The fireworks light the shark: each bloom washes the near side in its colour
 * for a beat (light cast, game feel round 4). Drawn in front of the shark.
 */
export function SceneFlashOnShark(props: RigProps) {
  if (props.lod !== 'full') return null;
  return (
    <>
      <SharkFlash {...props} gold />
      <SharkFlash {...props} gold={false} />
    </>
  );
}

/** Each burst's own colour: a 0.45 peak held about 120 ms, then a 250 ms fade, shifted toward its side. */
const FLASH_HOLD = 0.07;
const FLASH_FADE = 0.16;

function SharkFlash({ t, kick, box, gold }: RigProps & { gold: boolean }) {
  const size = box.w * 0.8;
  const shells = SHELLS.filter(s => s.file.includes('gold') === gold);
  const style = useAnimatedStyle(() => {
    let f = 0;
    let cx = 0.5;
    let cy = 0.2;
    for (let i = 0; i < shells.length; i++) {
      const b = shellAt(t.value, kick.value, shells[i]).burst;
      if (b < 0) continue;
      const v = b < FLASH_HOLD ? 1 : Math.max(0, 1 - (b - FLASH_HOLD) / FLASH_FADE);
      if (v > f) { f = v; cx = shells[i].cx; cy = shells[i].cy; }
    }
    // The wash sits on the side and top facing the burst.
    return { opacity: 0.45 * f, transform: [{ translateX: (cx - 0.5) * box.w * 0.45 }, { translateY: (cy - 0.2) * box.h * 0.4 }] };
  });
  return <Animated.Image source={GLOW} style={[styles.abs, { left: box.x + box.w * 0.52 - size / 2, top: box.y + box.h * 0.1,
    width: size, height: size, tintColor: gold ? '#ffc94a' : '#ff6fd0' }, style]} />;
}

/**
 * The scene, drawn where the backdrop goes: the midway at night (cover-fitted,
 * like every backdrop) and fireworks over it. Lite plays the 4 steady shells
 * only; still holds two bursts in bloom.
 */
export function MidwayFireworksScene(props: RigProps) {
  const { t, kick, box, lod, cue } = props;
  useMomentCue(t, kick, () => { 'worklet'; if (lod === 'still') return -1; const m = momentAt(t.value, kick.value, FINALE_PERIOD, FINALE_LENGTH, 350); return m.cycle < 0 ? -1 : m.p; }, cue ? () => cue('finale') : undefined);
  const shells = lod === 'full' ? SHELLS.map((_, i) => i) : lod === 'lite' ? [0, 1, 2, 3] : [0, 1];
  return (
    <>
      <Image source={BACKDROP} style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h }}
        contentFit="cover" cachePolicy="memory" />
      {lod === 'full' && shells.map(i => <ShellExtras key={`x${i}`} {...props} i={i} />)}
      {shells.map(i => <Burst key={i} {...props} i={i} />)}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
