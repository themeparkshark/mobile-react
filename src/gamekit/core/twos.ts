/**
 * twos.ts: "on twos" animation and line boil (pure, worklet-safe).
 *
 * Hand-drawn games animate drawings at 12 fps (every second frame of 24) while
 * the camera and positions stay smooth. The designs ask for it everywhere:
 *   - Whack v5: hand-drawn FX re-pick +/-8 deg rotation and +/-6% scale and
 *     step their flipbooks every 83 ms with a staggered phase, while position
 *     updates every frame. Rings and text stay smooth.
 *   - Trivia rev 7: one grid, twosFrame = floor(fxMs / 83.33), drives Fin,
 *     the avatar hop, the crate spin and confetti on the same frame.
 *   - Parade Beat (Hi-Fi Rush line boil): 3 precomputed noise offset sets
 *     cycled at 12 fps, 0.75 pt on the reading surface, 1.5 pt on the world.
 *   - Boss and Line Party: procedural strokes get a 12 fps line boil.
 *
 * Everything runs on the fx clock, so a hit-stop freezes the boil too.
 */

/** One drawing frame at 12 fps (ms). */
export const TWOS_MS = 1000 / 12;

/** Frame index on the 12 fps grid (or any fps). */
export function twosFrame(fxMs: number, fps = 12): number {
  'worklet';
  return Math.floor((fxMs * fps) / 1000);
}

/** Frame index with a per-item phase offset (ms), so a burst does not step in lockstep. */
export function twosFramePhased(fxMs: number, phaseMs: number, fps = 12): number {
  'worklet';
  return Math.floor(((fxMs + phaseMs) * fps) / 1000);
}

/** Deterministic hash of three ints to [0, 1). */
export function twosHash(a: number, b: number, c: number): number {
  'worklet';
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ ((b | 0) + 0x632be5ab), 0xc2b2ae35);
  h = Math.imul(h ^ ((c | 0) + 0x27d4eb2f), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** A value in [-amp, amp] that holds for one drawing frame, then re-picks. */
export function twosJitter(seed: number, frame: number, salt: number, amp: number): number {
  'worklet';
  return (twosHash(seed, frame, salt) * 2 - 1) * amp;
}

/** Whack v5 defaults: +/-8 deg and +/-6% scale per drawing frame. */
export const TWOS_DEFAULT = { rotDeg: 8, scale: 0.06, fps: 12 } as const;

/**
 * Flipbook frame for a looping or one-shot sequence stepped on twos.
 * `loop` false holds the last frame.
 */
export function flipbookFrame(fxMs: number, startMs: number, frames: number, loop = true, phaseMs = 0, fps = 12): number {
  'worklet';
  if (frames <= 1) return 0;
  const f = Math.floor(((fxMs - startMs + phaseMs) * fps) / 1000);
  if (f < 0) return 0;
  return loop ? f % frames : f >= frames ? frames - 1 : f;
}

// =============================================================================
// Line boil: N precomputed offset sets, cycled on twos.
// =============================================================================

export interface BoilSets {
  /** Points per set. */
  n: number;
  /** Number of sets (3 in Hi-Fi Rush style). */
  sets: number;
  /** Max offset (px). */
  amp: number;
  /** [set][point][x,y] flattened. */
  data: number[];
}

/**
 * Precompute `sets` x `n` offset pairs. Offsets are smooth along the line
 * (neighbouring points move together), so a boiled ring wobbles like a
 * redrawn pencil line instead of fizzing.
 */
export function createBoilSets(n: number, amp: number, sets = 3, seed = 11): BoilSets {
  'worklet';
  const data: number[] = [];
  for (let s = 0; s < sets; s++) {
    // Sum of two low-frequency waves with random phase per set, plus a little grain.
    const p1 = twosHash(seed, s, 1) * Math.PI * 2;
    const p2 = twosHash(seed, s, 2) * Math.PI * 2;
    const k1 = 2 + Math.floor(twosHash(seed, s, 3) * 3);
    const k2 = 5 + Math.floor(twosHash(seed, s, 4) * 4);
    for (let i = 0; i < n; i++) {
      const u = (i / Math.max(1, n)) * Math.PI * 2;
      const gx = (twosHash(seed, s * 1000 + i, 5) * 2 - 1) * 0.2;
      const gy = (twosHash(seed, s * 1000 + i, 6) * 2 - 1) * 0.2;
      const ox = 0.55 * Math.sin(k1 * u + p1) + 0.25 * Math.sin(k2 * u + p2) + gx;
      const oy = 0.55 * Math.cos(k1 * u + p2) + 0.25 * Math.cos(k2 * u + p1) + gy;
      data.push(ox, oy);
    }
  }
  // Normalize so the largest offset is exactly `amp` (0.75 pt means 0.75 pt).
  let m = 0;
  for (let i = 0; i < data.length; i += 2) {
    const h = Math.sqrt(data[i] * data[i] + data[i + 1] * data[i + 1]);
    if (h > m) m = h;
  }
  const k = m > 0 ? amp / m : 0;
  for (let i = 0; i < data.length; i++) data[i] *= k;
  return { n, sets, amp, data };
}

/** Which set is showing at this fx time (cycles every drawing frame). */
export function boilSetAt(b: BoilSets, fxMs: number, fps = 12): number {
  'worklet';
  return twosFrame(fxMs, fps) % b.sets;
}

/**
 * Write the boiled polyline into out arrays (same length as xs). `scale`
 * multiplies the stored amplitude (reduced motion passes 0).
 */
export function applyBoil(
  b: BoilSets, set: number, xs: number[], ys: number[], outXs: number[], outYs: number[], scale = 1,
): void {
  'worklet';
  const n = xs.length;
  const base = (set % b.sets) * b.n * 2;
  for (let i = 0; i < n; i++) {
    const j = base + (i % b.n) * 2;
    outXs[i] = xs[i] + b.data[j] * scale;
    outYs[i] = ys[i] + b.data[j + 1] * scale;
  }
}

/** Largest offset any set applies (tests: the reading surface stays under 0.75 pt). */
export function boilMaxOffset(b: BoilSets): number {
  let m = 0;
  for (let i = 0; i < b.data.length; i += 2) m = Math.max(m, Math.hypot(b.data[i], b.data[i + 1]));
  return m;
}

/** Points on a circle (for boiled rings). */
export function circlePoints(cx: number, cy: number, r: number, n: number, xs: number[], ys: number[]): void {
  'worklet';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    xs[i] = cx + Math.cos(a) * r;
    ys[i] = cy + Math.sin(a) * r;
  }
}
