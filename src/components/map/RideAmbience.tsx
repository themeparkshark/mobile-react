/**
 * Little living scenes around themed rides on the map: snow drifting around
 * the snowy mountain, ghosts and bats over the haunted house, stars and a UFO
 * over the space rides, owls circling the wizard towers, a race car lapping
 * the speedway, fireworks over the castle after dark. Pure decoration: every
 * view ignores touches and all motion runs on the UI thread (Reanimated).
 *
 * Coordinates are relative to the ride's ground point (0,0); negative y is up
 * the screen, so effects cluster around the landmark standing on that point.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { AmbienceId } from '../../services/rideLandmark';

export const AMBIENCE_BOX = 240;
const C = AMBIENCE_BOX / 2;

const FX = {
  ship: require('../../../assets/images/map/fx/ship.png'),
  ghost: require('../../../assets/images/map/fx/ghost.png'),
  bat: require('../../../assets/images/map/fx/bat.png'),
  ufo: require('../../../assets/images/map/fx/ufo.png'),
  hippo: require('../../../assets/images/map/fx/hippo.png'),
  owl: require('../../../assets/images/map/fx/owl.png'),
  snowflake: require('../../../assets/images/map/fx/snowflake.png'),
  racecar: require('../../../assets/images/map/fx/racecar.png'),
  footprint: require('../../../assets/images/map/fx/footprint.png'),
  fin: require('../../../assets/images/map/fx/fin.png'),
  parrot: require('../../../assets/images/map/fx/parrot.png'),
  dragon: require('../../../assets/images/map/fx/dragon.png'),
  steam: require('../../../assets/images/map/fx/steam.png'),
  splash: require('../../../assets/images/map/fx/splash.png'),
  sparkle: require('../../../assets/images/map/fx/sparkle.png'),
  bubble: require('../../../assets/images/map/fx/bubble.png'),
};

/** Size a sprite centered on its position instead of hanging from its corner. */
const box = (w: number, h = w) => ({ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2 });

/** Deterministic per-ride randomness so a ride's scene doesn't reshuffle on re-render. */
function rng(seed: number) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function useLoop(duration: number, delay = 0): SharedValue<number> {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return p;
}

type P = { readonly seed: number; readonly i: number };

/* ── Particles ─────────────────────────────────────────────────────────── */

function Snowflake({ seed, i }: P) {
  const r = useMemo(() => rng(seed + i * 17), [seed, i]);
  const cfg = useMemo(() => ({ x: (r() - 0.5) * 190, size: 10 + r() * 9, dur: 4200 + r() * 2600, delay: r() * 4000, drift: 8 + r() * 14 }), [r]);
  const p = useLoop(cfg.dur, cfg.delay);
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.12 ? p.value / 0.12 : p.value > 0.8 ? (1 - p.value) / 0.2 : 1,
    transform: [
      { translateX: cfg.x + Math.sin(p.value * Math.PI * 3) * cfg.drift },
      { translateY: -120 + p.value * 150 },
      { rotate: `${p.value * 300}deg` },
    ],
  }));
  return <Animated.Image resizeMode="contain" source={FX.snowflake} style={[styles.abs, box(cfg.size), style]} />;
}

function Riser({ seed, i, source, size, from, spread, height, grow, sway, dur }: P & {
  source: number; size: number; from: [number, number]; spread: number; height: number; grow: number; sway: number; dur: number;
}) {
  const r = useMemo(() => rng(seed + i * 31), [seed, i]);
  const cfg = useMemo(() => ({ x: from[0] + (r() - 0.5) * spread, d: dur * (0.8 + r() * 0.4), delay: r() * dur // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [r]);
  const p = useLoop(cfg.d, cfg.delay);
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value / 0.15 : Math.max(0, (1 - p.value) / 0.85) * 0.95,
    transform: [
      { translateX: cfg.x + Math.sin(p.value * Math.PI * 2) * sway },
      { translateY: from[1] - p.value * height },
      { scale: 1 + p.value * grow },
    ],
  }));
  return <Animated.Image resizeMode="contain" source={source} style={[styles.abs, box(size), style]} />;
}

