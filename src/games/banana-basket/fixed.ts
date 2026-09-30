/**
 * Integer helpers for the deterministic sim (shared with proof.ts and the
 * server port). Gameplay code uses only + - * floorDiv, abs, min, max and
 * table lookups: no sqrt, pow, trig or float literals.
 */

/** floor(a / b) for integers, b > 0. The PHP port defines the same. */
export function floorDiv(a: number, b: number): number {
  'worklet';
  return Math.floor(a / b);
}

export function clampInt(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

export function absInt(v: number): number {
  'worklet';
  return v < 0 ? -v : v;
}

export function signInt(v: number): number {
  'worklet';
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** mulberry32 over a mutable { s } state; uint32 math via Math.imul. */
export interface BRng {
  s: number;
}

export function rngNext(r: BRng): number {
  'worklet';
  r.s = (r.s + 0x6d2b79f5) | 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Uniform integer in [0, n). */
export function rngBelow(r: BRng, n: number): number {
  'worklet';
  return n <= 1 ? 0 : rngNext(r) % n;
}

/** Uniform integer in [lo, hi]. */
export function rngRange(r: BRng, lo: number, hi: number): number {
  'worklet';
  return lo + rngBelow(r, hi - lo + 1);
}

/** Pick an index by integer weights. */
export function rngWeighted(r: BRng, weights: readonly number[]): number {
  'worklet';
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return 0;
  let roll = rngBelow(r, total);
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]) return i;
    roll -= weights[i];
  }
  return weights.length - 1;
}

/** Seed mixer (murmur3 finaliser), identical in PHP with masked 32-bit ops. */
export function mixSeed(a: number, b: number): number {
  'worklet';
  let h = (a ^ Math.imul(b >>> 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// -- zigzag varints (proof input encoding) -------------------------------------

export function zigzag(n: number): number {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}

export function unzigzag(z: number): number {
  return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
}

export function writeVarint(out: number[], v: number): void {
  let n = v;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

export function readVarint(bytes: ArrayLike<number>, pos: { i: number }): number {
  let result = 0;
  let mul = 1;
  for (;;) {
    if (pos.i >= bytes.length) throw new Error('varint: truncated');
    const b = bytes[pos.i++];
    result += (b & 0x7f) * mul;
    if (b < 0x80) return result;
    mul *= 128;
    if (mul > 2 ** 35) throw new Error('varint: too long');
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function base64ToBytes(text: string): number[] {
  const clean = text.replace(/[^A-Za-z0-9+/=]/g, '');
  if (clean.length % 4 !== 0) throw new Error('base64: bad length');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (clean[i + k] === '=' ? 0 : B64.indexOf(clean[i + k])));
    if (v.some((x) => x < 0)) throw new Error('base64: bad char');
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    out.push((n >> 16) & 255);
    if (clean[i + 2] !== '=') out.push((n >> 8) & 255);
    if (clean[i + 3] !== '=') out.push(n & 255);
  }
  return out;
}
