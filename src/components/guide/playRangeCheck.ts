/**
 * PLAY!'s range check (fix round w3, T009 and the safety panel's "PLAY! rises within 2 s").
 *
 * The map asks the server which coin the player stands at (GET /me/current-redeemable) on every GPS fix. It used
 * to ask for a brand new Highest-accuracy GPS reading first (seconds on a phone), and every newer fix threw the
 * older answer away. Walking up to a coin, each fix cancelled the last request before it answered, so PLAY! rose
 * 10 to 60 s after the card said "You're here", and an old "in range" answer lingered 45 m past the ride.
 *
 * Now the check uses the map's own watched position, runs one request at a time and never drops an answer: a fix
 * that lands while a request is out waits, and goes out the moment that answer is in (so each answer is at most one
 * request old). And an answer is only trusted while the player is still near its coin (playAnswerNear): every GPS
 * fix re-judges it, so PLAY! and "You're here" go down as soon as the player walks off.
 * No React here: plain functions, unit tested in tools/tests/fix-w3-guide.test.cjs.
 */

export interface RangePoint {
  readonly latitude: number;
  readonly longitude: number;
}

/** The server's redeem radius (config mobile.redeem_radius, 16 m) plus GPS wander before an answer counts as old. */
export const PLAY_ANSWER_SLACK_METERS = 14;
export const PLAY_ANSWER_RADIUS_METERS = 16;

function meters(a: RangePoint, b: RangePoint): number {
  const k = Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.hypot((b.latitude - a.latitude) * 111_320, (b.longitude - a.longitude) * 111_320 * k);
}

/**
 * Whether the server's in-range answer still holds at the player's position now. A coin answer (a ride, a sight, a
 * secret coin, a find) is trusted while the player is within the redeem radius plus slack of it; one with no usable
 * position, or no position for the player, is trusted as the server said.
 */
export function playAnswerNear(answer: { readonly model?: unknown } | null | undefined, here: RangePoint | null | undefined): boolean {
  if (!answer) return false;
  const model = answer.model as { latitude?: unknown; longitude?: unknown } | undefined;
  const lat = Number(model?.latitude), lng = Number(model?.longitude);
  if (!here || !Number.isFinite(here.latitude) || !Number.isFinite(here.longitude) || !Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  return meters(here, { latitude: lat, longitude: lng }) <= PLAY_ANSWER_RADIUS_METERS + PLAY_ANSWER_SLACK_METERS;
}

export interface RangeChecker<R> {
  /** A new fix (or new map data): ask now, or right after the request that is out. */
  request(point: RangePoint): void;
  /** The map changed park or player, or unmounted: answers still out are dropped. */
  cancel(): void;
  /** Tests: a request is out. */
  busy(): boolean;
}

/**
 * One request at a time, every answer kept, the latest fix always asked next. `apply` gets each answer in order with
 * the point it was asked for.
 */
export function createRangeChecker<R>(ask: (point: RangePoint) => Promise<R>, apply: (answer: R, point: RangePoint) => void,
  onError?: (point: RangePoint) => void): RangeChecker<R> {
  let out = false;
  let pending: RangePoint | null = null;
  let epoch = 0;
  const start = (point: RangePoint) => {
    out = true;
    const mine = epoch;
    let settled: Promise<unknown>;
    try {
      settled = Promise.resolve(ask(point)).then(answer => { if (mine === epoch) apply(answer, point); },
        () => { if (mine === epoch) onError?.(point); });
    } catch {
      settled = Promise.resolve();
      if (mine === epoch) onError?.(point);
    }
    void settled.then(() => {
      if (mine !== epoch) return;
      out = false;
      const next = pending;
      pending = null;
      if (next) start(next);
    });
  };
  return {
    request(point) {
      if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return;
      if (out) { pending = point; return; }
      start(point);
    },
    cancel() { epoch++; out = false; pending = null; },
    busy() { return out; },
  };
}

/** A tapped island stays selected until the player walks this far from where they tapped it (T001). */
export const SELECTION_WALK_METERS = 30;

/**
 * Whether an old island selection should clear (T001): the player walked SELECTION_WALK_METERS from where they tapped
 * it, or PLAY! just rose for another coin (the card now names that coin, so an old callout would only disagree).
 */
export function selectionStale(input: {
  readonly selectedTaskId: number | null;
  readonly selectedFrom: RangePoint | null;
  readonly here: RangePoint | null;
  /** PLAY! rose for this coin since the last check (null: no change). */
  readonly playRoseFor: number | null;
}): boolean {
  if (input.selectedTaskId == null) return false;
  if (input.playRoseFor != null && input.playRoseFor !== input.selectedTaskId) return true;
  if (!input.selectedFrom || !input.here) return false;
  return meters(input.selectedFrom, input.here) >= SELECTION_WALK_METERS;
}
