/**
 * Development and measurement builds only (EXPO_PUBLIC_DEV_HEADING_SIM): a
 * simulator has no compass, so this plays a scripted, noisy compass the way
 * an iPhone delivers it (up to 30 samples a second, a sample only when the
 * reading moved 1 degree or more, a couple of degrees of hand and sensor
 * noise), through the same callback shape as Location.watchHeadingAsync.
 *
 * The script is a 30 s loop of holds and turns (a walk's turn, a spin through
 * north, a slow look around, a fast about-face). `trueHeadingAt` is the
 * noiseless truth, so a probe can score lag and jitter against it.
 * Deterministic (seeded), so before and after runs see the same samples.
 */

type Seg = { readonly at: number; readonly to: number };
/** [seconds, heading]: the heading eases from the previous point to this one, or holds when equal. */
const SCRIPT: readonly Seg[] = [
  { at: 0, to: 10 }, { at: 4, to: 10 }, { at: 5, to: 100 }, { at: 9, to: 100 },
  { at: 10.5, to: -10 }, { at: 14, to: -10 }, { at: 16, to: 60 }, { at: 20, to: 60 },
  { at: 21, to: 240 }, { at: 26, to: 240 }, { at: 30, to: 370 },
];
export const HEADING_SIM_LOOP_S = 30;
/** Hold windows (s, after a 0.6 s settle) where the true heading is constant: jitter is measured here. */
export const HEADING_SIM_HOLDS: readonly (readonly [number, number])[] = [[0.6, 4], [5.6, 9], [11.1, 14], [16.6, 20], [21.6, 26]];

const norm = (d: number) => ((d % 360) + 360) % 360;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The noiseless scripted heading at `seconds` since the start. */
export function trueHeadingAt(seconds: number): number {
  const s = ((seconds % HEADING_SIM_LOOP_S) + HEADING_SIM_LOOP_S) % HEADING_SIM_LOOP_S;
  for (let i = 1; i < SCRIPT.length; i++) {
    const a = SCRIPT[i - 1], b = SCRIPT[i];
    if (s <= b.at) return norm(a.to + (b.to - a.to) * smooth((s - a.at) / (b.at - a.at)));
  }
  return norm(SCRIPT[SCRIPT.length - 1].to);
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type HeadingSample = { trueHeading: number; magHeading: number; accuracy: number };

/** Starts the scripted compass; the returned object stops it (same shape as a LocationSubscription). */
export function startHeadingSim(onSample: (sample: HeadingSample) => void): { remove: () => void } {
  const random = rng(20261008);
  const gauss = () => {
    const u = Math.max(1e-9, random()), v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const t0 = Date.now();
  const g = globalThis as unknown as { __headingSimT0?: number };
  g.__headingSimT0 = t0;
  let wander = 0;
  let last: number | null = null;
  const timer = setInterval(() => {
    const s = (Date.now() - t0) / 1000;
    // Slow drift (hand sway) plus sample noise: about 2.5 degrees of scatter, like a phone held while walking.
    wander = wander * 0.97 + gauss() * 0.35;
    const raw = norm(trueHeadingAt(s) + wander + gauss() * 2);
    // iOS headingFilter is 1 degree: no sample until the reading moved that far.
    if (last !== null) {
      let d = Math.abs(raw - last); if (d > 180) d = 360 - d;
      if (d < 1) return;
    }
    last = raw;
    onSample({ trueHeading: raw, magHeading: raw, accuracy: 10 });
  }, 33);
  return { remove: () => clearInterval(timer) };
}
