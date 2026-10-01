/**
 * Shark motion (design 9.1 to 9.10) as pure worklet functions: the UI thread
 * evaluates a MotionPlan at the fx clock each frame, so hit-stop freezes it
 * and no React render ever drives the shark. Node tests run the same code.
 *
 * Timings (ms): swim = 40 anticipation + 150 travel + 40 land;
 * carry = swim travel + 60 grab + 75 per tile + 180 spit-out settle.
 */

export const POSE_IDLE = 0;
export const POSE_DASH = 1;
export const POSE_OUCH = 2;
export const POSE_CHEER = 3;
export const POSE_DIZZY = 4;
/** Belly-down surf ride: every carry, including vertical ones (design v5 F1). */
export const POSE_SURF = 5;
export const POSE_COUNT = 6;

export const PLAN_IDLE = 0;
export const PLAN_STROKE = 1;
export const PLAN_BUMP = 2;
export const PLAN_UNDO = 3;
export const PLAN_TREAD = 4;
export const PLAN_WHIRL = 5;
export const PLAN_CHEER = 6;
export const PLAN_RISE = 7;

export const T_ANTIC = 40;
export const T_TRAVEL = 150;
export const T_LAND = 40;
export const T_GRAB = 60;
export const T_TILE = 75;
export const T_SPIT = 180;
export const T_DIVE = 220;
export const T_BUMP = 260;
export const T_TREAD = 320;
export const T_WHIRL = 900;
export const UNDO_SPEED = 1.6;

export interface MotionPlan {
  kind: number;
  /** fx ms the plan started; -1 = stamp on the next frame. */
  t0: number;
  /** Path cell centres as x,y pairs (stroke: from, swim target, carried...). */
  pts: number[];
  /** Tiles carried by the current (0 = plain swim). */
  carry: number;
  /** Facing at plan start (+1 right, -1 left). */
  facing: number;
  /** 1 when the stroke ends in the chest (dive). */
  dive: number;
  /** 1 when the stroke ends beached on a dry sandbar. */
  beached: number;
  /** 1 when the shark starts the plan beached (wriggle first). */
  wasBeached: number;
  /** Bump target x,y (bump plans). */
  bx: number;
  by: number;
  /** Plan speed multiplier (undo replays at 1.6x; a buffered commit plays the rest at 2x). */
  speed: number;
  /** 1 on a Riptide stroke: corkscrew roll and gold trail (ordinary carries never spin). */
  rip: number;
}

export interface SharkFrame {
  x: number;
  y: number;
  /** Radians, applied after the facing flip. */
  rot: number;
  sx: number;
  sy: number;
  scale: number;
  alpha: number;
  facing: number;
  pose: number;
  /** Body-wave amplitude (px) and frequency (Hz). */
  waveA: number;
  waveF: number;
  /** 0..1: how "carried" the shark is (drives stretch lines and wake). */
  carrying: number;
  /** Corkscrew roll factor (1 = none). */
  roll: number;
  /** Tiles travelled so far along the path (for pickups magnetism). */
  along: number;
  /** Plan finished. */
  done: boolean;
}

export function idlePlan(x: number, y: number, facing = 1): MotionPlan {
  'worklet';
  return { kind: PLAN_IDLE, t0: 0, pts: [x, y], carry: 0, facing, dive: 0, beached: 0, wasBeached: 0, bx: x, by: y, speed: 1, rip: 0 };
}

export function newFrame(): SharkFrame {
  'worklet';
  return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, scale: 1, alpha: 1, facing: 1, pose: POSE_IDLE, waveA: 2.5, waveF: 0.8, carrying: 0, roll: 1, along: 0, done: true };
}

function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function outCubic(t: number): number {
  'worklet';
  const u = 1 - t;
  return 1 - u * u * u;
}

function outQuad(t: number): number {
  'worklet';
  return 1 - (1 - t) * (1 - t);
}

function inBack(t: number, s: number): number {
  'worklet';
  return t * t * ((s + 1) * t - s);
}

/** Damped spring settle from 1 toward 0 (overshoot-and-return shape). */
function settle(t: number): number {
  'worklet';
  if (t >= 1) return 0;
  return Math.exp(-5 * t) * Math.cos(t * Math.PI * 2.2);
}

/** Heading angle for a segment given the facing (+1 right, -1 left). */
function tiltFor(dx: number, dy: number): number {
  'worklet';
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? -0.61 : 0.61; // +/-35 deg
  return 0;
}

