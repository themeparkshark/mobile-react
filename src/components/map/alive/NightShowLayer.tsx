/**
 * The night show on the map, layered over the real launch area while the real
 * show runs: fireworks bursting over the castle, fountain jets on the lagoon,
 * or washes of light on a castle, following the show's intensity arc so the
 * finale lands on the real end. One Skia canvas pinned to the anchor (a map
 * marker, so it stays over the castle as the map moves); a fixed pool of burst
 * slots reads the precomputed schedule on the UI thread. Our own visuals only.
 * Reduce Motion and a calm phone skip it (the pill still says it is on).
 */
import { BlurMask, Canvas, Circle, Group, Points, vec, type SkPoint } from '@shopify/react-native-skia';
import { memo, useContext, useEffect, useMemo, useRef } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { SoundEffectContext } from '../../../context/SoundEffectProvider';
import { Marker } from '../Marker';
import { useMapAlive } from './MapAliveContext';
import { burstSchedule, showSecond, showTimes, type Burst, type NightShow } from './nightShow';

const W = 360;
const H = 430;
const GX = W / 2; // launch point inside the canvas
const GY = H - 20;
const LIFE = [2.0, 3.0, 1.9, 2.6]; // seconds a burst lives, by type
const RISE = 0.6; // a shell climbs this long before it bursts
const COLORS = ['#ffd84a', '#ff5fa2', '#5fd4ff', '#9dff7a', '#ffffff', '#c39bff'];
const WATER = ['#7fe9ff', '#5fb8ff', '#b59bff', '#ff8fd0', '#8fffd9', '#ffffff'];
const POP_SOUND = require('../../../../assets/sounds/firework_pop.mp3');

/** Index of the last burst at or before time t (binary search, UI thread). */
function lastAtOrBefore(times: readonly number[], t: number): number {
  'worklet';
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

interface SlotState { readonly visible: number; readonly age: number; readonly i: number }

function Slot({ k, clock, sync, times, bursts, water, sparks }: {
  k: number; clock: SharedValue<number>; sync: { showT: number; clock: number }; times: readonly number[]; bursts: readonly Burst[];
  water: boolean; sparks: number;
}) {
  // Which burst this slot shows now: the k-th most recent one still alive.
  const state = useDerivedValue<SlotState>(() => {
    // Show time runs on the map's ambient clock, synced to the real show clock when the layer mounts.
    const t = sync.showT + (clock.value - sync.clock);
    const i = lastAtOrBefore(times, t + RISE) - k;
    if (i < 0) return { visible: 0, age: 0, i: 0 };
    const b = bursts[i];
    const age = t - b.t;
    return age > LIFE[b.type] ? { visible: 0, age: 0, i } : { visible: 1, age, i };
  });
  // Spark heads (points) and their streaks (line pairs), rebuilt each frame on the UI thread.
  const geometry = useDerivedValue(() => {
    const st = state.value;
    const b = bursts[st.i];
    const heads: SkPoint[] = [];
    const streaks: SkPoint[] = [];
    if (!st.visible || !b) return { heads, streaks };
    const cx = GX + b.x;
    const cy = GY + b.y;
    if (b.type === 2) {
      // A fountain jet: droplets strung along a parabola from the water line, joined into a stream.
      const v = 230 * b.size;
      const lean = (b.x > 0 ? -1 : 1) * 22;
      let prev: SkPoint | null = null;
      for (let j = 0; j < sparks; j++) {
        const p = st.age * 1.1 - j * 0.05;
        if (p < 0 || p > 1.7) { prev = null; continue; }
        const point = vec(cx + lean * p, cy - v * p + 135 * p * p);
        heads.push(point);
        if (prev) { streaks.push(prev); streaks.push(point); }
        prev = point;
      }
      return { heads, streaks };
    }
    if (b.type === 3) {
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2 + st.age * 0.9 + b.color;
        heads.push(vec(cx + Math.cos(a) * (36 + st.age * 14) * b.size, cy + Math.sin(a) * 22 * b.size));
      }
      return { heads, streaks };
    }
    if (st.age < 0) {
      // The shell climbing to its burst point, with a short tail.
      const p = 1 + st.age / RISE;
      const q = Math.max(0, p - 0.05);
      const head = vec(GX + b.x * p * 0.9, GY + b.y * (1 - (1 - p) * (1 - p)));
      heads.push(head);
      streaks.push(vec(GX + b.x * q * 0.9, GY + b.y * (1 - (1 - q) * (1 - q))));
      streaks.push(head);
      return { heads, streaks };
    }
    const willow = b.type === 1;
    const a = Math.min(1, st.age / (willow ? 1.3 : 0.85));
    const out = 1 - (1 - a) * (1 - a) * (1 - a);
    const reach = (willow ? 92 : 104) * b.size * out;
    const tail = reach * (willow ? 0.45 : 0.62) * (0.4 + 0.6 * (1 - a));
    const droop = (willow ? 34 : 16) * st.age * st.age;
    for (let j = 0; j < sparks; j++) {
      const ang = (j / sparks) * Math.PI * 2 + b.color * 0.4;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang) * 0.92;
      const head = vec(cx + cos * reach, cy + sin * reach + droop);
      heads.push(head);
      streaks.push(vec(cx + cos * (reach - tail), cy + sin * (reach - tail) + droop * (willow ? 0.7 : 0.85)));
      streaks.push(head);
    }
    return { heads, streaks };
  });
  const heads = useDerivedValue(() => geometry.value.heads);
  const streaks = useDerivedValue(() => geometry.value.streaks);
  const opacity = useDerivedValue(() => {
    const s = state.value;
    const b = bursts[s.i];
    if (!s.visible || !b) return 0;
    if (s.age < 0) return 0.9;
    const life = LIFE[b.type];
    const k2 = s.age / life;
    return b.type === 3 ? Math.sin(Math.min(1, k2) * Math.PI) * 0.8 : Math.max(0, 1 - k2 * k2);
  });
  const color = useDerivedValue(() => {
    const b = bursts[state.value.i];
    if (!b) return COLORS[0];
    return b.type === 1 ? '#ffcf6b' : (water && b.type >= 2 ? WATER : COLORS)[b.color % 6];
  });
  const glowR = useDerivedValue(() => {
    const s = state.value;
    const b = bursts[s.i];
    if (!s.visible || !b || s.age < 0) return 0;
    // Castle light washes glow their whole life; a burst flashes the sky for half a second.
    if (b.type === 3) return 70 * b.size;
    return s.age < 0.5 ? 70 * b.size * (1 - s.age / 0.5) : 0;
  });
  const glowC = useDerivedValue(() => {
    const b = bursts[state.value.i];
    return b ? vec(GX + b.x, GY + b.y) : vec(0, 0);
  });
  return (
    <Group opacity={opacity}>
      {/* The flash of the burst lighting the sky around it. */}
      <Circle c={glowC} r={glowR} color={color} opacity={0.32}><BlurMask blur={22} style="normal" /></Circle>
      <Points points={streaks} mode="lines" color={color} style="stroke" strokeWidth={7} strokeCap="round" opacity={0.25} />
      <Points points={streaks} mode="lines" color={color} style="stroke" strokeWidth={2.4} strokeCap="round" />
      <Points points={heads} mode="points" color={water ? color : '#ffffff'} style="stroke" strokeWidth={water ? 5 : 3.6} strokeCap="round" opacity={0.9} />
    </Group>
  );
}

