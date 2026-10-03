/** Great-circle distance in metres (haversine). Pure. */
export function distanceMeters(a: { readonly latitude: number; readonly longitude: number },
  b: { readonly latitude: number; readonly longitude: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A location fix with its time on the server-corrected clock (ms). */
export interface FrightFixSample {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy: number | null;
  readonly at: number;
}
