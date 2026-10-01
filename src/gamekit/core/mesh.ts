/**
 * mesh.ts: warped sprite meshes for drawn characters (pure, worklet-safe).
 *
 * Drawn frames carry the acting; a light mesh warp adds follow-through on top
 * (never a rubber puppet, never a restyle of Alex's line):
 *   - Whack v5 (Wave 2): 5x6 grid, head-row follow-through only, at most 6%
 *     displacement, 3 deg shear and 1% breathing, outline width variance
 *     under 10%, and no squash.
 *   - Sharky v7.1: tail mesh on the rear 40% (12x4); holding 3.2 Hz / 14u,
 *     sinking 1.8 Hz / 9u, settling 1.1 Hz / 8u, Overdrive 4 Hz / 16u.
 *   - Current Quest: 10x3 body wave, idle 2.5 px at 0.8 Hz, swim 5 px at 2.2 Hz.
 *   - Boss v7.1: 12x3 warp along each drawn tentacle's spine with a spring
 *     chain (damping 8, stiffness 140, tip <= 10 pt) and a 2 pt beat quiver.
 *   - Line Party puppets: 2x3, under 3% deform (breathing, squash).
 *
 * A grid is `cols` x `rows` VERTICES over a w x h sprite. Positions are
 * interleaved [x0, y0, x1, y1, ...] in sprite space (0..w, 0..h). Deformers
 * read `base` and write `out` so they compose: copy base, then apply in order.
 * fx/MeshSprite.tsx draws it as one Skia <Vertices> with the frame as shader.
 */

export interface MeshGrid {
  cols: number;
  rows: number;
  w: number;
  h: number;
  /** Rest positions, interleaved. */
  base: number[];
  /** Texture coordinates (sprite space), interleaved. */
  tex: number[];
  /** Triangle list. */
  indices: number[];
}

export function createMeshGrid(cols: number, rows: number, w: number, h: number): MeshGrid {
  'worklet';
  const base: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      base.push((c / (cols - 1)) * w, (r / (rows - 1)) * h);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  return { cols, rows, w, h, base, tex: base.slice(), indices };
}

/** out = base (start of a deform pass). */
export function meshReset(g: MeshGrid, out: number[]): void {
  'worklet';
  for (let i = 0; i < g.base.length; i++) out[i] = g.base[i];
}

export interface TailWave {
  /** Wave starts at this fraction of the length (Sharky: 0.6 = the rear 40%). */
  fromU: number;
  /** Peak amplitude (px) at the tip. */
  ampPx: number;
  hz: number;
  /** Waves along the moving part (1 = one full S). */
  wavelengths: number;
  /** Length axis: 'x' (side-on swimmer) or 'y'. */
  axis: 'x' | 'y';
  /** The tail is at the high end of the axis (true) or the low end. */
  tailAtEnd: boolean;
}

export const SHARKY_TAIL: Record<'holding' | 'sinking' | 'settling' | 'overdrive', { hz: number; ampPx: number }> = {
  holding: { hz: 3.2, ampPx: 14 },
  sinking: { hz: 1.8, ampPx: 9 },
  settling: { hz: 1.1, ampPx: 8 },
  overdrive: { hz: 4, ampPx: 16 },
};

/**
 * Travelling body wave: displacement perpendicular to the length axis, zero
 * before `fromU`, growing as ((u - fromU)/(1 - fromU))^1.5 toward the tip.
 * Current Quest uses fromU 0 for the whole-body swim.
 */
export function deformTailWave(g: MeshGrid, out: number[], tMs: number, wave: TailWave): void {
  'worklet';
  const n = g.cols * g.rows;
  const len = wave.axis === 'x' ? g.w : g.h;
  const span = 1 - wave.fromU;
  for (let i = 0; i < n; i++) {
    const bx = g.base[i * 2];
    const by = g.base[i * 2 + 1];
    let u = (wave.axis === 'x' ? bx : by) / len;
    if (!wave.tailAtEnd) u = 1 - u;
    if (u <= wave.fromU) continue;
    const k = span > 0 ? (u - wave.fromU) / span : 1;
    const env = k * Math.sqrt(k);
    const ph = 2 * Math.PI * (wave.hz * (tMs / 1000) - wave.wavelengths * k);
    const d = Math.sin(ph) * wave.ampPx * env;
    if (wave.axis === 'x') out[i * 2 + 1] += d;
    else out[i * 2] += d;
  }
}

