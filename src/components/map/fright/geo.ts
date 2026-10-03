/**
 * Small geo helpers for the Fin-ister Nights map layer. Pure, unit tested.
 */

export interface LatLng { readonly latitude: number; readonly longitude: number }

const EARTH_M = 6371e3;
const RAD = Math.PI / 180;
export const METERS_PER_DEG_LAT = 111_320;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const p1 = a.latitude * RAD;
  const p2 = b.latitude * RAD;
  const dp = (b.latitude - a.latitude) * RAD;
  const dl = (b.longitude - a.longitude) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return EARTH_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Initial bearing from a to b, degrees clockwise from north (0..360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const p1 = a.latitude * RAD;
  const p2 = b.latitude * RAD;
  const dl = (b.longitude - a.longitude) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

/** A point moved east and north by metres (small distances). */
export function offsetMeters(p: LatLng, east: number, north: number): LatLng {
  return {
    latitude: p.latitude + north / METERS_PER_DEG_LAT,
    longitude: p.longitude + east / (METERS_PER_DEG_LAT * Math.cos(p.latitude * RAD)),
  };
}

/** Map points per metre at a zoom and latitude (MapLibre: 512-point world tiles). Same as Map.tsx. */
export function pointsPerMeter(zoom: number, latitude: number): number {
  const metersPerPoint = 40075016.686 * Math.cos(latitude * RAD) / (512 * 2 ** zoom);
  return metersPerPoint > 0 ? 1 / metersPerPoint : 0;
}

export function validPoint(p: { latitude: number; longitude: number } | null | undefined): p is LatLng {
  return !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}
