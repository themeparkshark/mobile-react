/**
 * Development and measurement builds only (EXPO_PUBLIC_MOTION_PROBE=1): what
 * the map's motion costs and how it looks, read through the Hermes inspector
 * (`globalThis.__motion`, see dustin-feedback-oct8/motion/bin).
 *
 *  - counts: map renders, heading samples in and out, camera commands, fixes;
 *  - cam: every native camera frame the map reports while it moves
 *    [ms, bearing, lng, lat, zoom] (onRegionIsChanging), for jitter and lag;
 *  - ui / js: frame intervals on the UI thread (Reanimated frame callback)
 *    and the JS thread (requestAnimationFrame).
 * Nothing here is imported by a release bundle (every call site is behind a
 * literal `__DEV__ &&`, which Metro folds away).
 */
import { useEffect } from 'react';
import { runOnJS, useFrameCallback } from 'react-native-reanimated';

type FrameStats = { n: number; sum: number; over20: number; over34: number; max: number };
type Motion = {
  t0: number;
  counts: Record<string, number>;
  cam: number[][];
  heading: number[][];
  ui: FrameStats;
  js: FrameStats;
  reset: () => void;
};

const empty = (): FrameStats => ({ n: 0, sum: 0, over20: 0, over34: 0, max: 0 });
const g = globalThis as unknown as { __motion?: Motion };

export const MOTION_PROBE = __DEV__ && process.env.EXPO_PUBLIC_MOTION_PROBE === '1';

function store(): Motion {
  if (!g.__motion) {
    const m: Motion = { t0: Date.now(), counts: {}, cam: [], heading: [], ui: empty(), js: empty(),
      reset: () => { m.t0 = Date.now(); m.counts = {}; m.cam = []; m.heading = []; m.ui = empty(); m.js = empty(); } };
    g.__motion = m;
  }
  return g.__motion;
}

export function probeCount(name: string): void {
  if (!MOTION_PROBE) return;
  const m = store();
  m.counts[name] = (m.counts[name] ?? 0) + 1;
}

export function probeCamera(bearing: number, lng: number, lat: number, zoom: number): void {
  if (!MOTION_PROBE) return;
  const m = store();
  if (m.cam.length < 20000) m.cam.push([Date.now(), bearing, lng, lat, zoom]);
}

export function probeHeading(value: number): void {
  if (!MOTION_PROBE) return;
  const m = store();
  if (m.heading.length < 20000) m.heading.push([Date.now(), value]);
}

function addFrames(target: 'ui' | 'js', s: FrameStats) {
  const m = store()[target];
  m.n += s.n; m.sum += s.sum; m.over20 += s.over20; m.over34 += s.over34; m.max = Math.max(m.max, s.max);
}

/** Mount once (the map): records UI- and JS-thread frame intervals. */
export function MotionProbeFrames() {
  useFrameCallback(frame => {
    'worklet';
    const w = globalThis as unknown as { __mpLast?: number; __mp?: FrameStats; __mpAt?: number };
    const dt = frame.timeSincePreviousFrame;
    if (!w.__mp) w.__mp = { n: 0, sum: 0, over20: 0, over34: 0, max: 0 };
    if (dt !== null && dt > 0 && dt < 1000) {
      const s = w.__mp;
      s.n += 1; s.sum += dt; if (dt > 20) s.over20 += 1; if (dt > 34) s.over34 += 1; if (dt > s.max) s.max = dt;
    }
    if (w.__mpAt === undefined) w.__mpAt = frame.timestamp;
    if (frame.timestamp - w.__mpAt >= 1000) {
      w.__mpAt = frame.timestamp;
      const out = w.__mp;
      w.__mp = { n: 0, sum: 0, over20: 0, over34: 0, max: 0 };
      runOnJS(addFrames)('ui', out);
    }
  });
  useEffect(() => {
    let raf = 0, last = 0;
    const tick = (t: number) => {
      if (last) {
        const dt = t - last;
        if (dt > 0 && dt < 1000) addFrames('js', { n: 1, sum: dt, over20: dt > 20 ? 1 : 0, over34: dt > 34 ? 1 : 0, max: dt });
      }
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}
