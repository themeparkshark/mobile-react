/**
 * Cleans the raw GPS stream before it moves the shark. Pure, unit tested
 * (tools/tests/position-filter.test.cjs).
 *
 * Phones report fixes that wander 5 to 60 m while you stand still (indoors,
 * between buildings, under a ride's roof) and now and then one that is far off.
 * Feeding those straight to the map made the shark jump around. Like Pokemon GO:
 *  - Outliers are dropped: fixes worse than POOR_ACCURACY_M once a good fix is
 *    known, and fixes that imply an impossible speed. Far-off fixes that keep
 *    agreeing (or the first fix after a long silence) mean the phone really
 *    moved, so the filter re-seats there; scattered glitches never do.
 *  - The rest go through a small Kalman filter (one variance, metres) that
 *    trusts each fix by its reported accuracy.
 *  - A dead zone keeps the shark still while you stand still: the published
 *    position changes only once the estimate moves past a radius that grows
 *    with the fix's uncertainty and shrinks when the phone says you are moving.
 */

export interface RawFix {
  readonly latitude: number;
  readonly longitude: number;
  /** Horizontal accuracy in metres (68% radius); null or negative when unknown. */
  readonly accuracy?: number | null;
  /** Speed in m/s reported by the OS; null or negative when unknown. */
  readonly speed?: number | null;
  /** Milliseconds since the epoch. */
  readonly timestamp: number;
}

export interface FilteredPosition {
  readonly latitude: number;
  readonly longitude: number;
}

export type FilterVerdict =
  | { readonly kind: 'publish'; readonly position: FilteredPosition; readonly reseated: boolean }
  | { readonly kind: 'hold' }
  | { readonly kind: 'reject'; readonly reason: 'invalid' | 'inaccurate' | 'speed' | 'stale' };

/** Above this a fix is too vague to move the shark once a better one is known. */
export const POOR_ACCURACY_M = 40;
/** Assumed accuracy when the OS does not report one. */
export const UNKNOWN_ACCURACY_M = 25;
/** Faster than any guest (a car on a park road included): the fix is a glitch. */
export const MAX_SPEED_MPS = 45;
/** This many far-off fixes in a row, all in one place: the phone really is somewhere else now. */
export const RESEAT_AFTER_REJECTS = 3;
/** How far apart (beyond their accuracy radii) those far-off fixes may be and still agree. */
export const AGREE_SLACK_M = 25;
/** No fix at all for this long (the background): take the next one, whatever it says. */
export const RESEAT_AFTER_MS = 20_000;
/** How fast the true position may drift between fixes (Kalman process noise, m/s). */
export const PROCESS_SPEED_MPS = 2.5;
/** Dead zone bounds, metres. */
export const DEAD_ZONE_MIN_M = 1;
export const DEAD_ZONE_MAX_M = 5;
/** The OS says you are walking at least this fast (m/s): use the small dead zone. */
export const MOVING_SPEED_MPS = 0.6;

