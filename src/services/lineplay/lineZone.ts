/**
 * The ride's line zone on the phone: the same circle the server checks before it opens a timed wait
 * (LinePlaySessionController::isNearRide: the ride's radius, at least 50 m, plus a 75 m buffer, at most 250 m).
 *
 * LinePlay uses it for honesty (T071): a wait is only ever claimed ("You waited 5 minutes", "Ride logged!",
 * "in line, all saved") when there is evidence the player stood in this ride's line, either the server's own
 * timed session or a fix inside this zone. Started from far away, LinePlay asks first and then plays as games only.
 * Pure: no React, no network.
 */

/** Great-circle metres (haversine), kept here so this module has no imports. */
function distanceMeters(a: { readonly latitude: number; readonly longitude: number },
  b: { readonly latitude: number; readonly longitude: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LineZone {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
}

/** Mirrors the server's buffer (config mobile.line_ride_radius_buffer_meters, default 75). */
export const LINE_ZONE_BUFFER_METERS = 75;
export const LINE_ZONE_MIN_METERS = 50;
export const LINE_ZONE_MAX_METERS = 250;

/** The zone for a catalog ride, or null when the catalog has no position for it. */
export function lineZoneFor(ride: { readonly lat?: number | string | null; readonly lng?: number | string | null;
  readonly radius?: number | null } | null | undefined): LineZone | null {
  if (!ride || ride.lat == null || ride.lng == null) return null;
  const latitude = Number(ride.lat);
  const longitude = Number(ride.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) return null;
  const radius = Number.isFinite(Number(ride.radius)) ? Number(ride.radius) : LINE_ZONE_MIN_METERS;
  return { latitude, longitude,
    radiusMeters: Math.min(LINE_ZONE_MAX_METERS, Math.max(LINE_ZONE_MIN_METERS, Math.round(radius)) + LINE_ZONE_BUFFER_METERS) };
}

/** Metres from the ride's point to the fix. */
export function metersToRide(sample: { readonly latitude: number; readonly longitude: number }, zone: LineZone): number {
  return distanceMeters(sample, zone);
}

/** Is this fix inside the ride's line zone? A fix with no position is never inside. */
export function insideLineZone(sample: { readonly latitude: number; readonly longitude: number } | null | undefined,
  zone: LineZone | null | undefined): boolean {
  if (!sample || !zone || !Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) return false;
  return metersToRide(sample, zone) <= zone.radiusMeters;
}

/**
 * Starting LinePlay from here: null when the player is in the line zone or we cannot tell (no fix, no zone),
 * else how far away they are, rounded to a friendly 10 m step for "You're 250 m away".
 */
export function startAwayMeters(sample: { readonly latitude: number; readonly longitude: number } | null | undefined,
  zone: LineZone | null | undefined): number | null {
  if (!sample || !zone || !Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) return null;
  const meters = metersToRide(sample, zone);
  if (meters <= zone.radiusMeters) return null;
  return Math.max(10, Math.round(meters / 10) * 10);
}

/** The away question's words. */
export function startAwayCopy(meters: number): { title: string; message: string } {
  return {
    title: `You're ${meters} m away`,
    message: 'Your wait counts only in this ride’s line. Play the games anyway?',
  };
}

/**
 * Can this wait be claimed as a wait in this ride's line? Yes with the server's timed session or a fix inside the
 * zone. No when there is evidence the player was away: the server said "not near the ride", or a fix outside the
 * zone with none inside yet (started from afar, "Play anyway"). With no fix at all yet (GPS still answering) the wait
 * is not called untimed: offline first, the server still checks every Part.
 */
export function waitIsTimed(input: {
  readonly serverSessionId: string | null;
  readonly atLineSeen: boolean;
  readonly awaySeen: boolean;
  readonly serverSaidNotNear: boolean;
}): boolean {
  if (input.serverSessionId) return true;
  if (input.atLineSeen) return true;
  return !input.awaySeen && !input.serverSaidNotNear;
}
