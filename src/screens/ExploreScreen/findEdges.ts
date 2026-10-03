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

/** Whether a find's map spot sits under the reward banner (its tags would poke through the cascade). */
export function bannerCovers(point: { x: number; y: number }, size: { width: number; height: number }, bottomSlot: number): boolean {
  const bannerBottom = size.height - bottomSlot;
  return Math.abs(point.x - size.width / 2) < 175 && point.y > bannerBottom - 110 && point.y < bannerBottom + 100;
}

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** What a find occupies on screen around its spot: its art and the tag under it (and a finger's width of slop). */
export function findFootprint(point: { x: number; y: number }, finger = false): Rect {
  // The pointing finger hovers about 66 pt above the find that has it.
  const top = finger ? 70 : 36;
  return { x: point.x - 42, y: point.y - top, w: 84, h: top + 56 };
}

/** The player's shark on screen (with its board): the peek never sits on it. */
export function sharkFootprint(point: { x: number; y: number }): Rect {
  return { x: point.x - 48, y: point.y - 56, w: 96, h: 100 };
}

/** Of the candidate rects, the first that covers no find (else the one covering the fewest). Returns its index. Pure. */
export function clearestSlot(candidates: readonly Rect[], finds: readonly Rect[]): number {
  let best = 0, bestHits = Infinity;
  candidates.forEach((rect, i) => {
    const n = finds.filter(find => hits(rect, find)).length;
    if (n < bestHits) { best = i; bestHits = n; }
  });
  return best;
}

/**
 * The top HUD row's top: at `rowTop` unless a find sits under it, then a row lower (up to 3 rows), so a chip
 * never covers a find and a tap there always reaches the find.
 */
export function hudRowTop(finds: readonly Rect[], rowTop: number, rowWidth: number, left = 12, rowH = 30): number {
  const tops = [0, 1, 2, 3].map(k => rowTop + k * (rowH + 8));
  return tops[clearestSlot(tops.map(top => ({ x: left, y: top, w: rowWidth, h: rowH })), finds)];
}

/**
 * The one-line peek's distance from the map's bottom: its usual dock, else the nearest slot (46 pt steps, down
 * to just above the tab bar's centre button and up to just under the HUD row at `topLimit`) that covers no
 * find, no edge token, not the shark and not the menu button, so never another find's leaving-soon timer.
 * Covering something is a last resort: then the fewest things, nearest the dock.
 */
export function peekBottom(finds: readonly Rect[], size: { width: number; height: number }, dock: number,
  topLimit = 0, peekW = 320, peekH = 36): number {
  const highest = size.height - topLimit - peekH, lowest = 56;
  const bottoms: number[] = [dock];
  for (let k = 1; k < 20; k++) for (const b of [dock - 46 * k, dock + 46 * k]) if (b >= lowest && b <= highest) bottoms.push(b);
  const fixed: Rect[] = [
    // The menu button (bottom left) and the tab bar's raised centre button.
    { x: 0, y: size.height - 160, w: 92, h: 70 },
    { x: size.width / 2 - 60, y: size.height - 56, w: 120, h: 56 },
  ];
  const rect = (bottom: number): Rect => ({ x: (size.width - peekW) / 2, y: size.height - bottom - peekH, w: peekW, h: peekH });
  return bottoms[clearestSlot(bottoms.map(rect), finds.concat(fixed))];
}
