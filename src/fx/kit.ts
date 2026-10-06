import KIT_DATA from './kit.json';
import { hash01, momentAt } from './registry-core';

/**
 * The Secret Shop kit rig (secret-shop/DESIGN-WAVE2.md 3): most wave-2 pieces are data, not
 * code. A kit item is a few drawn parts in groups, each with calm looping motion, one moment
 * (pose-to-pose keys on a smooth curve), particle emitters with a fixed pool, and an optional
 * gentle lift or rock of the shark. Everything here is a pure worklet of the stage clock, so
 * tests can sample it in Node and the rest-frame compositor reads the same kit.json.
 *
 * Units: positions are paper-canvas fractions (x of the width, y of the height), the same as
 * geometry.json. Rotations are degrees clockwise. Times are ms.
 */

export type Loop =
  /** Rocks about the pivot: rot = amp * sin. */
  | { type: 'sway'; amp: number; period: number; phase?: number }
  /** Drifts: x/y offsets on a sine (x and y can differ in period for a lazy figure 8). */
  | { type: 'bob'; dx?: number; dy?: number; period: number; phase?: number; py?: number }
  /** Breathes: scale = 1 + amp * sin. */
  | { type: 'pulse'; amp: number; period: number; phase?: number }
  /** Wing beat: scaleY (or scaleX with axis x) dips to 1 - amp and back, eased at both ends. */
  | { type: 'flap'; amp: number; period: number; phase?: number; axis?: 'x' | 'y' }
  /** Turns all the way round, steadily. */
  | { type: 'spin'; period: number; phase?: number; dir?: 1 | -1 }
  /** Opacity between min and 1 on a sine. */
  | { type: 'glow'; min: number; period: number; phase?: number }
  /** A light in a chase: bright for a short slice of the period, otherwise min. */
  | { type: 'twinkle'; min: number; period: number; phase?: number; width?: number }
  /** Rides an ellipse; depth (-1 far .. 1 near) scales it. */
  | { type: 'orbit'; rx: number; ry: number; period: number; phase?: number; tilt?: number; depthScale?: number };

export type Pose = { x: number; y: number; rot: number; s: number; sx: number; sy: number; o: number };
export type Key = [number, Partial<Pose> & { hold?: boolean }];

export interface KitGroup {
  readonly id: string;
  readonly pivot: readonly [number, number];
  readonly loops?: readonly Loop[];
  readonly keys?: readonly Key[];
  /** How much of the loop keeps playing during the moment (0 stops it, 1 keeps it all). */
  readonly calm?: number;
  /**
   * A fixed squash applied after the children's own motion: a propeller drawn from above spins in
   * its own plane, and the group flattens that plane into the 3/4 view (sx, sy).
   */
  readonly squash?: readonly [number, number];
}

export type KitLayer = 'back' | 'front' | 'scene' | 'scenefront';

export interface KitPart {
  readonly id: string;
  readonly src: string;
  readonly layer: KitLayer;
  readonly group?: string;
  readonly cx: number; readonly cy: number; readonly w: number;
  readonly ax?: number; readonly ay?: number; readonly rot?: number; readonly aspect: number;
  readonly loops?: readonly Loop[];
  readonly keys?: readonly Key[];
  readonly calm?: number;
  /** Base opacity (glows). */
  readonly o?: number;
  readonly tint?: string;
  /** Lowest LOD that draws it: 'lite' draws on tiles too; 'full' on stages only. Default lite. */
  readonly lod?: 'lite' | 'full';
  /** Hidden outside the moment (a gift that peeks, a chick that hatches). */
  readonly momentOnly?: boolean;
  /** Flip horizontally. */
  readonly flip?: boolean;
  /**
   * For a part on an orbit: drawn only on the near side (depth > 0, the front layer) or the far
   * side (depth <= 0, the back layer), so it passes behind the head and in front of it.
   */
  readonly depth?: 'near' | 'far';
}

export interface KitEmitter {
  readonly id: string;
  readonly src: string;
  readonly layer: KitLayer;
  readonly n: number;
  /** 'loop': a steady stream. 'moment': a burst inside the moment. */
  readonly mode: 'loop' | 'moment';
  readonly life: number;
  readonly from: readonly [number, number];
  /** The emitter rides this group's pose (a wand's loop, a mug's rim). */
  readonly follow?: string;
  /** Start velocity, paper fractions per second, plus a random spread per particle. */
  readonly vel: readonly [number, number];
  readonly spread?: readonly [number, number];
  /** Paper fractions per second squared (negative floats up). */
  readonly gravity?: number;
  /** Side-to-side wobble while it travels. */
  readonly wobble?: readonly [number, number];
  /** Size range, as a fraction of the paper width. */
  readonly size: readonly [number, number];
  readonly grow?: readonly [number, number];
  readonly spin?: number;
  /** Fade in and out, as fractions of the life. */
  readonly fade?: readonly [number, number];
  /** Moment mode: ms between particles, and where in the moment (0..1) the first leaves. */
  readonly stagger?: number;
  readonly startP?: number;
  readonly tint?: string;
  readonly o?: number;
  readonly lod?: 'lite' | 'full';
}

