/**
 * The coin-shelf landing beat sheet (ms), pure data so it is unit tested
 * (tools/tests/shelf-landing.test.cjs). Follows src/ui/motion.ts: the slot
 * glows (gather), the coin drops and lands (hit), the sparkles puff and the
 * neighbours jiggle (burst), the counter ticks (settle). The first coin of a
 * ride gets the full moment; a repeat drops straight in.
 */
export const SHELF_LANDING = {
  /** First coin of a ride: on screen at once, a short beat of anticipation (under 250 ms) while the slot glows, the clink by 0.65 s. */
  first: { dropAt: 180, dropMs: 460 },
  repeat: { dropAt: 100, dropMs: 400 },
  /** Two gold glows on the empty slot (320 ms each), both done by the landing. */
  pulseMs: 640,
  /** The coin holds on the landing frame this long before the slot coin squashes (hit-stop). */
  hitStopMs: 60,
  /** The sparkle puff and ring burst from the slot rim. */
  puffMs: 760,
  /** How far the sparkles fly, in slot widths. */
  puffReach: 1.8,
  /** The impact's flat gold ring runs this far along the plank on each side, in slot widths. */
  plankWaveReach: 2.6,
  sparkles: 12,
  /** Neighbours tip as the slot coin squashes, one after another outward. */
  jiggleAfterMs: 0,
  jiggleStepMs: 40,
  /** The two nearest neighbours tip this far and hop; the rest tip less. */
  jiggleDeg: 5,
  jiggleFarDeg: 3,
  hopPt: 4,
  /** The shelf plank kicks down this far under the landing coin and springs back. */
  kickPt: 2,
  /** A full row: a gold-and-white light bar sweeps across it. */
  shineAfterMs: 220,
  shineMs: 600,
  /** ...and each coin hops as the bar passes it, left to right, with a tick that climbs the coin ladder. */
  rowHopStepMs: 90,
  rowHopPt: 12,
  /** Each hop: up over rowHopUpMs (EASE.out), down over rowHopDownMs (EASE.in) with a little squash as it lands. */
  rowHopUpMs: 150,
  rowHopDownMs: 190,
  /** The plank glows gold for a beat, then the five-pip "row done" badge pops on its end. */
  plankGlowMs: 700,
  badgeAt: 900,
  /** About one landing in ten is shiny (a second ring, gold rays, a brighter chime). */
  shinyOneIn: 10,
} as const;

/** Whether a landing is the rare shiny one: fixed per landing (the same attempt never flips), about 1 in 10. */
export function shinyLanding(key: string | number | null | undefined): boolean {
  if (key === null || key === undefined) return false;
  const text = String(key);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % SHELF_LANDING.shinyOneIn === 0;
}

/** When coin `index` of a completed row hops (the light bar reaches it). */
export function rowHopDelay(index: number): number {
  return SHELF_LANDING.shineAfterMs + 60 + Math.max(0, index) * SHELF_LANDING.rowHopStepMs;
}

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
