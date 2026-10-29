/**
 * Where the off-screen target arrow sits: on an inset rectangle at the screen
 * edge, on the line from the view's centre toward the target, rotated to point
 * at it. null when the target is on screen.
 */
export function edgeArrow(point: { x: number; y: number }, size: { width: number; height: number },
  inset = { top: 250, right: 40, bottom: 190, left: 40 }): { x: number; y: number; angle: number } | null {
  const { width, height } = size;
  const minX = inset.left, maxX = width - inset.right, minY = inset.top, maxY = height - inset.bottom;
  if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) return null;
  const cx = width / 2, cy = (minY + maxY) / 2;
  const dx = point.x - cx, dy = point.y - cy;
  if (dx === 0 && dy === 0) return null;
  const tx = dx === 0 ? Infinity : (dx > 0 ? maxX - cx : minX - cx) / dx;
  const ty = dy === 0 ? Infinity : (dy > 0 ? maxY - cy : minY - cy) / dy;
  const t = Math.min(tx, ty);
  const x = cx + dx * t, y = cy + dy * t;
  // The target is on screen just past the inset edge (a short screen, a target 25 m away): the arrow
  // would sit on top of its island. The island itself is the guide then, so no arrow.
  const onScreen = point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
  if (onScreen && Math.hypot(point.x - x, point.y - y) < ARROW_CLEAR_OF_ISLAND) return null;
  return { x, y, angle: Math.atan2(dy, dx) * 180 / Math.PI };
}

/** How far (points) the edge arrow must sit from an on-screen target to show: an island and its arrow never overlap. */
export const ARROW_CLEAR_OF_ISLAND = 84;

/** A two-point dashed guide line from the player to the target. */
export function guideLine(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] } }] };
}

/** How long the dashed path stays after Find. */
export const GUIDE_PATH_MS = 4000;
