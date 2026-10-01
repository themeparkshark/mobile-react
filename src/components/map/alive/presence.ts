/**
 * Player presence on the living map. Pure rules, unit tested:
 *  - the sparkle trail the walking shark leaves behind,
 *  - when entering a coin's range earns an arrival burst,
 *  - the arc a collected coin flies along to the shelf.
 */

export interface TrailPoint {
  readonly id: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly at: number;
}

/**
 * How long a sparkle stays. At follow zoom the shark covers ~30 m of ground, so
 * a trail has to linger for a stretch of walking to peek out behind it.
 */
export const TRAIL_LIFE_MS = 40_000;

export function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const k = Math.cos(((a.latitude + b.latitude) / 2) * (Math.PI / 180));
  return Math.hypot((a.latitude - b.latitude) * 111320, (a.longitude - b.longitude) * 111320 * k);
}

/**
 * Add the shark's newest position to its trail. A sparkle drops every few
 * metres of real walking; standing still (GPS wobble) adds nothing, and a GPS
 * jump clears the trail instead of drawing sparkles across the park.
 */
export function pushTrail(points: readonly TrailPoint[], next: { latitude: number; longitude: number }, now: number, {
  cap, minMeters = 5, maxJumpMeters = 60, lifeMs = TRAIL_LIFE_MS,
}: { cap: number; minMeters?: number; maxJumpMeters?: number; lifeMs?: number }): readonly TrailPoint[] {
  if (cap <= 0 || !Number.isFinite(next.latitude) || !Number.isFinite(next.longitude)) return points.length ? [] : points;
  const live = points.filter(point => now - point.at < lifeMs);
  const last = live[live.length - 1] ?? points[points.length - 1];
  if (last) {
    const moved = metersBetween(last, next);
    if (moved > maxJumpMeters) return [{ id: last.id + 1, latitude: next.latitude, longitude: next.longitude, at: now }];
    if (moved < minMeters) return live.length === points.length ? points : live;
  }
  const point = { id: (last?.id ?? 0) + 1, latitude: next.latitude, longitude: next.longitude, at: now };
  return [...live, point].slice(-cap);
}

/** One arrival burst per ride per stretch of play: GPS dipping in and out of range does not spam it. */
export const ARRIVAL_COOLDOWN_MS = 10 * 60_000;

export function arrivalBurstAllowed(lastBurstAt: number | undefined, now: number): boolean {
  return lastBurstAt === undefined || now - lastBurstAt >= ARRIVAL_COOLDOWN_MS;
}

export interface Point { readonly x: number; readonly y: number }

/**
 * Where the collected coin is at progress t (0..1) of its flight: a quadratic
 * arc that lifts above both ends, so it reads as tossed onto the shelf.
 */
export function flightPoint(from: Point, to: Point, t: number): Point {
  'worklet';
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = (from.x + to.x) / 2 + (to.x - from.x) * 0.15;
  const cy = Math.min(from.y, to.y) - Math.max(160, Math.abs(to.y - from.y) * 0.6, Math.abs(to.x - from.x) * 0.35);
  const a = (1 - k) * (1 - k);
  const b = 2 * (1 - k) * k;
  const c = k * k;
  return { x: a * from.x + b * cx + c * to.x, y: a * from.y + b * cy + c * to.y };
}