export interface KitItem {
  readonly slot: 'neck_item' | 'hand_item' | 'head_item' | 'face_item' | 'background_item';
  readonly blurb: string;
  readonly moment: { readonly cue: string; readonly period: number; readonly length: number; readonly jitter?: number; readonly firstAt?: number };
  /** Reduce Motion pose: the moment frozen at this point (or -1 for the loop's rest). */
  readonly stillP: number;
  readonly focus: { readonly cx: number; readonly cy: number; readonly span: number };
  readonly groups?: readonly KitGroup[];
  readonly parts: readonly KitPart[];
  readonly emitters?: readonly KitEmitter[];
  /** The piece moves the shark: a gentle lift (paper-height fraction) and a rock (degrees) in the moment. */
  readonly shark?: { readonly keys: readonly Key[] };
}

export const KIT: Record<string, KitItem> = (KIT_DATA as unknown as { items: Record<string, KitItem> }).items;

export const IDENTITY: Pose = { x: 0, y: 0, rot: 0, s: 1, sx: 1, sy: 1, o: 1 };

const CHANNELS = ['x', 'y', 'rot', 's', 'sx', 'sy', 'o'] as const;

/** 0..1 eased with zero velocity and acceleration at both ends (smootherstep). */
export function smoother(k: number): number {
  'worklet';
  const x = Math.min(1, Math.max(0, k));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** How far into a moment the loop should stay (calm: 1 keeps all of it): eased out and back in. */
export function calmWeight(p: number, calm: number): number {
  'worklet';
  if (p < 0) return 1;
  const env = p < 0.2 ? smoother(p / 0.2) : p > 0.8 ? smoother((1 - p) / 0.2) : 1;
  return 1 - (1 - calm) * env;
}

/**
 * One channel of a key track at p (0..1): keys implied at 0 and 1 hold the rest value. Between
 * keys it is a cubic Hermite with Catmull-Rom tangents (smooth through a key), and zero tangent
 * at the ends and at `hold` keys (the pose settles there). So a moment eases out of rest and back
 * in with no jolt: speed is continuous everywhere.
 */
export function trackAt(keys: readonly Key[], ch: (typeof CHANNELS)[number], p: number, rest: number): number {
  'worklet';
  const P: number[] = [0];
  const V: number[] = [rest];
  const H: boolean[] = [true];
  for (let i = 0; i < keys.length; i++) {
    const v = keys[i][1][ch];
    P.push(keys[i][0]);
    V.push(v === undefined ? rest : v);
    H.push(!!keys[i][1].hold);
  }
  // A key at p 1 sets where the track lands (a spin that ends one full turn on, which looks the same
  // as rest); otherwise every track lands back on rest.
  if (P[P.length - 1] < 1) { P.push(1); V.push(rest); H.push(true); } else H[H.length - 1] = true;
  const n = P.length;
  if (p <= 0 || p >= 1) return rest;
  let i = 0;
  while (i < n - 2 && p >= P[i + 1]) i++;
  const span = P[i + 1] - P[i];
  if (span <= 0) return V[i + 1];
  const tan = (k: number) => (H[k] || k === 0 || k === n - 1 ? 0 : (V[k + 1] - V[k - 1]) / (P[k + 1] - P[k - 1]));
  const u = (p - P[i]) / span;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * V[i] + (u3 - 2 * u2 + u) * span * tan(i) + (-2 * u3 + 3 * u2) * V[i + 1] + (u3 - u2) * span * tan(i + 1);
}

function wave(t: number, period: number, phase: number | undefined): number {
  'worklet';
  return Math.sin(((t / period) + (phase ?? 0)) * Math.PI * 2);
}

/** The looping pose of a set of loops at time t (still: t is held at 0 by the caller). */
export function loopPose(loops: readonly Loop[] | undefined, t: number): Pose & { depth: number } {
  'worklet';
  const out = { x: 0, y: 0, rot: 0, s: 1, sx: 1, sy: 1, o: 1, depth: 0 };
  if (!loops) return out;
  for (let i = 0; i < loops.length; i++) {
    const l = loops[i];
    if (l.type === 'sway') out.rot += l.amp * wave(t, l.period, l.phase);
    else if (l.type === 'bob') {
      out.x += (l.dx ?? 0) * wave(t, l.period, l.phase);
      out.y += (l.dy ?? 0) * wave(t, l.py ?? l.period, l.phase);
    } else if (l.type === 'pulse') out.s *= 1 + l.amp * wave(t, l.period, l.phase);
    else if (l.type === 'flap') {
      // 0..1..0 per beat, eased (cosine), so the wing never snaps at the top or bottom.
      const k = 0.5 - 0.5 * Math.cos(((t / l.period) + (l.phase ?? 0)) * Math.PI * 2);
      if (l.axis === 'x') out.sx *= 1 - l.amp * k; else out.sy *= 1 - l.amp * k;
    } else if (l.type === 'spin') {
      const f = ((t / l.period) + (l.phase ?? 0)) % 1;
      out.rot += (l.dir ?? 1) * 360 * (f < 0 ? f + 1 : f);
    } else if (l.type === 'glow') out.o *= l.min + (1 - l.min) * (0.5 + 0.5 * wave(t, l.period, l.phase));
    else if (l.type === 'twinkle') {
      const f0 = ((t / l.period) + (l.phase ?? 0)) % 1;
      const f = f0 < 0 ? f0 + 1 : f0;
      const w = l.width ?? 0.25;
      const on = f < w ? Math.sin((f / w) * Math.PI) : 0;
      out.o *= l.min + (1 - l.min) * on;
    } else if (l.type === 'orbit') {
      const a = ((t / l.period) + (l.phase ?? 0)) * Math.PI * 2;
      const tilt = ((l.tilt ?? 0) * Math.PI) / 180;
      const ex = l.rx * Math.cos(a);
      const ey = l.ry * Math.sin(a);
      out.x += ex * Math.cos(tilt) - ey * Math.sin(tilt);
      out.y += ex * Math.sin(tilt) + ey * Math.cos(tilt);
      out.depth = Math.sin(a);
      out.s *= 1 + (l.depthScale ?? 0) * out.depth;
    }
  }
  return out;
}

/** The moment's progress for an item: -1 idle, else 0..1 (and the cycle, -1 for a tap). */
export function kitMoment(item: KitItem, t: number, kick: number): { p: number; cycle: number } {
  'worklet';
  const m = item.moment;
  return momentAt(t, kick, m.period, m.length, m.firstAt ?? 350, m.jitter ?? 0.25);
}

/**
 * A loop pose blended with a moment track: loops scaled by `calm` in the moment, keys added on top.
 * `oRest` is the opacity a track rests at: 0 for a part that only shows in its moment (it fades in
 * and out on its keys).
 */
export function posedAt(loops: readonly Loop[] | undefined, keys: readonly Key[] | undefined, calm: number, t: number, p: number,
  oRest = 1): Pose & { depth: number } {
  'worklet';
  const lp = loopPose(loops, t);
  const w = calmWeight(p, calm);
  const out = {
    x: lp.x * w, y: lp.y * w, rot: lp.rot * w,
    s: 1 + (lp.s - 1) * w, sx: 1 + (lp.sx - 1) * w, sy: 1 + (lp.sy - 1) * w, o: lp.o, depth: lp.depth,
  };
  if (keys && keys.length && p >= 0) {
    out.x += trackAt(keys, 'x', p, 0);
    out.y += trackAt(keys, 'y', p, 0);
    out.rot += trackAt(keys, 'rot', p, 0);
    out.s *= trackAt(keys, 's', p, 1);
    out.sx *= trackAt(keys, 'sx', p, 1);
    out.sy *= trackAt(keys, 'sy', p, 1);
    out.o *= trackAt(keys, 'o', p, oRest);
  }
  return out;
}

/** The clock and moment a pose is sampled at: still freezes the moment at stillP (or rest) with t at 0. */
export function sampleAt(item: KitItem, t: number, kick: number, still: boolean): { t: number; p: number; cycle: number } {
  'worklet';
  if (still) return { t: 0, p: item.stillP, cycle: 0 };
  const m = kitMoment(item, t, kick);
  return { t, p: m.p, cycle: m.cycle };
}

/** A group's pose (its parts ride it). */
export function groupPose(item: KitItem, gid: string, t: number, p: number): Pose & { depth: number } {
  'worklet';
  const groups = item.groups ?? [];
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].id === gid) return posedAt(groups[i].loops, groups[i].keys, groups[i].calm ?? 1, t, p);
  }
  return { ...IDENTITY, depth: 0 };
}