function Twinkle({ seed, i, source, size, area, tint }: P & { source: number; size: number; area: [number, number, number, number]; tint?: string }) {
  const r = useMemo(() => rng(seed + i * 13), [seed, i]);
  const cfg = useMemo(() => ({ x: area[0] + r() * (area[2] - area[0]), y: area[1] + r() * (area[3] - area[1]), d: 1600 + r() * 1800, delay: r() * 2400, s: 0.6 + r() * 0.6 // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [r]);
  const p = useLoop(cfg.d, cfg.delay);
  const style = useAnimatedStyle(() => {
    const k = Math.sin(p.value * Math.PI);
    return { opacity: k, transform: [{ translateX: cfg.x }, { translateY: cfg.y }, { scale: k * cfg.s }, { rotate: `${p.value * 90}deg` }] };
  });
  return <Animated.Image resizeMode="contain" source={source} tintColor={tint} style={[styles.abs, box(size), style]} />;
}

/* ── Characters ────────────────────────────────────────────────────────── */

/** Circles the landmark on a flattened ellipse, flipping to face its direction. */
function Orbiter({ source, size, rx, ry, cy, dur, delay = 0, bob = 6, glow }: {
  source: number; size: number; rx: number; ry: number; cy: number; dur: number; delay?: number; bob?: number; glow?: boolean;
}) {
  const p = useLoop(dur, delay);
  const style = useAnimatedStyle(() => {
    const a = p.value * Math.PI * 2;
    return {
      transform: [
        { translateX: Math.cos(a) * rx },
        { translateY: cy + Math.sin(a) * ry + Math.sin(a * 3) * bob },
        { scaleX: -Math.sin(a) >= 0 ? 1 : -1 },
      ],
      // Behind the landmark on the far side of the loop.
      opacity: Math.sin(a) < -0.2 ? 0.75 : 1,
    };
  });
  return (
    <Animated.View style={[styles.abs, box(size), style]}>
      {glow && <View style={[styles.glow, { width: size * 0.9, height: size * 0.3, borderRadius: size, left: size * 0.05, top: size * 0.8 }]} />}
      <Image source={source} style={{ width: size, height: size }} contentFit="contain" />
    </Animated.View>
  );
}

/** Crosses the scene on an arc, then rests off-stage before the next pass. */
function Flyby({ seed, i, source, size, y, dur }: P & { source: number; size: number; y: number; dur: number }) {
  const r = useMemo(() => rng(seed + i * 7), [seed, i]);
  const cfg = useMemo(() => ({ dir: r() > 0.5 ? 1 : -1, y: y + (r() - 0.5) * 40, arc: 20 + r() * 25, delay: r() * dur // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [r]);
  const p = useLoop(dur, cfg.delay);
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, p.value / 0.55);
    return {
      opacity: p.value < 0.55 ? Math.min(1, Math.sin(t * Math.PI) * 3) : 0,
      transform: [
        { translateX: cfg.dir * (-C + t * AMBIENCE_BOX) },
        { translateY: cfg.y - Math.sin(t * Math.PI) * cfg.arc },
        { scaleX: cfg.dir },
        { scaleY: 1 + Math.sin(p.value * Math.PI * 40) * 0.12 },
      ],
    };
  });
  return <Animated.Image resizeMode="contain" source={source} style={[styles.abs, box(size), style]} />;
}

/** A car lapping the base of the landmark, nose along the track. */
function RaceCar({ delay = 0 }: { delay?: number }) {
  const p = useLoop(3200, delay);
  const style = useAnimatedStyle(() => {
    const a = p.value * Math.PI * 2;
    const dx = -Math.sin(a) * 52;
    const dy = Math.cos(a) * 18;
    return {
      transform: [
        { translateX: Math.cos(a) * 52 },
        { translateY: -6 + Math.sin(a) * 18 },
        { rotate: `${(Math.atan2(dy, dx) * 180) / Math.PI + 90}deg` },
      ],
      opacity: Math.sin(a) < -0.3 ? 0.55 : 1,
    };
  });
  return <Animated.Image resizeMode="contain" source={FX.racecar} style={[styles.abs, box(18), style]} />;
}

/** Big footprints stomping past, one after another, then fading together. */
function Footprint({ i }: { i: number }) {
  const p = useLoop(5200);
  const at = 0.08 + i * 0.1;
  const style = useAnimatedStyle(() => {
    const on = p.value >= at;
    const pop = on ? Math.min(1, (p.value - at) / 0.04) : 0;
    const fade = p.value > 0.8 ? (1 - p.value) / 0.2 : 1;
    return {
      opacity: pop * fade * 0.85,
      transform: [
        { translateX: -62 + i * 24 },
        { translateY: 22 + (i % 2 ? -7 : 7) },
        { rotate: '90deg' },
        { scale: 1.35 - pop * 0.35 },
      ],
    };
  });
  return <Animated.Image resizeMode="contain" source={FX.footprint} style={[styles.abs, box(16), style]} />;
}

/** The dragon perched on the landmark, breathing fire every few seconds. */
function Dragon() {
  const p = useLoop(6000);
  const head = useAnimatedStyle(() => {
    const roar = p.value > 0.7 && p.value < 0.9 ? Math.sin(((p.value - 0.7) / 0.2) * Math.PI) : 0;
    return { transform: [{ translateX: -8 }, { translateY: -84 - roar * 3 }, { rotate: `${-roar * 8}deg` }, { scale: 1 + roar * 0.08 }] };
  });
  return (
    <>
      {[0, 1, 2, 3, 4].map(k => <Flame key={k} p={p} k={k} />)}
      <Animated.Image resizeMode="contain" source={FX.dragon} style={[styles.abs, box(34), head]} />
    </>
  );
}

function Flame({ p, k }: { p: SharedValue<number>; k: number }) {
  const style = useAnimatedStyle(() => {
    const t = (p.value - 0.72 - k * 0.025) / 0.14;
    const on = t > 0 && t < 1;
    return {
      opacity: on ? Math.sin(t * Math.PI) : 0,
      transform: [{ translateX: 10 + t * 30 }, { translateY: -82 + t * 7 + (k - 2) * 3 }, { scale: 0.5 + t * 0.8 }],
    };
  });
  return <Animated.Image resizeMode="contain" source={FX.steam} tintColor={k % 2 ? '#ffb020' : '#ff6a1a'} style={[styles.abs, box(18), style]} />;
}

/** Hollywood searchlights sweeping behind the landmark. */
function Searchlight({ phase }: { phase: number }) {
  const p = useLoop(5200, phase * 2600);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (phase ? 14 : -14) - 7 }, { translateY: -110 }, { rotate: `${Math.sin(p.value * Math.PI * 2) * 24}deg` }],
  }));
  return (
    <Animated.View style={[styles.abs, styles.beam, style]}>
      <LinearGradient colors={['rgba(255,247,205,0)', 'rgba(255,247,205,0.38)']} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const FIREWORK_COLORS = ['#ffcf3b', '#ff5fa2', '#5fd4ff', '#8dff6a', '#ffffff'];

function FireworkBurst({ seed, i }: P) {
  const r = useMemo(() => rng(seed + i * 41), [seed, i]);
  const cfg = useMemo(() => ({ x: (r() - 0.5) * 100, y: -90 - r() * 40, color: FIREWORK_COLORS[Math.floor(r() * FIREWORK_COLORS.length)], delay: i * 900 + r() * 500 }), [r, i]);
  const p = useLoop(2700, cfg.delay);
  return (
    <View style={[styles.abs, { transform: [{ translateX: cfg.x }, { translateY: cfg.y }] }]}>
      {Array.from({ length: 10 }, (_, k) => <Spark key={k} p={p} angle={(k / 10) * Math.PI * 2} color={cfg.color} />)}
    </View>
  );
}

function Spark({ p, angle, color }: { p: SharedValue<number>; angle: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, p.value / 0.5);
    return {
      opacity: p.value < 0.5 ? 1 - t * t : 0,
      transform: [{ translateX: Math.cos(angle) * t * 24 }, { translateY: Math.sin(angle) * t * 24 + t * t * 8 }, { scale: 1 - t * 0.5 }],
    };
  });
  return <Animated.View style={[styles.abs, styles.spark, { backgroundColor: color }, style]} />;
}

