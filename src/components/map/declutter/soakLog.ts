/**
 * Map stability trace for the Release soak harness (EXPO_PUBLIC_DECLUTTER_SOAK=1) and
 * development. Release builds only forward console.error to the device log, so the
 * soak uses it; store builds never set the flag and log nothing.
 */
const SOAK = process.env.EXPO_PUBLIC_DECLUTTER_SOAK === '1';
export const SOAK_TRACE = SOAK || (typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_DECLUTTER_TRACE === '1');

export function soakLog(message: string): void {
  if (!SOAK_TRACE) return;
  const line = `[map-trace] ${Date.now()} ${message}`;
  if (SOAK) console.error(line);
  else console.log(line);
}

let soakTier = '?';
/** The living map's current tier (full, lite, calm), reported with every perf sample. */
export function noteSoakTier(tier: string): void {
  // clarity-allow: soak/dev trace line for the device log, never shown to a player.
  if (SOAK_TRACE && tier !== soakTier) { soakTier = tier; soakLog(`perf tier=${tier}`); }
}

type HermesStats = { js_heapSize?: number; js_allocatedBytes?: number };

/**
 * Soak-only perf sampler: once a second logs the JS thread's frame times (requestAnimationFrame
 * intervals: p50, p95 and max over the second) and the Hermes heap. Returns a stop function.
 * Nothing runs unless the soak trace is on.
 */
export function startSoakPerf(): () => void {
  if (!SOAK_TRACE) return () => undefined;
  let frames: number[] = [];
  let last = 0;
  let raf = 0;
  const tick = (t: number) => {
    if (last) frames.push(t - last);
    last = t;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const timer = setInterval(() => {
    const sorted = frames.slice().sort((a, b) => a - b);
    frames = [];
    const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
    const hermes = (globalThis as unknown as { HermesInternal?: { getInstrumentedStats?: () => HermesStats } }).HermesInternal;
    const stats = hermes?.getInstrumentedStats?.() ?? {};
    soakLog(`perf js_frames=${sorted.length} js_p50=${q(0.5).toFixed(1)} js_p95=${q(0.95).toFixed(1)} js_max=${q(1).toFixed(1)}`
      + ` heap_mb=${((stats.js_heapSize ?? 0) / 1048576).toFixed(1)} alloc_mb=${((stats.js_allocatedBytes ?? 0) / 1048576).toFixed(1)} tier=${soakTier}`);
  }, 1000);
  return () => { clearInterval(timer); cancelAnimationFrame(raf); };
}