/** Where a point of the paper lands after a group's pose (for emitters that follow a group). */
export function followPoint(item: KitItem, gid: string | undefined, x: number, y: number, t: number, p: number, aspectHW: number):
  { x: number; y: number } {
  'worklet';
  if (!gid) return { x, y };
  const groups = item.groups ?? [];
  let g: KitGroup | null = null;
  for (let i = 0; i < groups.length; i++) if (groups[i].id === gid) g = groups[i];
  if (!g) return { x, y };
  const pose = posedAt(g.loops, g.keys, g.calm ?? 1, t, p);
  // Rotate about the pivot in true pixels (paper height is aspectHW times its width).
  const r = (pose.rot * Math.PI) / 180;
  const dx = (x - g.pivot[0]) * pose.s;
  const dy = (y - g.pivot[1]) * aspectHW * pose.s;
  return {
    x: g.pivot[0] + dx * Math.cos(r) - dy * Math.sin(r) + pose.x,
    y: g.pivot[1] + (dx * Math.sin(r) + dy * Math.cos(r)) / aspectHW + pose.y,
  };
}

/**
 * One particle of an emitter: where it is (paper fractions), its size multiplier, rotation and
 * opacity; o 0 when it is not alive. Loop emitters keep a steady stream (each particle restarts
 * every life, with a seeded spread per pass); moment emitters throw one burst per moment.
 */
