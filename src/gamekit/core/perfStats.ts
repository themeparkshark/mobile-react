/**
 * perfStats.ts: frame-time statistics for the 60fps perf harness.
 *
 * A fixed ring of UI-thread frame times (ms), worklet-safe, with the numbers
 * the studio's perf gates use: fps p5 (the 5th percentile of instantaneous
 * fps, i.e. the bad frames), frame-time p95/p99, and frames over budget.
 */

export interface FrameStats {
  cap: number;
  ms: number[];
  head: number;
  count: number;
  total: number;
  over16: number;
  over20: number;
  over33: number;
  worst: number;
}

export function createFrameStats(cap = 240): FrameStats {
  'worklet';
  const ms: number[] = [];
  for (let i = 0; i < cap; i++) ms.push(0);
  return { cap, ms, head: 0, count: 0, total: 0, over16: 0, over20: 0, over33: 0, worst: 0 };
}

export function recordFrame(s: FrameStats, frameMs: number): void {
  'worklet';
  if (!(frameMs > 0) || frameMs > 1000) return;
  s.ms[s.head] = frameMs;
  s.head = (s.head + 1) % s.cap;
  if (s.count < s.cap) s.count += 1;
  s.total += 1;
  // 16.7ms budget at 60Hz (with a little scheduler slack).
  if (frameMs > 17.5) s.over16 += 1;
  if (frameMs > 20) s.over20 += 1;
  if (frameMs > 33.4) s.over33 += 1;
  if (frameMs > s.worst) s.worst = frameMs;
}

/** Percentile (0..100) of the recent frame times (ms). */
export function frameTimePercentile(s: FrameStats, pct: number): number {
  'worklet';
  if (s.count === 0) return 0;
  const tmp: number[] = [];
  for (let i = 0; i < s.count; i++) tmp.push(s.ms[i]);
  tmp.sort((a, b) => a - b);
  const idx = Math.min(tmp.length - 1, Math.max(0, Math.ceil((pct / 100) * tmp.length) - 1));
  return tmp[idx];
}

export function averageFps(s: FrameStats): number {
  'worklet';
  if (s.count === 0) return 0;
  let sum = 0;
  for (let i = 0; i < s.count; i++) sum += s.ms[i];
  return (1000 * s.count) / sum;
}

/** fps at the 5th percentile: 1000 / (frame time p95). */
export function fpsP5(s: FrameStats): number {
  'worklet';
  const p95 = frameTimePercentile(s, 95);
  return p95 > 0 ? 1000 / p95 : 0;
}

/** Last n frame times, oldest first (for the overlay graph). */
export function recentFrames(s: FrameStats, n: number, out: number[]): number[] {
  'worklet';
  const k = n < s.count ? n : s.count;
  out.length = 0;
  for (let i = k; i > 0; i--) {
    const idx = (s.head - i + s.cap * 2) % s.cap;
    out.push(s.ms[idx]);
  }
  return out;
}

export interface PerfSummary {
  fpsAvg: number;
  fpsP5: number;
  frameP95: number;
  frameP99: number;
  over16Pct: number;
  worstMs: number;
  frames: number;
}

export function summarize(s: FrameStats): PerfSummary {
  'worklet';
  return {
    fpsAvg: Math.round(averageFps(s) * 10) / 10,
    fpsP5: Math.round(fpsP5(s) * 10) / 10,
    frameP95: Math.round(frameTimePercentile(s, 95) * 10) / 10,
    frameP99: Math.round(frameTimePercentile(s, 99) * 10) / 10,
    over16Pct: s.total ? Math.round((1000 * s.over16) / s.total) / 10 : 0,
    worstMs: Math.round(s.worst * 10) / 10,
    frames: s.total,
  };
}