/** Total plan duration (ms, before speed). */
export function planDuration(p: MotionPlan): number {
  'worklet';
  if (p.kind === PLAN_STROKE || p.kind === PLAN_UNDO) {
    const wr = p.wasBeached ? 120 : 0;
    const base = p.carry > 0 ? T_ANTIC + T_TRAVEL + T_GRAB + T_TILE * p.carry + T_SPIT : T_ANTIC + T_TRAVEL + T_LAND + 90;
    const dive = p.dive ? T_DIVE + 40 : 0;
    const beach = p.beached ? 160 : 0;
    return (wr + base + dive + beach) / (p.speed || 1);
  }
  if (p.kind === PLAN_BUMP) return T_BUMP;
  if (p.kind === PLAN_TREAD) return T_TREAD;
  if (p.kind === PLAN_WHIRL) return T_WHIRL;
  if (p.kind === PLAN_CHEER) return 900;
  return 0;
}

/**
 * Evaluate the plan at time `t` (fx ms since the plan start) into `out`.
 * `idleT` is the free-running fx time for idle bob and waves.
 */
export function evalShark(p: MotionPlan, t: number, idleT: number, out: SharkFrame): void {
  'worklet';
  const n = p.pts.length / 2;
  const endX = p.pts[(n - 1) * 2];
  const endY = p.pts[(n - 1) * 2 + 1];
  const bob = Math.sin((idleT / 1600) * Math.PI * 2) * 3;
  out.scale = 1;
  out.alpha = 1;
  out.roll = 1;
  out.carrying = 0;
  out.sx = 1;
  out.sy = 1;
  out.rot = Math.sin((idleT / 1600) * Math.PI * 2) * 0.026;
  out.facing = p.facing;
  out.pose = POSE_IDLE;
  out.waveA = 2.5;
  out.waveF = 0.8;
  out.along = 0;
  out.done = true;

  if (p.kind === PLAN_IDLE || n < 1) {
    out.x = endX;
    out.y = endY + bob;
    // Beached flop: the bump-ouch pose tipped 70 deg onto its side (P1 dizzy stand-in).
    if (p.beached) { out.pose = POSE_DIZZY; out.rot = 1.22 * (p.facing > 0 ? 1 : -1); out.y = endY + 4; out.waveA = 0.6; }
    return;
  }

  if (p.kind === PLAN_BUMP) {
    const sx0 = p.pts[0];
    const sy0 = p.pts[1];
    const dx = p.bx - sx0;
    const dy = p.by - sy0;
    let k = 0;
    if (t < 60) k = outQuad(t / 60) * 0.18;
    else if (t < 170) k = 0.18 * (1 - outCubic((t - 60) / 110));
    out.x = sx0 + dx * k;
    out.y = sy0 + dy * k + bob;
    out.pose = t < T_BUMP ? POSE_OUCH : POSE_IDLE;
    const hit = t < 60 ? 0 : clamp01(1 - (t - 60) / 140);
    out.sx = 1 - 0.14 * hit;
    out.sy = 1 + 0.08 * hit;
    out.waveA = 1;
    out.done = t >= T_BUMP;
    return;
  }

  if (p.kind === PLAN_TREAD) {
    const k = clamp01(t / T_TREAD);
    out.x = endX;
    out.y = endY + bob + Math.sin(k * Math.PI) * 5;
    out.sy = 1 - 0.08 * Math.sin(k * Math.PI);
    out.sx = 1 + 0.06 * Math.sin(k * Math.PI);
    out.waveA = 4;
    out.waveF = 2.4;
    out.done = t >= T_TREAD;
    return;
  }

  if (p.kind === PLAN_WHIRL) {
    const k = clamp01(t / T_WHIRL);
    const ang = k * Math.PI * 4;
    const rad = (1 - k) * 14;
    out.x = endX + Math.cos(ang) * rad;
    out.y = endY + Math.sin(ang) * rad;
    out.rot = ang;
    out.scale = 1 - 0.4 * k;
    out.alpha = 1 - 0.3 * k;
    out.pose = POSE_DIZZY;
    out.waveA = 1;
    out.done = t >= T_WHIRL;
    return;
  }

  if (p.kind === PLAN_CHEER) {
    const k = clamp01(t / 900);
    out.x = endX;
    out.y = endY - Math.abs(Math.sin(k * Math.PI * 2)) * 10 * (1 - k * 0.5);
    out.pose = POSE_CHEER;
    out.sx = 1 + 0.05 * Math.sin(k * Math.PI * 4);
    out.sy = 1 - 0.05 * Math.sin(k * Math.PI * 4);
    out.done = t >= 900;
    return;
  }

  // Stroke or undo (undo replays the path backwards, faster).
  const speed = p.speed || 1;
  let tt = t * speed;
  const wriggle = p.wasBeached ? 120 : 0;
  if (tt < wriggle) {
    out.x = p.pts[0];
    out.y = p.pts[1] + bob;
    out.waveA = 5;
    out.waveF = 8;
    out.pose = POSE_DIZZY;
    out.done = false;
    return;
  }
  tt -= wriggle;
  const reverse = p.kind === PLAN_UNDO;
  const px = (i: number) => (reverse ? p.pts[(n - 1 - i) * 2] : p.pts[i * 2]);
  const py = (i: number) => (reverse ? p.pts[(n - 1 - i) * 2 + 1] : p.pts[i * 2 + 1]);
  const x0 = px(0);
  const y0 = py(0);
  const x1 = n > 1 ? px(1) : x0;
  const y1 = n > 1 ? py(1) : y0;
  let facing = p.facing;
  if (Math.abs(x1 - x0) > 0.5) facing = x1 > x0 ? 1 : -1;
  out.facing = facing;
  const tilt0 = tiltFor(x1 - x0, y1 - y0) * facing;
  const horiz0 = Math.abs(y1 - y0) < Math.abs(x1 - x0);
  const carry = p.carry;
  const travelEnd = T_ANTIC + T_TRAVEL;
  const rideEnd = travelEnd + (carry > 0 ? T_GRAB + T_TILE * carry : 0);
  const settleEnd = rideEnd + (carry > 0 ? T_SPIT : T_LAND + 90);
  out.done = false;

  if (tt < T_ANTIC) {
    const k = outQuad(tt / T_ANTIC);
    out.x = x0;
    out.y = y0 + bob;
    out.pose = POSE_DASH;
    // Squash along the move axis, 8 deg lean into the stroke.
    out.sx = horiz0 ? 1 - 0.1 * k : 1 + 0.12 * k;
    out.sy = horiz0 ? 1 + 0.12 * k : 1 - 0.1 * k;
    out.rot = tilt0 * k * 0.5 + 0.14 * k * (horiz0 ? -1 : 0);
    out.waveA = 5;
    out.waveF = 2.2;
    return;
  }
  if (tt < travelEnd) {
    const k = outCubic((tt - T_ANTIC) / T_TRAVEL);
    out.x = x0 + (x1 - x0) * k;
    out.y = y0 + (y1 - y0) * k + bob * (1 - k);
    out.pose = POSE_DASH;
    out.sx = 1.1 - 0.1 * k;
    out.sy = 0.94 + 0.06 * k;
    out.rot = tilt0;
    out.waveA = 5;
    out.waveF = 2.2;
    out.along = k;
    return;
  }
  if (carry > 0 && tt < rideEnd) {
    const rt = tt - travelEnd;
    out.pose = POSE_SURF;
    out.waveA = 1.5;
    out.waveF = 1.6;
    out.carrying = 1;
    if (rt < T_GRAB) {
      out.x = x1;
      out.y = y1;
      const g = rt / T_GRAB;
      out.sx = 1 + 0.08 * g;
      out.sy = 1 - 0.05 * g;
      const x2 = px(2);
      const y2 = py(2);
      if (Math.abs(x2 - x1) > 0.5) facing = x2 > x1 ? 1 : -1;
      out.facing = facing;
      out.rot = tiltFor(x2 - x1, y2 - y1) * facing * g;
      out.along = 1;
      return;
    }
    const f = (rt - T_GRAB) / T_TILE;
    const seg = Math.min(carry - 1, Math.floor(f));
    const k = f - seg;
    const ax = px(1 + seg);
    const ay = py(1 + seg);
    const bx = px(2 + seg);
    const by = py(2 + seg);
    if (Math.abs(bx - ax) > 0.5) facing = bx > ax ? 1 : -1;
    out.facing = facing;
    out.x = ax + (bx - ax) * k;
    out.y = ay + (by - ay) * k;
    // Stretch along the body axis ramps 1.0 -> 1.25 over the first tile and holds (F7).
    const ramp = clamp01(f);
    out.sx = 1 + 0.25 * ramp;
    out.sy = 1 - 0.1 * ramp;
    out.rot = tiltFor(bx - ax, by - ay) * facing;
    // Corkscrew roll on Riptide strokes only (read from the side, face stays visible).
    if (p.rip) {
      const mid = clamp01((f / carry - 0.25) / 0.5);
      out.roll = 1 - 0.4 * Math.sin(mid * Math.PI);
    }
    out.along = 1 + f;
    return;
  }
  // Land / spit-out settle.
  const lastX = px(n - 1);
  const lastY = py(n - 1);
  const prevX = n > 1 ? px(n - 2) : lastX;
  const prevY = n > 1 ? py(n - 2) : lastY;
  const ux = lastX - prevX;
  const uy = lastY - prevY;
  const len = Math.sqrt(ux * ux + uy * uy) || 1;
  if (Math.abs(ux) > 0.5) facing = ux > 0 ? 1 : -1;
  out.facing = facing;
  out.along = n - 1;
  if (tt < settleEnd) {
    const st = (tt - rideEnd) / (settleEnd - rideEnd);
    const over = carry > 0 ? 0.22 : 0.06;
    const s = settle(st);
    // Overshoot toward the blocker, then settle back (Pokemon ice stop).
    const cellLen = len;
    out.x = lastX + (ux / len) * cellLen * over * s * (carry > 0 ? 1 : 0.5);
    out.y = lastY + (uy / len) * cellLen * over * s * (carry > 0 ? 1 : 0.5) + bob * clamp01(st);
    const imp = clamp01(1 - st * 3);
    const horiz = Math.abs(ux) > Math.abs(uy);
    // 1-frame squash against the wall (scaleX 0.80) on a spit-out, softer on a plain landing.
    const squash = carry > 0 ? 0.2 : 0.12;
    out.sx = horiz ? 1 - squash * imp : 1 + 0.1 * imp;
    out.sy = horiz ? 1 + 0.1 * imp : 1 - squash * imp;
    out.pose = st < 0.4 ? (carry > 0 ? POSE_SURF : POSE_DASH) : POSE_IDLE;
    out.rot = tiltFor(ux, uy) * facing * (1 - outQuad(st));
    out.waveA = 3.5;
    out.waveF = 1.6;
    return;
  }
  out.x = lastX;
  out.y = lastY + bob;
  let rest = tt - settleEnd;
  if (p.dive) {
    const k = clamp01(rest / T_DIVE);
    const e = inBack(k, 1.5);
    out.scale = 1 - 0.4 * e;
    out.alpha = 1 - clamp01((k - 0.6) / 0.4);
    out.y = lastY + 6 * e;
    out.pose = POSE_DASH;
    out.done = rest >= T_DIVE + 40;
    return;
  }
  if (p.beached) {
    const k = clamp01(rest / 160);
    out.pose = POSE_DIZZY;
    out.rot = 1.22 * k * (facing > 0 ? 1 : -1);
    out.sy = 1 - 0.08 * k;
    out.waveA = 0.6;
    out.done = rest >= 160;
    rest = 0;
    return;
  }
  out.done = true;
}