/** Droplets bursting at the foot of the waterfall. */
function Droplet({ seed, i, from = [18, -6], power = 1 }: P & { from?: [number, number]; power?: number }) {
  const r = useMemo(() => rng(seed + i * 23), [seed, i]);
  const cfg = useMemo(() => ({ vx: (r() - 0.5) * 70 * power, vy: (55 + r() * 40) * power, d: 1100 + r() * 500, delay: r() * 1200, size: (8 + r() * 6) * Math.max(0.7, power) // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [r]);
  const p = useLoop(cfg.d, cfg.delay);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ translateX: from[0] + cfg.vx * p.value }, { translateY: from[1] - cfg.vy * p.value + 120 * power * p.value * p.value }],
  }));
  return <Animated.Image resizeMode="contain" source={FX.bubble} tintColor="#bff3ff" style={[styles.abs, box(cfg.size), style]} />;
}

/* ── Scene per ambience ────────────────────────────────────────────────── */

const n = (count: number) => Array.from({ length: count }, (_, i) => i);

function Scene({ kind, seed }: { kind: AmbienceId; seed: number }) {
  switch (kind) {
    case 'snow':
      return <>{n(7).map(i => <Snowflake key={i} seed={seed} i={i} />)}</>;
    case 'stars':
      return <>{n(4).map(i => <Twinkle key={i} seed={seed} i={i} source={FX.sparkle} size={12} area={[-70, -110, 70, -20]} tint="#fff6c2" />)}</>;
    case 'sparkles':
      return <>{n(3).map(i => <Twinkle key={i} seed={seed} i={i} source={FX.sparkle} size={11} area={[-45, -90, 45, -10]} />)}</>;
    case 'ufo':
      return <Orbiter source={FX.ufo} size={24} rx={60} ry={14} cy={-90} dur={9000} bob={5} glow />;
    case 'owls':
      return <Orbiter source={FX.owl} size={20} rx={66} ry={18} cy={-84} dur={7600} bob={7} />;
    case 'ghosts':
      return <>{n(2).map(i => <Riser key={i} seed={seed} i={i} source={FX.ghost} size={18} from={[0, -30]} spread={90} height={70} grow={0.1} sway={10} dur={5200} />)}</>;
    case 'bats':
      return <>{n(2).map(i => <Flyby key={i} seed={seed} i={i} source={FX.bat} size={16} y={-95} dur={5200} />)}</>;
    case 'parrots':
      return <>{n(1).map(i => <Flyby key={i} seed={seed} i={i} source={FX.parrot} size={20} y={-90} dur={8000} />)}</>;
    case 'steam':
      return <>{n(3).map(i => <Riser key={i} seed={seed} i={i} source={FX.steam} size={16} from={[-14, -62]} spread={10} height={50} grow={1} sway={6} dur={3000} />)}</>;
    case 'bubbles':
      return <>{n(4).map(i => <Riser key={i} seed={seed} i={i} source={FX.bubble} size={9} from={[0, 6]} spread={80} height={110} grow={0.3} sway={8} dur={3600} />)}</>;
    case 'splash':
      return <>{n(4).map(i => <Droplet key={i} seed={seed} i={i} from={[12, -4]} power={0.7} />)}</>;
    case 'fountain':
      return <>{n(3).map(i => <Droplet key={i} seed={seed} i={i} from={[0, -28]} power={0.45} />)}</>;
    case 'rush':
      // Gold sparkles swirling up around a ride that's on Rush.
      return <>
        {n(4).map(i => <Twinkle key={`t${i}`} seed={seed + 77} i={i} source={FX.sparkle} size={14} area={[-45, -90, 45, -6]} tint="#ffd23a" />)}
        {n(3).map(i => <Riser key={`r${i}`} seed={seed + 91} i={i} source={FX.sparkle} size={9} from={[0, -10]} spread={60} height={80} grow={0.2} sway={10} dur={2600} />)}
      </>;
    case 'aroma':
      return <>{n(2).map(i => <Riser key={i} seed={seed} i={i} source={FX.steam} size={11} from={[4, -50]} spread={20} height={36} grow={0.7} sway={7} dur={3600} />)}</>;
    case 'racecar':
      return <RaceCar />;
    case 'dino':
      return <>{n(6).map(i => <Footprint key={i} i={i} />)}</>;
    case 'dragon':
      return <Dragon />;
    case 'spotlights':
      return <><Searchlight phase={0} /><Searchlight phase={1} /></>;
    case 'fireworks':
      return <>{n(2).map(i => <FireworkBurst key={i} seed={seed} i={i} />)}</>;
    default:
      return null;
  }
}

