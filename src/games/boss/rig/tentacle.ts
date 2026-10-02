/**
 * The striking tentacle (design v7 11.6), pure and worklet-safe.
 *
 * A limb is a chain of SEG + 1 joints (24 segments always), laid on a cubic
 * Bezier from the root (at the water lip) to the tip and resampled by arc
 * length every frame, with a tip-curl bone over the last 15%. Poses are chains;
 * clips lerp between chains. The strip builder turns a chain into a tapered
 * triangle strip (1.0 at the root to 0.25 at the tip, smoothstep) whose texture
 * u is the fixed rest fraction i / SEG, so the suckers stay on the same flesh
 * when the limb stretches (they never swim).
 */

export const SEG = 24;
export const JOINTS = SEG + 1;
const SAMPLES = 32;

function smooth01(x: number): number {
  'worklet';
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

// Worklet helpers are declared before their callers: the Reanimated plugin captures a
// worklet's closure where it is created, so a later declaration is undefined on the UI runtime.

/** Bend the last 15% of the chain progressively by `curl` radians (positive = clockwise on screen). */
export function curlTip(out: number[], curl: number): void {
  'worklet';
  const from = SEG - 4;
  for (let j = from; j < SEG; j++) {
    // Rotate every joint after j around joint j by the incremental angle.
    const cx = out[j * 2];
    const cy = out[j * 2 + 1];
    const c = Math.cos(curl / 4);
    const s = Math.sin(curl / 4);
    for (let m = j + 1; m < JOINTS; m++) {
      const dx = out[m * 2] - cx;
      const dy = out[m * 2 + 1] - cy;
      out[m * 2] = cx + dx * c - dy * s;
      out[m * 2 + 1] = cy + dx * s + dy * c;
    }
  }
}

/** Fill `out` (2 x JOINTS numbers) with joints on a cubic Bezier, resampled by arc length, then curl the tip. */
export function bezierChain(
  out: number[], x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
  curl: number,
): void {
  'worklet';
  const px: number[] = [];
  const py: number[] = [];
  const len: number[] = [0];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    px.push(a * x0 + b * x1 + c * x2 + d * x3);
    py.push(a * y0 + b * y1 + c * y2 + d * y3);
    if (i > 0) len.push(len[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]));
  }
  const total = len[SAMPLES] || 1;
  let k = 0;
  for (let j = 0; j < JOINTS; j++) {
    const s = (j / SEG) * total;
    while (k < SAMPLES - 1 && len[k + 1] < s) k++;
    const span = len[k + 1] - len[k] || 1;
    const f = (s - len[k]) / span;
    out[j * 2] = px[k] + (px[k + 1] - px[k]) * f;
    out[j * 2 + 1] = py[k] + (py[k + 1] - py[k]) * f;
  }
  if (curl !== 0) curlTip(out, curl);
}

/** out = a + (b - a) * t, joint by joint. */
export function lerpChain(out: number[], a: number[], b: number[], t: number): void {
  'worklet';
  for (let i = 0; i < JOINTS * 2; i++) out[i] = a[i] + (b[i] - a[i]) * t;
}

export function newChain(): number[] {
  'worklet';
  const c: number[] = [];
  for (let i = 0; i < JOINTS * 2; i++) c.push(0);
  return c;
}

/** Half-width at joint j: 1.0 at the root to 0.25 at the tip (smoothstep). */
export function taper(j: number): number {
  'worklet';
  return 1 - 0.75 * smooth01(j / SEG);
}

export interface Pt { x: number; y: number }

/**
 * Triangle-strip vertices for a chain: two per joint (left, right of travel),
 * half-width w0 x taper + grow. `flip` puts the sucker edge (texture v = 1) on
 * the other side (the sucker-side flip). Texture coords map u = j / SEG across
 * `texW` (stopping at `tipU` of the strip) and v across `texH`.
 */
export function stripVerts(
  chain: number[], w0: number, grow: number, dy: number, flip: boolean, texW: number, texH: number, tipU: number,
  pos: Pt[], tex: Pt[],
): void {
  'worklet';
  for (let j = 0; j < JOINTS; j++) {
    const a = j > 0 ? j - 1 : 0;
    const b = j < SEG ? j + 1 : SEG;
    let tx = chain[b * 2] - chain[a * 2];
    let ty = chain[b * 2 + 1] - chain[a * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    // Left normal of travel.
    const nx = ty;
    const ny = -tx;
    const w = w0 * taper(j) + grow;
    const x = chain[j * 2];
    const y = chain[j * 2 + 1] + dy;
    pos[j * 2] = { x: x + nx * w, y: y + ny * w };
    pos[j * 2 + 1] = { x: x - nx * w, y: y - ny * w };
    const u = (j / SEG) * texW * tipU;
    tex[j * 2] = { x: u, y: flip ? texH : 0 };
    tex[j * 2 + 1] = { x: u, y: flip ? 0 : texH };
  }
}

/** Triangle indices for a JOINTS-pair strip (fixed; build once). */
export function stripIndices(): number[] {
  const idx: number[] = [];
  for (let j = 0; j < SEG; j++) {
    const a = j * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return idx;
}

/** Point at arc fraction f (0 root .. 1 tip) along a chain. */
export function chainAt(chain: number[], f: number): Pt {
  'worklet';
  const x = Math.max(0, Math.min(1, f)) * SEG;
  const j = Math.min(SEG - 1, Math.floor(x));
  const r = x - j;
  return {
    x: chain[j * 2] + (chain[(j + 1) * 2] - chain[j * 2]) * r,
    y: chain[j * 2 + 1] + (chain[(j + 1) * 2 + 1] - chain[j * 2 + 1]) * r,
  };
}

/** Arc fraction of the joint whose x is nearest `x` (the pinned limb's sucker over a lane). */
export function fractionAtX(chain: number[], x: number): number {
  'worklet';
  let best = 0;
  let bd = 1e9;
  for (let j = 0; j < JOINTS; j++) {
    const d = Math.abs(chain[j * 2] - x);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best / SEG;
}

/**
 * Closed-form bouncing body (part-breaks): position at time t (s) for a body
 * launched at (x0, y0) with velocity (vx, vy) under gravity g onto a floor,
 * restitution e, horizontal damping per bounce, at most `bounces` bounces, then
 * resting. Pure in t, so it freezes with the fx clock and replays identically.
 */
export function bounceAt(
  t: number, x0: number, y0: number, vx: number, vy: number, floor: number, g: number, e: number, bounces: number,
): { x: number; y: number; rest: boolean; bounce: number } {
  'worklet';
  let tt = t;
  let x = x0;
  let y = y0;
  let ux = vx;
  let uy = vy;
  for (let n = 0; n <= bounces; n++) {
    // Time to reach the floor: y + uy t + g t^2 / 2 = floor.
    const disc = uy * uy + 2 * g * (floor - y);
    const th = disc > 0 ? (-uy + Math.sqrt(disc)) / g : 0;
    if (tt <= th) return { x: x + ux * tt, y: y + uy * tt + 0.5 * g * tt * tt, rest: false, bounce: n };
    tt -= th;
    x += ux * th;
    y = floor;
    const vImpact = uy + g * th;
    uy = -vImpact * e;
    ux *= 0.6;
  }
  return { x, y: floor, rest: true, bounce: bounces + 1 };
}
