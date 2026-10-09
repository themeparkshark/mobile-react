/**
 * The compass, cleaned up for the map. Pure, unit tested
 * (tools/tests/map-motion.test.cjs), modelled in motion/bin/model.cjs.
 *
 * An iPhone compass sends up to 30 readings a second, each a degree or two
 * off even when the phone is held still. Turned straight into map rotation
 * that is a constant wobble; smoothed hard it is a map that lags every turn.
 * This is a One Euro filter (Casiez et al., CHI 2012) on the unwrapped angle:
 * its cutoff rises with the turn speed, so a still phone is filtered hard and
 * a quick turn barely at all. On top, a small hold: while the phone is still,
 * the output stays put until the reading leaves a 3 degree window (then eases over), so a
 * held phone gives a map that does not move at all.
 *
 * Readings stop when the phone stops moving (iOS sends one only after a 1
 * degree change), so `tick` re-feeds the last reading between samples and
 * the output settles exactly on it instead of stopping short.
 */

/** Cutoff (Hz) for a still phone: low, so sensor noise is filtered out. */
export const HEADING_MIN_CUTOFF_HZ = 0.4;
/** How fast the cutoff rises with turn speed (Hz per degree a second). */
export const HEADING_BETA = 0.009;
/** Cutoff for the turn-speed estimate itself. */
export const HEADING_D_CUTOFF_HZ = 1.5;
/** While still, the output holds until the filtered heading leaves this window (degrees). */
export const HEADING_HOLD_DEG = 3;
/** A still phone that drifted past the hold window is eased back at this rate (degrees a second). */
export const HEADING_CREEP_DPS = 12;
/** Below this turn speed (degrees a second) the phone counts as still. */
export const HEADING_STILL_DPS = 16;

/** Shortest signed difference b - a, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  const d = (((b - a) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

export function normDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

const alpha = (cutoffHz: number, dtS: number) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz * dtS));

export interface HeadingFilter {
  /** Feed one compass reading (degrees) taken at `tMs`; returns the cleaned heading (0..360). */
  push(raw: number, tMs: number): number;
  /** No new reading: re-feed the last one at `tMs` so the output settles; null before any reading. */
  tick(tMs: number): number | null;
  /** The cleaned heading (0..360), or null before any reading. */
  value(): number | null;
  /** Turn speed estimate (degrees a second, signed). */
  speed(): number;
  /** True once the output has stopped moving (still and settled on the hold). */
  settled(): boolean;
  reset(): void;
}

export function createHeadingFilter(opts?: { minCutoff?: number; beta?: number; dCutoff?: number; hold?: number; still?: number }): HeadingFilter {
  const minCutoff = opts?.minCutoff ?? HEADING_MIN_CUTOFF_HZ;
  const beta = opts?.beta ?? HEADING_BETA;
  const dCutoff = opts?.dCutoff ?? HEADING_D_CUTOFF_HZ;
  const hold = opts?.hold ?? HEADING_HOLD_DEG;
  const still = opts?.still ?? HEADING_STILL_DPS;
  // Unwrapped angles (may run past 360), so the filter never swings the long way round.
  let rawU: number | null = null;
  let x = 0, dx = 0, t = 0, out = 0, lastOut = 0;
  // Turn speed of the filtered heading (smooth, unlike dx, which sees every bit of sensor noise).
  let vs = 0;
  let moving = false;
  // After a turn, the output keeps tracking this long (ms) so it lands on the reading, not short of it.
  let trackUntil = 0;

  const step = (u: number, tMs: number) => {
    const dt = Math.min(0.5, Math.max(0.005, (tMs - t) / 1000));
    t = tMs;
    const ad = alpha(dCutoff, dt);
    dx = ad * ((u - x) / dt) + (1 - ad) * dx;
    const a = alpha(minCutoff + beta * Math.abs(dx), dt);
    const xPrev = x;
    x = a * u + (1 - a) * x;
    vs = ad * ((x - xPrev) / dt) + (1 - ad) * vs;
    lastOut = out;
    if (Math.abs(vs) >= still) {
      // Turning: follow the filter exactly.
      out = x; moving = true; trackUntil = tMs + 350;
    } else if (moving) {
      // Just stopped: keep tracking a moment so the output lands on the reading, not short of it.
      out = x;
      if (tMs >= trackUntil) moving = false;
    } else {
      // Still: hold. A slow drift past the window (the phone really turned a little) creeps back in gently.
      const e = x - out;
      if (Math.abs(e) >= hold) out += Math.sign(e) * Math.min(Math.abs(e) - hold * 0.5, HEADING_CREEP_DPS * dt);
    }
    return normDeg(out);
  };

  return {
    push(raw, tMs) {
      if (!Number.isFinite(raw)) return rawU === null ? 0 : normDeg(out);
      if (rawU === null) { rawU = raw; x = raw; out = raw; lastOut = raw; dx = 0; vs = 0; t = tMs; return normDeg(raw); }
      rawU = rawU + angleDelta(normDeg(rawU), normDeg(raw));
      return step(rawU, tMs);
    },
    tick(tMs) {
      if (rawU === null) return null;
      if (tMs - t < 20) return normDeg(out);
      return step(rawU, tMs);
    },
    value() { return rawU === null ? null : normDeg(out); },
    speed() { return moving ? vs : 0; },
    settled() { return rawU !== null && !moving && Math.abs(out - lastOut) < 0.01; },
    reset() { rawU = null; x = 0; dx = 0; vs = 0; t = 0; out = 0; lastOut = 0; moving = false; trackUntil = 0; },
  };
}