export interface RowFollow {
  /** Rows from the top that move (Whack: the head row = 1, fading over 2). */
  rows: number;
  /** Follow-through offset (px) at the top row. */
  dx: number;
  dy: number;
  /** Shear (deg) of the moving rows about the lowest moving row. */
  shearDeg: number;
  /** Breathing scale (0.01 = +1%) of the whole mesh about its base centre. */
  breathe: number;
}

/** Whack v5 caps. */
export const WHACK_MESH_CAPS = { maxDisplace: 0.06, maxShearDeg: 3, maxBreathe: 0.01 } as const;

/**
 * Head-row follow-through with hard caps (Whack v5): displacement clamped to
 * maxDisplace x width, shear to maxShearDeg, breathing to maxBreathe, and
 * no squash (breathing scales x and y together).
 */
export function deformRowFollow(
  g: MeshGrid, out: number[], f: RowFollow,
  caps?: { maxDisplace: number; maxShearDeg: number; maxBreathe: number },
): void {
  'worklet';
  // No default parameter pointing at a module object: the Reanimated plugin
  // does not capture it (ENGINE.md, worklet note). Whack v5 caps inline.
  const capD = caps ? caps.maxDisplace : 0.06;
  const capS = caps ? caps.maxShearDeg : 3;
  const capB = caps ? caps.maxBreathe : 0.01;
  const maxD = capD * g.w;
  let dx = f.dx;
  let dy = f.dy;
  const dl = Math.sqrt(dx * dx + dy * dy);
  if (dl > maxD && dl > 0) {
    dx = (dx / dl) * maxD;
    dy = (dy / dl) * maxD;
  }
  const sh = Math.max(-capS, Math.min(capS, f.shearDeg));
  const shT = Math.tan((sh * Math.PI) / 180);
  const br = Math.max(-capB, Math.min(capB, f.breathe));
  const cx = g.w / 2;
  const cy = g.h;
  const moving = Math.max(1, Math.min(g.rows - 1, f.rows));
  const pivotY = (moving / (g.rows - 1)) * g.h;
  for (let r = 0; r < g.rows; r++) {
    const w = r < moving ? 1 - r / moving : 0;
    for (let c = 0; c < g.cols; c++) {
      const i = (r * g.cols + c) * 2;
      // Breathing about the base (feet stay planted).
      out[i] += (out[i] - cx) * br;
      out[i + 1] += (out[i + 1] - cy) * br;
      if (w > 0) {
        out[i] += dx * w + (pivotY - g.base[i + 1]) * shT * w;
        out[i + 1] += dy * w;
      }
    }
  }
}

// =============================================================================
// Spine chain (Boss tentacles): a spring per segment, warped along the spine.
// =============================================================================

export interface SpineChain {
  n: number;
  angle: number[];
  vel: number[];
  damping: number;
  stiffness: number;
  /** Max tip deviation (px) from the drawn frame. */
  tipMaxPx: number;
}

export function createSpineChain(n: number, damping = 8, stiffness = 140, tipMaxPx = 10): SpineChain {
  'worklet';
  const angle: number[] = [];
  const vel: number[] = [];
  for (let i = 0; i < n; i++) {
    angle.push(0);
    vel.push(0);
  }
  return { n, angle, vel, damping, stiffness, tipMaxPx };
}

/**
 * Step the chain toward a root bend (rad). Each segment chases its parent's
 * angle, so motion travels root to tip (follow-through). Semi-implicit Euler.
 */
