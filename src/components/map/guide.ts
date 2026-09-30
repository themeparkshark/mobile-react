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
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) * 180 / Math.PI };
}

/** A two-point dashed guide line from the player to the target. */
export function guideLine(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] } }] };
}

/** How long the dashed path stays after Find. */
export const GUIDE_PATH_MS = 4000;
