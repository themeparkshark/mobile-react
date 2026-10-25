/**
 * Dev-only frame proof for the park day moments: marks the start and end of a
 * moment and, when the dev frame HUD is on (EXPO_PUBLIC_PERF_HUD=1), logs the
 * UI-thread frame summary for that window (fps p5, worst frame) to Metro so a
 * clip can be paired with its numbers. Release builds: nothing runs.
 */
type Sampler = () => { fps: number; fpsP5: number; worstMs: number } | null;

let sampler: Sampler | null = null;
let reset: (() => void) | null = null;

export const PERF_HUD = __DEV__ && process.env.EXPO_PUBLIC_PERF_HUD === '1';

/**
 * Lane capture stage only (EXPO_PUBLIC_MOTION_CAPTURE=ParkMomentsCapture, never set in a store or OTA bundle):
 * every mark is kept with its time, so the stage can say where in a moment a long frame fell.
 */
const CAPTURE_MARKS = process.env.EXPO_PUBLIC_MOTION_CAPTURE === 'ParkMomentsCapture';
let marks: { name: string; at: number }[] = [];
export function takeCaptureMarks(): { name: string; at: number }[] {
  const out = marks; marks = []; return out;
}

/** The dev frame HUD registers how to read and reset its stats. */
export function registerPerfSampler(read: Sampler | null, clear: (() => void) | null): void {
  sampler = read;
  reset = clear;
}

/** `name.start` resets the window; anything else logs the window so far. */
export function perfMark(name: string): void {
  if (CAPTURE_MARKS) marks.push({ name, at: Date.now() });
  if (!PERF_HUD) return;
  if (name.endsWith('.start')) { reset?.(); console.log(`[perf] ${name}`); return; }
  const s = sampler?.();
  if (s) console.log(`[perf] ${name} fps=${s.fps.toFixed(1)} p5=${s.fpsP5.toFixed(1)} worst=${s.worstMs.toFixed(1)}ms`);
}
