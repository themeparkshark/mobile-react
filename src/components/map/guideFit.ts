/**
 * T018 (fix pass w4): the follow camera fits the shark and the guide's coin together. The camera keeps the shark
 * in the middle, so the coin is on screen when its distance is inside the circle the map shows clear of the guide
 * card above and PLAY! below. A coin within FIT_MAX_METERS that the player's zoom would leave off frame zooms the
 * camera out just enough; a farther one keeps the player's zoom and the edge arrow points the way.
 * Pure, unit tested in tools/tests/fix-w4-home.test.cjs.
 */
export const FIT_MAX_METERS = 150;
/** Room kept for the guide card above the shark and PLAY! below it (points from each edge). */
export const FIT_TOP_BOTTOM = 150;
export const FIT_SIDE = 28;
/** Never farther out than this (the islands stay readable). */
export const FIT_MIN_ZOOM = 15.5;
const EARTH = 40075016.686;
/** MapLibre's world is 512 points wide at zoom 0. */
const WORLD_POINTS = 512;

/** The clear radius around the map's center, in points. */
export function fitRadius(view: { readonly width: number; readonly height: number }): number {
  return Math.max(40, Math.min(view.width / 2 - FIT_SIDE, view.height / 2 - FIT_TOP_BOTTOM));
}

/** The highest zoom that shows a point `meters` from the center inside `radius` points, at this latitude. */
export function zoomToShow(meters: number, latitude: number, radius: number): number {
  const m = Math.max(1, meters);
  return Math.log2((EARTH * Math.cos((latitude * Math.PI) / 180) * radius) / (WORLD_POINTS * m));
}

/** The follow zoom with the guide's coin in frame: the player's own zoom, or just enough out to show the coin. */
export function guideFitZoom(input: { readonly meters: number | null; readonly latitude: number;
  readonly view: { readonly width: number; readonly height: number } | null; readonly followZoom: number }): number {
  const { meters, latitude, view, followZoom } = input;
  if (meters == null || !Number.isFinite(meters) || meters > FIT_MAX_METERS || !view || view.width <= 0 || view.height <= 0) return followZoom;
  const fit = zoomToShow(meters, latitude, fitRadius(view));
  if (!Number.isFinite(fit)) return followZoom;
  return Math.min(followZoom, Math.max(FIT_MIN_ZOOM, fit));
}

/** Meters between two points (haversine). */
export function fitMeters(a: { readonly latitude: number; readonly longitude: number }, b: { readonly latitude: number; readonly longitude: number }): number {
  const r = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Re-fit only when the wanted zoom moved this much (GPS jitter never pumps the camera). */
export const FIT_STEP = 0.2;
