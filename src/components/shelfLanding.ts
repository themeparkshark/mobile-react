/**
 * The coin-shelf landing beat sheet (ms), pure data so it is unit tested
 * (tools/tests/shelf-landing.test.cjs). Follows src/ui/motion.ts: the slot
 * glows (gather), the coin drops and lands (hit), the sparkles puff and the
 * neighbours jiggle (burst), the counter ticks (settle). The first coin of a
 * ride gets the full moment; a repeat drops straight in.
 */
export const SHELF_LANDING = {
  /** First coin of a ride: on screen at once, a short hover while the slot glows, the clink before 1 s. */
  first: { dropAt: 300, dropMs: 480 },
  repeat: { dropAt: 100, dropMs: 400 },
  /** Two gold glows on the empty slot (400 ms each). */
  pulseMs: 800,
  /** The coin holds on the landing frame this long before the slot coin squashes (hit-stop). */
  hitStopMs: 60,
  /** The sparkle puff and ring burst from the slot rim. */
  puffMs: 760,
  /** How far the sparkles fly, in slot widths. */
  puffReach: 1.8,
  sparkles: 10,
  /** Neighbours tip as the slot coin squashes, one after another outward. */
  jiggleAfterMs: 0,
  jiggleStepMs: 40,
  /** The two nearest neighbours tip this far and hop; the rest tip less. */
  jiggleDeg: 5,
  jiggleFarDeg: 3,
  hopPt: 4,
  /** The shelf plank kicks down this far under the landing coin and springs back. */
  kickPt: 2,
  /** A full row: a white shine sweeps across it. */
  shineAfterMs: 220,
  shineMs: 600,
} as const;

/** When a neighbour `distance` slots away starts its jiggle (0 is the landing coin itself: none). */
export function jiggleDelay(distance: number): number | null {
  const d = Math.abs(Math.round(distance));
  if (d === 0) return null;
  return SHELF_LANDING.jiggleAfterMs + (d - 1) * SHELF_LANDING.jiggleStepMs;
}

/** Which way a neighbour tips: away from the coin that just landed. */
/** How far a neighbour `distance` slots away tips (degrees) and hops (pt). */
export function jiggleAmount(distance: number): { readonly deg: number; readonly hop: number } {
  const d = Math.abs(Math.round(distance));
  if (d === 0) return { deg: 0, hop: 0 };
  return d === 1 ? { deg: SHELF_LANDING.jiggleDeg, hop: SHELF_LANDING.hopPt } : { deg: SHELF_LANDING.jiggleFarDeg, hop: SHELF_LANDING.hopPt / 2 };
}

export function jiggleDirection(distance: number): -1 | 1 {
  return distance < 0 ? -1 : 1;
}

/** A row is complete when every slot in it is owned. */
export function rowComplete(rowIds: readonly number[], ownedIds: ReadonlySet<number>): boolean {
  return rowIds.length > 0 && rowIds.every(id => ownedIds.has(id));
}