// ---------------------------------------------------------------------------
// Mesh (9.1): a 10 x 3 vertex grid laid along the body axis.

export const MESH_COLS = 10;
export const MESH_ROWS = 3;

/** Triangle indices for the grid (row-major vertices). */
export function meshIndices(cols = MESH_COLS, rows = MESH_ROWS): number[] {
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  return idx;
}

/** Texture coordinates in image pixels for an image of w x h (mirror: the art faces left, so u runs right to left). */
export function meshTextures(w: number, h: number, cols = MESH_COLS, rows = MESH_ROWS, mirror = false): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      out.push({ x: (mirror ? 1 - u : u) * w, y: (r / (rows - 1)) * h });
    }
  }
  return out;
}

/**
 * Deformed vertex positions (screen px) for a pose drawn w x h with its
 * anchor at the frame centre. `side` poses swim along x (head right, tail at
 * u = 0); upright poses wave along y (tail at the bottom). `tail` is the
 * lagging tail angle (radians) from the follow-through spring.
 */
export function meshVertices(
  f: SharkFrame, w: number, h: number, side: boolean, time: number, tail: number,
  out: { x: number; y: number }[], cols = 10, rows = 3,
): void {
  'worklet';
  const cos = Math.cos(f.rot);
  const sin = Math.sin(f.rot);
  const sc = f.scale;
  const tSec = time / 1000;
  let k = 0;
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      let lx = (u - 0.5) * w;
      let ly = (v - 0.5) * h;
      if (side) {
        // Weight: 0 at the head (u = 1) rising to 1 at the tail (u = 0).
        const wgt = Math.pow(1 - u, 1.5);
        ly += f.waveA * wgt * Math.sin(2 * Math.PI * (f.waveF * tSec - (1 - u) / 0.9));
        if (u < 0.22) {
          // Tail follow-through: rotate the tail columns around the tail root.
          const rootX = (0.22 - 0.5) * w;
          const ang = tail * (1 - u / 0.22);
          const dx = lx - rootX;
          const cy = Math.cos(ang);
          const sy2 = Math.sin(ang);
          lx = rootX + dx * cy - ly * sy2;
          ly = dx * sy2 + ly * cy;
        }
        ly *= f.roll;
      } else {
        const wgt = v;
        lx += f.waveA * 0.6 * wgt * Math.sin(2 * Math.PI * (f.waveF * tSec - v / 0.9));
      }
      lx *= f.sx * sc * f.facing;
      ly *= f.sy * sc;
      const o = out[k++];
      o.x = f.x + lx * cos - ly * sin;
      o.y = f.y + lx * sin + ly * cos;
    }
  }
}