export const NightShowLayer = memo(function NightShowLayer({ show, live }: { readonly show: NightShow; readonly live: boolean }) {
  const { clock, caps, running } = useMapAlive();
  const { playSound } = useContext(SoundEffectContext);
  const bursts = useMemo(() => burstSchedule(show), [show]);
  const times = useMemo(() => bursts.map(b => b.t), [bursts]);
  const startMs = showTimes(show)?.start ?? 0;
  const slots = caps.skyShowBursts;
  const on = live && running && slots > 0 && bursts.length > 0;
  // Re-synced every time the layer (re)appears, so a paused map never drifts from the real show.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sync = useMemo(() => ({ showT: (Date.now() - startMs) / 1000, clock: clock.value }), [on, startMs]);

  // Our own soft pop for the bigger bursts, at most one every 1.6 s.
  const lastPop = useRef(0);
  useEffect(() => {
    if (!on || show.kind === 'projection') return;
    const timer = setInterval(() => {
      const t = showSecond(show, Date.now());
      const now = Date.now();
      if (now - lastPop.current < 1600) return;
      const i = lastAtOrBefore(times, t);
      const b = bursts[i];
      if (b && t - b.t < 0.5 && b.size >= 0.95 && b.type <= 1) {
        lastPop.current = now;
        void playSound(POP_SOUND, { volume: 0.28 + Math.min(0.2, (b.size - 0.95) * 0.4), rate: 0.85 + (b.color % 3) * 0.12 });
      }
    }, 400);
    return () => clearInterval(timer);
  }, [on, show, bursts, times, playSound]);

  if (!on) return null;
  return (
    <Marker coordinate={show.anchor} anchor={{ x: GX / W, y: GY / H }}>
      <Canvas style={{ width: W, height: H }} pointerEvents="none">
        {Array.from({ length: slots }, (_, k) => (
          <Slot key={k} k={k} clock={clock} sync={sync} times={times} bursts={bursts} water={show.kind === 'water'} sparks={caps.sparksPerBurst} />
        ))}
      </Canvas>
    </Marker>
  );
});
