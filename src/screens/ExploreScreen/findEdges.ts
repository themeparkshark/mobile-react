/**
 * Where an off-screen find's edge arrow sits: the point where the line from the
 * screen centre to the find leaves the safe box, and the arrow's angle
 * (degrees clockwise from up). Pure.
 */
export function edgeArrowPlacement(point: { x: number; y: number }, size: { width: number; height: number },
  inset: { top: number; bottom: number; side: number }): { x: number; y: number; angleDeg: number } {
  const cx = size.width / 2, cy = size.height / 2;
  const dx = point.x - cx, dy = point.y - cy;
  const left = inset.side, right = size.width - inset.side, top = inset.top, bottom = size.height - inset.bottom;
  let scale = Infinity;
  if (dx > 0) scale = Math.min(scale, (right - cx) / dx);
  if (dx < 0) scale = Math.min(scale, (left - cx) / dx);
  if (dy > 0) scale = Math.min(scale, (bottom - cy) / dy);
  if (dy < 0) scale = Math.min(scale, (top - cy) / dy);
  if (!Number.isFinite(scale)) scale = 0;
  const angleDeg = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
  return { x: cx + dx * scale, y: cy + dy * scale, angleDeg };
}
