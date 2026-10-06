/**
 * Clock helpers shared by every rig, the kit and tests (split from registry.ts so kit.ts can use
 * them without an import cycle). registry.ts re-exports all of them.
 */

/** A stable 0..1 number for an integer (cycle jitter that captures can replay). */
export function hash01(n: number): number {
  'worklet';
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** No kick yet: far in the past. */
export const NO_KICK = -1e9;

/**
 * A rig's "moment" (boost, swing, beam, peek...): -1 when idle, else 0..1
 * through it. It fires `firstAt` ms after the stage starts, then once per
 * `period` with up to `jitter` of the period shifted per cycle (seeded, so a
 * capture replays exactly), and right away when the player taps (`kick` is
 * the clock time of the tap). `cycle` tells variants apart (-1 for a tap).
 */
export function momentAt(t: number, kick: number, period: number, length: number, firstAt = 350, jitter = 0.25):
  { p: number; cycle: number } {
  'worklet';
  const lengthMs = length * period;
  const sinceKick = t - kick;
  if (sinceKick >= 0 && sinceKick < lengthMs) return { p: sinceKick / lengthMs, cycle: -1 };
  // A kick due in the next 2 s (an equip or unlock beat) holds the timer, so no other piece's
  // moment lands just before it and two tricks never stack 0.4 s apart (game feel round 5).
  if (sinceKick < 0 && sinceKick > -2000) return { p: -1, cycle: 0 };
  // A tap re-phases the timer: the next automatic moment is a full period after the tap's moment
  // ends, so the piece never does its trick twice in a row (game feel round 4).
  const origin = sinceKick >= 0 ? Math.max(firstAt, kick + lengthMs + period) : firstAt;
  const local = t - origin;
  if (local < 0) return { p: -1, cycle: 0 };
  const cycle = Math.floor(local / period);
  const start = cycle === 0 ? 0 : hash01(cycle) * jitter * period;
  const d = local - cycle * period - start;
  if (d < 0 || d >= lengthMs) return { p: -1, cycle };
  return { p: d / lengthMs, cycle };
}

/** Phase helpers shared by rigs and tests: 0..1 inside a looping period. */
export function phaseOf(timeMs: number, periodMs: number, offset = 0): number {
  'worklet';
  const p = ((timeMs / periodMs) + offset) % 1;
  return p < 0 ? p + 1 : p;
}

/** 0 outside [start, start+length) of a 0..1 phase, else 0..1 progress through that window. */
export function windowOf(phase: number, start: number, length: number): number {
  'worklet';
  const d = phase - start;
  if (d < 0 || d >= length) return -1;
  return d / length;
}