export function stepSpineChain(ch: SpineChain, rootTarget: number, dtMs: number): void {
  'worklet';
  const dt = Math.min(0.05, dtMs / 1000);
  if (dt <= 0) return;
  for (let i = 0; i < ch.n; i++) {
    const target = i === 0 ? rootTarget : ch.angle[i - 1];
    const a = -ch.stiffness * (ch.angle[i] - target) - ch.damping * ch.vel[i];
    ch.vel[i] += a * dt;
    ch.angle[i] += ch.vel[i] * dt;
  }
}

/** Kick the chain (POP snap-back, slam impact). */
export function kickSpineChain(ch: SpineChain, impulse: number): void {
  'worklet';
  for (let i = 0; i < ch.n; i++) ch.vel[i] += impulse * (0.4 + (0.6 * i) / Math.max(1, ch.n - 1));
}

/**
 * Warp the grid along a spine on the x axis (root at x = 0): column c follows
 * the chain's cumulative bend, perpendicular offsets keep the limb's width.
 * The tip deviation is clamped to tipMaxPx so the drawing stays the drawing.
 */
export function deformSpine(g: MeshGrid, out: number[], ch: SpineChain, quiverPx = 0): void {
  'worklet';
  const seg = g.w / (g.cols - 1);
  // Build the spine polyline.
  let px = 0;
  let py = g.h / 2;
  let ang = 0;
  let tipDev = 0;
  const sx: number[] = [px];
  const sy: number[] = [py];
  const sa: number[] = [0];
  for (let c = 1; c < g.cols; c++) {
    const k = Math.min(ch.n - 1, Math.floor(((c - 1) / Math.max(1, g.cols - 2)) * (ch.n - 1)));
    ang += ch.angle[k] / (g.cols - 1);
    px += Math.cos(ang) * seg;
    py += Math.sin(ang) * seg;
    sx.push(px);
    sy.push(py);
    sa.push(ang);
  }
  tipDev = Math.sqrt((px - g.w) * (px - g.w) + (py - g.h / 2) * (py - g.h / 2));
  const clampK = tipDev > ch.tipMaxPx && tipDev > 0 ? ch.tipMaxPx / tipDev : 1;
  for (let r = 0; r < g.rows; r++) {
    const off = (r / (g.rows - 1) - 0.5) * g.h;
    for (let c = 0; c < g.cols; c++) {
      const i = (r * g.cols + c) * 2;
      const bx = g.base[i];
      const by = g.base[i + 1];
      const nx = -Math.sin(sa[c]);
      const ny = Math.cos(sa[c]);
      const wx = sx[c] + nx * off;
      const wy = sy[c] + ny * off;
      const q = quiverPx * (c / (g.cols - 1));
      out[i] += (wx - bx) * clampK;
      out[i + 1] += (wy - by) * clampK + q;
    }
  }
}

// =============================================================================
// Checks (tests and the dev overlay): keep the warp inside the art's limits.
// =============================================================================

/** Largest vertex displacement from rest (px). */
export function meshMaxDisplacement(g: MeshGrid, out: number[]): number {
  let m = 0;
  for (let i = 0; i < g.base.length; i += 2) m = Math.max(m, Math.hypot(out[i] - g.base[i], out[i + 1] - g.base[i + 1]));
  return m;
}

/**
 * Largest relative change of any grid edge length. A stand-in for "outline
 * width variance": Alex's line scales with the local stretch, so under 10%
 * stretch keeps his line weight under 10% variance (Whack v5).
 */
export function meshMaxStretch(g: MeshGrid, out: number[]): number {
  let m = 0;
  const edge = (a: number, b: number) => {
    const l0 = Math.hypot(g.base[b * 2] - g.base[a * 2], g.base[b * 2 + 1] - g.base[a * 2 + 1]);
    const l1 = Math.hypot(out[b * 2] - out[a * 2], out[b * 2 + 1] - out[a * 2 + 1]);
    if (l0 > 0) m = Math.max(m, Math.abs(l1 / l0 - 1));
  };
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const a = r * g.cols + c;
      if (c + 1 < g.cols) edge(a, a + 1);
      if (r + 1 < g.rows) edge(a, a + g.cols);
    }
  }
  return m;
}
