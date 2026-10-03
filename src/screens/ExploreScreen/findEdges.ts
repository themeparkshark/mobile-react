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

/**
 * Overlapping finds collapse into one marker with a count ("×2"), never two NEW tags stacked: the
 * nearest find in a group leads and the rest hide. Finds whose spot sits within `clearTop` of the
 * map's top edge (under the header) keep their art but drop their chrome (pill, dot, badge, finger).
 */
export function clusterFinds(points: readonly { pivot: number; x: number; y: number; distance: number | null }[],
  radius = 44, clearTop = 24 + 34): { counts: Record<number, number>; hidden: number[]; chromeless: number[] } {
  const order = [...points].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.pivot - b.pivot);
  const counts: Record<number, number> = {};
  const hidden: number[] = [];
  const leaders: typeof order = [];
  for (const point of order) {
    const lead = leaders.find(l => Math.hypot(l.x - point.x, l.y - point.y) < radius);
    if (lead) { counts[lead.pivot] = (counts[lead.pivot] ?? 1) + 1; hidden.push(point.pivot); } else leaders.push(point);
  }
  const chromeless = leaders.filter(point => point.y < clearTop).map(point => point.pivot);
  return { counts, hidden, chromeless };
}