/** Effects that belong behind the landmark (drawn before it). */
export const BEHIND: readonly AmbienceId[] = ['spotlights', 'fireworks', 'stars'];

export const RideAmbience = memo(function RideAmbience({ kinds, seed, origin, zIndex }: {
  kinds: readonly AmbienceId[];
  seed: number;
  /** The ride's ground point inside the pin view. */
  origin: { x: number; y: number };
  zIndex?: number;
}) {
  if (!kinds.length) return null;
  return (
    <View pointerEvents="none" style={[styles.canvas, { left: origin.x - C, top: origin.y - C, zIndex }]}>
      <View style={styles.origin}>
        {kinds.map(kind => <Scene key={kind} kind={kind} seed={seed} />)}
      </View>
    </View>
  );
});

/* ── Water scenes (placed on the nearest water, not on the pin) ────────── */

function Ripple({ delay }: { delay: number }) {
  const p = useLoop(2400, delay);
  const style = useAnimatedStyle(() => ({ opacity: (1 - p.value) * 0.7, transform: [{ scaleX: 0.4 + p.value * 1.2 }, { scaleY: 0.4 + p.value * 1.2 }] }));
  return <Animated.View style={[styles.abs, styles.ripple, style]} />;
}

function Ship() {
  const p = useLoop(14000);
  const style = useAnimatedStyle(() => {
    const a = p.value * Math.PI * 2;
    return {
      transform: [
        { translateX: Math.sin(a) * 18 },
        { translateY: -14 + Math.sin(a * 6) * 2 },
        // The sprite's bow points left, so mirror it while sailing right.
        { scaleX: Math.cos(a) >= 0 ? -1 : 1 },
        { rotate: `${Math.sin(a * 5) * 4}deg` },
      ],
    };
  });
  return <Animated.Image resizeMode="contain" source={FX.ship} style={[styles.abs, box(30), style]} />;
}