/** Metres between two points (haversine). */
export function metersBetween(a: FilteredPosition, b: FilteredPosition): number {
  const R = 6371e3;
  const p1 = (a.latitude * Math.PI) / 180;
  const p2 = (b.latitude * Math.PI) / 180;
  const dp = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dl = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function accuracyOf(fix: RawFix): number {
  const a = fix.accuracy;
  return typeof a === 'number' && Number.isFinite(a) && a > 0 ? a : UNKNOWN_ACCURACY_M;
}

export class PositionFilter {
  private lat = 0;
  private lng = 0;
  /** Estimate variance, m². Negative means no estimate yet. */
  private variance = -1;
  private lastTimestamp = 0;
  private lastAcceptedAt = 0;
  /** Any fix at all, accepted or not: a real silence (background) versus a run of rejections. */
  private lastSeenAt = 0;
  /** After a silence: vague fixes waited out so far (the next good one, or the third, re-seats). */
  private afterSilence = -1;
  /** Vague fixes skipped in a row. */
  private vagueStreak = 0;
  /** Far-off fixes skipped in a row (latest last), to tell a real move from scattered glitches. */
  private far: { latitude: number; longitude: number; accuracy: number }[] = [];
  private published: FilteredPosition | null = null;

  /** The last position handed to the map, if any. */
  get current(): FilteredPosition | null {
    return this.published;
  }

  reset(): void {
    this.variance = -1;
    this.lastTimestamp = 0;
    this.lastAcceptedAt = 0;
    this.lastSeenAt = 0;
    this.afterSilence = -1;
    this.vagueStreak = 0;
    this.far = [];
    this.published = null;
  }

  push(fix: RawFix): FilterVerdict {
    if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude) ||
        Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180 ||
        (fix.latitude === 0 && fix.longitude === 0)) {
      return { kind: 'reject', reason: 'invalid' };
    }
    const accuracy = accuracyOf(fix);
    const now = Number.isFinite(fix.timestamp) ? fix.timestamp : this.lastTimestamp;

    if (this.variance < 0) return this.seat(fix, accuracy, now);
    if (now < this.lastTimestamp) return { kind: 'reject', reason: 'stale' };

    // Back after a real silence (the app was in the background): trust the new fix.
    // Back after a real silence (the app in the background, a ride roof, a tunnel):
    // re-seat on the first good fix. A vague one (over POOR_ACCURACY_M) is waited
    // out, so a 100 m guess never snaps the shark away and back; the third is taken anyway.
    if (now - this.lastSeenAt >= RESEAT_AFTER_MS) this.afterSilence = 0;
    this.lastSeenAt = now;
    if (this.afterSilence >= 0) {
      if (accuracy <= POOR_ACCURACY_M || this.afterSilence >= RESEAT_AFTER_REJECTS - 1) return this.seat(fix, accuracy, now);
      this.afterSilence += 1;
      return { kind: 'reject', reason: 'inaccurate' };
    }
    const estimate = { latitude: this.lat, longitude: this.lng };
    const jump = metersBetween(estimate, fix);
    const dt = Math.max(0.001, (now - this.lastTimestamp) / 1000);
    // The estimate grows less certain with time (the guest may have walked),
    // faster when the phone says it is moving, so a walk is not left behind.
    const speed = typeof fix.speed === 'number' && fix.speed > 0 ? Math.min(fix.speed, MAX_SPEED_MPS) : 0;
    const drift = PROCESS_SPEED_MPS + 2 * speed;
    const predicted = this.variance + dt * drift * drift;
    const spread = Math.sqrt(predicted);
    // Benefit of the doubt: both the estimate and the fix may be off by their radius.
    const impliedSpeed = Math.max(0, jump - accuracy - spread) / dt;

    if (impliedSpeed > MAX_SPEED_MPS) {
      // A glitch, unless it keeps happening in one place: then the phone really
      // is over there (out of the car). Scattered glitches never agree, so they
      // never move the shark.
      this.far = [...this.far.slice(1 - RESEAT_AFTER_REJECTS), { latitude: fix.latitude, longitude: fix.longitude, accuracy }];
      if (this.far.length >= RESEAT_AFTER_REJECTS && this.far.every(f =>
        metersBetween(f, fix) <= f.accuracy + accuracy + AGREE_SLACK_M)) {
        return this.seat(fix, accuracy, now);
      }
      return { kind: 'reject', reason: 'speed' };
    }
    if (accuracy > POOR_ACCURACY_M && accuracy > spread && this.vagueStreak < RESEAT_AFTER_REJECTS - 1 &&
        now - this.lastAcceptedAt < RESEAT_AFTER_MS) {
      // Vaguer than what we already know: skip it. A run of them (indoors) is
      // taken after all, lightly, by the Kalman gain below.
      this.vagueStreak += 1;
      return { kind: 'reject', reason: 'inaccurate' };
    }

    // Kalman step: take the fix in proportion to how much more certain it is.
    this.variance = predicted;
    const gain = this.variance / (this.variance + accuracy * accuracy);
    this.lat += gain * (fix.latitude - this.lat);
    this.lng += gain * (fix.longitude - this.lng);
    this.variance *= 1 - gain;
    this.lastTimestamp = now;
    this.lastAcceptedAt = now;
    this.vagueStreak = 0;
    this.far = [];

    const next = { latitude: this.lat, longitude: this.lng };
    const moving = speed >= MOVING_SPEED_MPS;
    const deadZone = moving
      ? DEAD_ZONE_MIN_M
      : Math.min(DEAD_ZONE_MAX_M, Math.max(2, 0.35 * accuracy));
    if (this.published && metersBetween(this.published, next) < deadZone) return { kind: 'hold' };
    this.published = next;
    return { kind: 'publish', position: next, reseated: false };
  }

  private seat(fix: RawFix, accuracy: number, now: number): FilterVerdict {
    this.lat = fix.latitude;
    this.lng = fix.longitude;
    this.variance = accuracy * accuracy;
    this.lastTimestamp = now;
    this.lastAcceptedAt = now;
    this.lastSeenAt = now;
    this.afterSilence = -1;
    this.vagueStreak = 0;
    this.far = [];
    const position = { latitude: fix.latitude, longitude: fix.longitude };
    this.published = position;
    return { kind: 'publish', position, reseated: true };
  }
}
