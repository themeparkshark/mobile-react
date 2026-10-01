/**
 * Screen-space layout for the home map's overlays, so they never sit on a
 * find: where the GRAB ZONE tag goes on the circle, which finds sit on the
 * circle's edge (and must not look grabbable), and whether the "Next park
 * trip" chip collapses or nudges off a find.
 *
 * All points are screen points. Find offsets are relative to the shark's
 * ground point (the grab zone's centre); rects are in one shared space.
 */

export interface Point { readonly x: number; readonly y: number }
export interface Rect { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/**
 * What a find marker draws around its map point (PrepItem: 62 pt circle with
 * its NEW badge and ring above, the distance / timer label below).
 */
export const FIND_MARKER_EXTENT = { left: 50, right: 50, top: 42, bottom: 66 } as const;
/** The find circle's radius, glow included. */
export const FIND_CIRCLE_RADIUS = 35;
/** The GRAB ZONE tag's box, centred on its spot on the circle. */
export const GRAB_TAG_SIZE = { width: 80, height: 22 } as const;

/**
 * Clockwise from the top of the screen. The top arc reads best and stays
 * clear of the find card at the bottom, so it is tried first; straight down
 * is the last resort.
 */
export const GRAB_TAG_ANGLES = [0, -35, 35, -70, 70, -110, 110, 180] as const;

export function findRect(at: Point): Rect {
  return { left: at.x - FIND_MARKER_EXTENT.left, right: at.x + FIND_MARKER_EXTENT.right,
    top: at.y - FIND_MARKER_EXTENT.top, bottom: at.y + FIND_MARKER_EXTENT.bottom };
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
}

/** The tag's centre for an angle, relative to the circle's centre. */
export function grabTagCenter(radius: number, angleDeg: number): Point {
  const a = angleDeg * Math.PI / 180;
  return { x: radius * Math.sin(a), y: -radius * Math.cos(a) };
}

function tagRect(radius: number, angleDeg: number): Rect {
  const c = grabTagCenter(radius, angleDeg);
  return { left: c.x - GRAB_TAG_SIZE.width / 2, right: c.x + GRAB_TAG_SIZE.width / 2,
    top: c.y - GRAB_TAG_SIZE.height / 2, bottom: c.y + GRAB_TAG_SIZE.height / 2 };
}

/**
 * The first angle where the GRAB ZONE tag clears every find marker. When
 * finds surround the whole circle, the angle that touches the fewest wins
 * (ties go to the earlier, more readable spot).
 */
export function pickGrabTagAngle(radius: number, finds: readonly Point[]): number {
  if (!(radius > 0) || finds.length === 0) return 0;
  const rects = finds.map(findRect);
  let best: number = GRAB_TAG_ANGLES[0];
  let bestHits = Infinity;
  for (const angle of GRAB_TAG_ANGLES) {
    const tag = tagRect(radius, angle);
    const hits = rects.filter(r => rectsOverlap(tag, r, 4)).length;
    if (hits === 0) return angle;
    if (hits < bestHits) { best = angle; bestHits = hits; }
  }
  return best;
}

/**
 * An out-of-range find whose circle touches the grab zone's edge. It reads
 * as "inside" at a glance, so it is drawn much dimmer than other far finds.
 */
export function findOnZoneEdge(distanceMeters: number | null | undefined, radiusMeters: number,
  pointsPerMeter: number): boolean {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || !(pointsPerMeter > 0)) return false;
  if (distanceMeters <= radiusMeters) return false;
  return (distanceMeters - radiusMeters) * pointsPerMeter < FIND_CIRCLE_RADIUS + 6;
}

export interface ChipPlacement {
  /** Coin only: the words fold away. */
  readonly collapsed: boolean;
  /** Extra points down, to clear a find the coin would still cover. */
  readonly nudge: number;
}

/** The farthest the chip slides down before it would crowd the map. */
export const CHIP_MAX_NUDGE = 140;

/**
 * The "Next park trip" chip never covers a find. When a find is under the
 * full chip it folds to its coin; if the coin still covers one, it slides
 * down just below the lowest find it touches, when that spot is clear.
 */
export function placeTripChip(fullChip: Rect | null, coinSize: number, finds: readonly Point[]): ChipPlacement {
  if (!fullChip || finds.length === 0) return { collapsed: false, nudge: 0 };
  const rects = finds.map(findRect);
  if (!rects.some(r => rectsOverlap(fullChip, r))) return { collapsed: false, nudge: 0 };
  const coin = (nudge: number): Rect => ({ left: fullChip.left, right: fullChip.left + coinSize,
    top: fullChip.top + nudge, bottom: fullChip.top + nudge + coinSize });
  let nudge = 0;
  // Each pass clears the finds the coin touches; a find under the new spot gets another pass.
  for (let pass = 0; pass < 4; pass += 1) {
    const hits = rects.filter(r => rectsOverlap(coin(nudge), r));
    if (hits.length === 0) return { collapsed: true, nudge };
    nudge = Math.max(...hits.map(r => r.bottom)) + 6 - fullChip.top;
    if (nudge > CHIP_MAX_NUDGE) break;
  }
  // No clear spot within reach: stay folded in the corner, the smallest cover.
  return { collapsed: true, nudge: 0 };
}

/** Same placement, same object: skips a re-render when nothing moved. */
export function samePlacement(a: ChipPlacement, b: ChipPlacement): boolean {
  return a.collapsed === b.collapsed && Math.abs(a.nudge - b.nudge) < 1;
}
