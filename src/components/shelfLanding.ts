/**
 * The coin-shelf landing beat sheet (ms), pure data so it is unit tested
 * (tools/tests/shelf-landing.test.cjs). Follows src/ui/motion.ts: the slot
 * glows (gather), the coin drops and lands (hit), the sparkles puff and the
 * neighbours jiggle (burst), the counter ticks (settle). The first coin of a
 * ride gets the full moment; a repeat drops straight in.
 */
export const SHELF_LANDING = {
  first: { dropAt: 500, dropMs: 500 },
  repeat: { dropAt: 120, dropMs: 420 },
  /** Two gold glows on the empty slot (400 ms each). */
  pulseMs: 800,
  /** The sparkle puff and ring burst from the slot rim. */
  puffMs: 700,
  sparkles: 8,
  /** Neighbours jiggle after the landing, one after another outward. */
  jiggleAfterMs: 80,
  jiggleStepMs: 40,
  jiggleDeg: 2,
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
export function jiggleDirection(distance: number): -1 | 1 {
  return distance < 0 ? -1 : 1;
}

/** A row is complete when every slot in it is owned. */
export function rowComplete(rowIds: readonly number[], ownedIds: ReadonlySet<number>): boolean {
  return rowIds.length > 0 && rowIds.every(id => ownedIds.has(id));
}
