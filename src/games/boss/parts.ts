/**
 * Part-break physics and settle zones (design v7.1 6.2). Pure and worklet-safe.
 *
 * A broken part leaves the rig, bounces twice and settles as a decal, but only
 * in a settle zone outside the reach band: the left sand bar (x 0-18%,
 * y 40-50%) or the right wreck deck (x 82-100%, y 30-42%). The launch is
 * solved so the second bounce ends inside its zone; nothing ever rests over a
 * lane column (x 12-88%, y 52-70%), a target, the float, the HUD band or a
 * callout zone. Max 8 decals per round.
 */
import { bounceAt } from './rig/tentacle';

export const PART_G = 2200;
export const PART_E = 0.45;
export const PART_BOUNCES = 2;
export const MAX_DECALS = 8;

export interface Zone { x0: number; x1: number; y0: number; y1: number }

/** Settle zones as fractions of the arena (design 6.2). */
export const ZONE_SAND: Zone = { x0: 0, x1: 0.18, y0: 0.4, y1: 0.5 };
export const ZONE_DECK: Zone = { x0: 0.82, x1: 1, y0: 0.3, y1: 0.42 };
/** The reach band's lane columns: no decal may rest here. */
export const REACH_BAND: Zone = { x0: 0.12, x1: 0.88, y0: 0.52, y1: 0.7 };

export interface Launch { x: number; y: number; vx: number; vy: number; floor: number }
export interface Decal { x: number; y: number; zone: 0 | 1 }

/** Sum of the horizontal travel factors over the flight (x speed drops to 0.6x per bounce). */
export function restSpan(y0: number, vy: number, floor: number, g = PART_G, e = PART_E, bounces = PART_BOUNCES): number {
  'worklet';
  let y = y0;
  let uy = vy;
  let k = 1;
  let span = 0;
  for (let n = 0; n <= bounces; n++) {
    const disc = uy * uy + 2 * g * (floor - y);
    const th = disc > 0 ? (-uy + Math.sqrt(disc)) / g : 0;
    span += k * th;
    y = floor;
    uy = -(uy + g * th) * e;
    k *= 0.6;
  }
  return span;
}

/** A launch from (x, y) going up with vy that comes to rest at (tx, ty). */
export function aimLaunch(x: number, y: number, vy: number, tx: number, ty: number): Launch {
  'worklet';
  const span = restSpan(y, vy, ty);
  return { x, y, vx: span > 0 ? (tx - x) / span : 0, vy, floor: ty };
}

function zoneAt(z: Zone, W: number, H: number, u: number, v: number): { x: number; y: number } {
  'worklet';
  return { x: W * (z.x0 + (z.x1 - z.x0) * u), y: H * (z.y0 + (z.y1 - z.y0) * v) };
}

/**
 * Where part k of Break n rests. Break 1: the captain hat on the sand bar.
 * Break 3: six shell shards, alternating sand bar and wreck deck.
 */
export function settlePoint(W: number, H: number, n: number, k: number): Decal {
  'worklet';
  if (n === 1) {
    const p = zoneAt(ZONE_SAND, W, H, 0.5, 0.55);
    return { x: p.x, y: p.y, zone: 0 };
  }
  const left = k % 2 === 0;
  const i = Math.floor(k / 2);
  const p = zoneAt(left ? ZONE_SAND : ZONE_DECK, W, H, 0.22 + 0.28 * i, 0.3 + 0.2 * ((i + k) % 3));
  return { x: p.x, y: p.y, zone: left ? 0 : 1 };
}

/** Launch for part k of Break n from (x, y), aimed into its settle zone. */
export function partLaunchTo(W: number, H: number, n: number, k: number, x: number, y: number): Launch {
  'worklet';
  const d = settlePoint(W, H, n, k);
  const vy = n === 1 ? -840 : -560 - 60 * (k % 3);
  return aimLaunch(x, y, vy, d.x, d.y);
}

/** Position of a launched part t seconds after launch. */
export function partAt(l: Launch, t: number): { x: number; y: number; rest: boolean } {
  'worklet';
  const b = bounceAt(t, l.x, l.y, l.vx, l.vy, l.floor, PART_G, PART_E, PART_BOUNCES);
  return { x: b.x, y: b.y, rest: b.rest };
}

/** Time (ms) from launch until a part comes to rest. */
export function restMs(l: Launch): number {
  for (let ms = 0; ms < 4000; ms += 10) if (partAt(l, ms / 1000).rest) return ms;
  return 4000;
}

export function inZone(z: Zone, W: number, H: number, x: number, y: number, pad = 0): boolean {
  return x >= W * z.x0 - pad && x <= W * z.x1 + pad && y >= H * z.y0 - pad && y <= H * z.y1 + pad;
}