function Hippo() {
  const p = useLoop(7000);
  const style = useAnimatedStyle(() => {
    // Surfaces, looks around, sinks, then waits under water.
    const v = p.value < 0.1 ? p.value / 0.1 : p.value < 0.55 ? 1 : p.value < 0.65 ? 1 - (p.value - 0.55) / 0.1 : 0;
    return { opacity: v, transform: [{ translateY: -10 + (1 - v) * 10 }, { rotate: `${Math.sin(p.value * Math.PI * 6) * 3 * v}deg` }] };
  });
  return <Animated.Image resizeMode="contain" source={FX.hippo} style={[styles.abs, box(24), style]} />;
}

function Fin() {
  const p = useLoop(9000);
  const style = useAnimatedStyle(() => {
    const a = p.value * Math.PI * 2;
    return { transform: [{ translateX: Math.cos(a) * 30 }, { translateY: -10 + Math.sin(a) * 10 }, { scaleX: Math.sin(a) >= 0 ? 1 : -1 }] };
  });
  return <Animated.Image resizeMode="contain" source={FX.fin} style={[styles.abs, box(22), style]} />;
}

export const WaterAmbience = memo(function WaterAmbience({ kind }: { kind: AmbienceId }) {
  return (
    <View pointerEvents="none" style={styles.waterCanvas}>
      <View style={styles.waterOrigin}>
        <Ripple delay={0} />
        <Ripple delay={1200} />
        {kind === 'ship' ? <Ship /> : kind === 'hippo' ? <Hippo /> : <Fin />}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  canvas: { position: 'absolute', width: AMBIENCE_BOX, height: AMBIENCE_BOX },
  // All children position from the ride's ground point at the canvas center.
  origin: { position: 'absolute', left: C, top: C, width: 0, height: 0 },
  abs: { position: 'absolute', left: 0, top: 0 },
  glow: { position: 'absolute', backgroundColor: 'rgba(140,255,200,0.45)' },
  beam: { width: 14, height: 110, borderTopLeftRadius: 7, borderTopRightRadius: 7, overflow: 'hidden', transformOrigin: 'bottom' },
  spark: { width: 5, height: 5, borderRadius: 3 },
  ripple: { left: -16, top: -6, width: 32, height: 12, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  waterCanvas: { width: 110, height: 70 },
  waterOrigin: { position: 'absolute', left: 55, top: 44, width: 0, height: 0 },
});