export function particleAt(item: KitItem, e: KitEmitter, i: number, t: number, p: number, aspectHW: number):
  { x: number; y: number; s: number; rot: number; o: number } {
  'worklet';
  let age = -1;
  let pass = 0;
  if (e.mode === 'loop') {
    const off = t + (i / e.n) * e.life;
    pass = Math.floor(off / e.life);
    age = off - pass * e.life;
    if (t < 0) age = -1;
  } else if (p >= 0) {
    const mMs = item.moment.period * item.moment.length;
    age = (p - (e.startP ?? 0)) * mMs - i * (e.stagger ?? 0);
    pass = i;
    if (age >= e.life) age = -1;
  }
  if (age < 0) return { x: 0, y: 0, s: 0, rot: 0, o: 0 };
  const k = age / e.life;
  const r1 = hash01(pass * 31 + i * 7 + 1);
  const r2 = hash01(pass * 17 + i * 13 + 5);
  const r3 = hash01(pass * 11 + i * 3 + 9);
  const sec = age / 1000;
  // The origin rides its group as the particle leaves, so a stream starts at the wand, not where it was.
  const o0 = followPoint(item, e.follow, e.from[0], e.from[1], t - age, e.mode === 'moment' ? Math.max(0, p - age / (item.moment.period * item.moment.length)) : -1, aspectHW);
  const vx = e.vel[0] + (r1 - 0.5) * 2 * (e.spread?.[0] ?? 0);
  const vy = e.vel[1] + (r2 - 0.5) * 2 * (e.spread?.[1] ?? 0);
  const wob = e.wobble ? e.wobble[0] * Math.sin((age / e.wobble[1] + r3) * Math.PI * 2) : 0;
  const fin = e.fade?.[0] ?? 0.15;
  const fout = e.fade?.[1] ?? 0.3;
  const o = (k < fin ? smoother(k / fin) : k > 1 - fout ? smoother((1 - k) / fout) : 1) * (e.o ?? 1);
  const g0 = e.grow?.[0] ?? 1;
  const g1 = e.grow?.[1] ?? 1;
  return {
    x: o0.x + vx * sec + wob,
    y: o0.y + vy * sec + 0.5 * (e.gravity ?? 0) * sec * sec,
    s: (e.size[0] + (e.size[1] - e.size[0]) * r3) * (g0 + (g1 - g0) * k),
    rot: (e.spin ?? 0) * sec * (r1 < 0.5 ? -1 : 1),
    o,
  };
}

/** The shark's own move for a worn kit piece: a lift (paper-height fraction, negative is up) and a rock. */
export function kitSharkMove(item: KitItem | undefined, t: number, kick: number): { y: number; rot: number } {
  'worklet';
  if (!item?.shark) return { y: 0, rot: 0 };
  const m = kitMoment(item, t, kick);
  if (m.p < 0) return { y: 0, rot: 0 };
  return { y: trackAt(item.shark.keys, 'y', m.p, 0), rot: trackAt(item.shark.keys, 'rot', m.p, 0) };
}

/** The kit keys this build ships (registry merges them into FX_KEYS). */
export const KIT_KEYS = Object.keys(KIT);

/** Which layers a kit item draws. */
export function kitSides(item: KitItem): ('back' | 'front' | 'scene')[] {
  const sides = new Set<'back' | 'front' | 'scene'>();
  for (const part of [...item.parts, ...(item.emitters ?? [])]) {
    if (part.layer === 'scene' || part.layer === 'scenefront') sides.add('scene');
    else sides.add(part.layer);
  }
  return [...sides];
}

/**
 * True while any worn kit piece is in its moment. A tap then waits (Playercard, the scene
 * backdrop): restarting a kit moment midway would snap its pose back to the start.
 */
export function kitBusy(items: readonly (KitItem | undefined)[], t: number, kick: number): boolean {
  'worklet';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && kitMoment(item, t, kick).p >= 0) return true;
  }
  return false;
}
