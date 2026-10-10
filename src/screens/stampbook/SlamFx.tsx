/**
 * Stamp slam effects: an irregular ink blot that stays as a faint "inked" mark,
 * asymmetric droplets thrown out with gravity, a rarity burst, the legendary
 * sunburst, gold dust, and reward particles that arc into the HUD.
 * All motion is Reanimated on the UI thread; nothing here re-renders per frame.
 */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import type { GameIconName } from '../../ui/iconNames';

/** Deterministic pseudo-random for a seed (stable shapes per stamp, varied across stamps). */
export function rng(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** A smooth irregular blob path around (c, c) with base radius r. */
export function blobPath(seed: number, c: number, r: number, points = 11): string {
  const rand = rng(seed);
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2 + rand() * 0.25;
    const rr = r * (0.78 + rand() * 0.38);
    return [c + Math.cos(a) * rr, c + Math.sin(a) * rr];
  });
  const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = `M ${mid(pts[points - 1], pts[0]).join(' ')}`;
  for (let i = 0; i < points; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % points]);
    d += ` Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

interface InkProps {
  readonly seed: number;
  readonly size: number;
  readonly color: string;
  /** 0 = nothing, rises to 1 at impact and stays (the blot holds as a faint mark). */
  readonly hit: SharedValue<number>;
}

/** The ink blot behind the sticker plus 6 to 10 droplets thrown out with gravity. */
export const InkBurst = memo(function InkBurst({ seed, size, color, hit }: InkProps) {
  const S = size * 1.5;
  const path = useMemo(() => blobPath(seed, S / 2, size * 0.5), [seed, S, size]);
  const drops = useMemo(() => {
    const rand = rng(seed + 7);
    const n = 6 + Math.floor(rand() * 5);
    return Array.from({ length: n }, () => {
      const a = rand() * Math.PI * 2;
      const dist = size * (0.45 + rand() * 0.25);
      return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, r: 5 + rand() * 6, fall: 10 + rand() * 26 };
    });
  }, [seed, size]);
  // Ink on paper: dark at the hit, then it holds as a faint 25% bleed under the sticker.
  const blot = useAnimatedStyle(() => ({
    // hit 0 -> 1 over 1.2 s: dark at impact, settles to 0.25, holds ~400 ms, then fades out (no smudge left behind).
    opacity: hit.value === 0 || hit.value >= 1 ? 0
      : hit.value < 0.35 ? 0.85 - (hit.value / 0.35) * 0.6
      : hit.value < 0.7 ? 0.25 : 0.25 * (1 - (hit.value - 0.7) / 0.3),
    transform: [{ scale: hit.value === 0 ? 0.6 : Math.min(1, 0.6 + hit.value * 4) }],
  }));
  return (
    <View pointerEvents="none" style={[styles.center, { width: S, height: S, marginLeft: -S / 2, marginTop: -S / 2 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, blot]}>
        <Svg width={S} height={S}><Path d={path} fill={color} fillOpacity={0.85} /></Svg>
      </Animated.View>
      {drops.map((d, i) => <Drop key={i} {...d} color={color} hit={hit} S={S} />)}
    </View>
  );
});

function Drop({ dx, dy, r, fall, color, hit, S }: { dx: number; dy: number; r: number; fall: number; color: string; hit: SharedValue<number>; S: number }) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, hit.value * 1.4);
    return {
      opacity: hit.value === 0 ? 0 : Math.max(0, 1 - t * 0.9),
      transform: [{ translateX: dx * (0.3 + 0.7 * t) }, { translateY: dy * (0.3 + 0.7 * t) + fall * t * t }, { scale: 1 - 0.4 * t }],
    };
  });
  return <Animated.View style={[styles.drop, { width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color, left: S / 2 - r, top: S / 2 - r }, style]} />;
}

/** Rotating god-ray sunburst for legendary stamps (20 s per turn while the card is open). */
export const Sunburst = memo(function Sunburst({ size, color, running }: { size: number; color: string; running: boolean }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!running) { cancelAnimation(spin); return; }
    // Three slow turns, then it rests (an open card left on screen goes idle).
    spin.value = withRepeat(withTiming(360, { duration: 20000, easing: Easing.linear }), 3, false);
    return () => cancelAnimation(spin);
  }, [running, spin]);
  const rays = useMemo(() => {
    const c = size / 2;
    return Array.from({ length: 12 }, (_, i) => {
      const a0 = (i / 12) * Math.PI * 2;
      const a1 = a0 + Math.PI / 24;
      return `${c},${c} ${c + Math.cos(a0) * c},${c + Math.sin(a0) * c} ${c + Math.cos(a1) * c},${c + Math.sin(a1) * c}`;
    });
  }, [size]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  // Saturated gold rays alternating with pale gold, around a white-hot core (never low-alpha gold over blue).
  return (
    <View pointerEvents="none" style={[styles.center, { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        {/* Soft tapered rays: each fades out toward its tip (radial gradient), so nothing reads as a hard bar behind the text. */}
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="rayA" cx="50%" cy="50%" r="50%">
              <Stop offset="0.15" stopColor={color} stopOpacity="0.95" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="rayB" cx="50%" cy="50%" r="50%">
              <Stop offset="0.15" stopColor="#FFF4C2" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#FFF4C2" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          {rays.map((p, i) => <Polygon key={p} points={p} fill={i % 2 ? 'url(#rayB)' : 'url(#rayA)'} />)}
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="core" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="0.35" stopColor="#FFF4C2" stopOpacity="0.7" />
            <Stop offset="1" stopColor="#FFF4C2" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size * 0.36} fill="url(#core)" />
      </Svg>
    </View>
  );
});

/** A burst ring of the rarity colour at impact (rare and up). */
export function RarityBurst({ size, color, hit }: { size: number; color: string; hit: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: hit.value === 0 ? 0 : Math.max(0, 0.7 - hit.value),
    transform: [{ scale: 0.5 + hit.value * 0.9 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.center, styles.burst, { width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2, backgroundColor: color }, style]} />;
}

/** One reward particle: arcs from (sx, sy) to (ex, ey) on a bezier, ease-in, then lands. */
export const Particle = memo(function Particle({ icon, sx, sy, ex, ey, delay, lift }: {
  icon: GameIconName; sx: number; sy: number; ex: number; ey: number; delay: number; lift: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 450, easing: Easing.in(Easing.quad) }));
    return () => cancelAnimation(t);
  }, [t, delay]);
  const style = useAnimatedStyle(() => {
    const u = t.value;
    const cx = (sx + ex) / 2 + lift * 0.3;
    const cy = Math.min(sy, ey) - lift;
    const x = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * ex;
    const y = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cy + u * u * ey;
    return {
      opacity: u === 0 ? 0 : u >= 1 ? 0 : 1,
      transform: [{ translateX: x - 11 }, { translateY: y - 11 }, { scale: 1.1 - 0.4 * u }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.particle, style]}><GameIcon name={icon} size={22} /></Animated.View>;
});

const styles = StyleSheet.create({
  center: { position: 'absolute', left: '50%', top: '50%' },
  drop: { position: 'absolute' },
  burst: { opacity: 0 },
  particle: { position: 'absolute', left: 0, top: 0 },
});

const CONFETTI = ['#FFCF3B', '#FF6B4A', '#2F6BFF', '#16B39A', '#FFFFFF', '#29B6F6'];

/** 1.2 s confetti shower for a completed section or a legendary slam. */
export const Confetti = memo(function Confetti({ width, height, seed, count = 26 }: { width: number; height: number; seed: number; count?: number }) {
  const bits = useMemo(() => {
    const rand = rng(seed + 31);
    return Array.from({ length: count }, (_, i) => ({
      x: rand() * width, drift: (rand() - 0.5) * 80, delay: rand() * 250, spin: 180 + rand() * 540,
      w: 6 + rand() * 6, h: 10 + rand() * 8, color: CONFETTI[i % CONFETTI.length],
    }));
  }, [width, seed, count]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bits.map((b, i) => <Bit key={i} {...b} height={height} />)}
    </View>
  );
});

function Bit({ x, drift, delay, spin, w, h, color, height }: { x: number; drift: number; delay: number; spin: number; w: number; h: number; color: string; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 1200, easing: Easing.in(Easing.quad) }));
    return () => cancelAnimation(t);
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 || t.value >= 1 ? 0 : 1,
    transform: [{ translateX: x + drift * t.value }, { translateY: -20 + t.value * (height + 40) }, { rotate: `${spin * t.value}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: 2, backgroundColor: color }, style]} />;
}

/** Soft elliptical ground shadow (radial falloff), not a hard pill. */
export const SoftShadow = memo(function SoftShadow({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id="gs" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#022a55" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#022a55" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill="url(#gs)" />
    </Svg>
  );
});

/** A wavy ink line for the colour-bleed edge on a locked card. */
export const InkEdge = memo(function InkEdge({ width, color }: { width: number; color: string }) {
  const n = 8; const h = 10;
  let d = `M 0 ${h / 2}`;
  for (let i = 0; i < n; i++) {
    const x0 = (i / n) * width; const x1 = ((i + 0.5) / n) * width; const x2 = ((i + 1) / n) * width;
    d += ` Q ${x1.toFixed(1)} ${i % 2 ? h : 0} ${x2.toFixed(1)} ${h / 2}`;
    void x0;
  }
  return <Svg width={width} height={h}><Path d={d} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" /></Svg>;
});
