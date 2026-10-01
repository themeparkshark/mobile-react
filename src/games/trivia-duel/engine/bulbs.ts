/**
 * Bulb ticker geometry and rules (design 11.4, rev 7). Pure and
 * worklet-safe: BulbBorder draws from these, tests pin them.
 */

export const BULB_COUNT = 24;
const TOP = 7;
const SIDE = 5;

export interface BulbPos { x: number; y: number }

/** Clockwise from the top-left: top L->R, right T->B, bottom R->L, left B->T. Pure (tested). */
export function bulbPositions(w: number, h: number, inset: number): BulbPos[] {
  const out: BulbPos[] = [];
  const l = inset;
  const r = w - inset;
  const t = inset;
  const b = h - inset;
  for (let i = 0; i < TOP; i++) out.push({ x: l + ((r - l) * i) / (TOP - 1), y: t });
  for (let i = 1; i <= SIDE; i++) out.push({ x: r, y: t + ((b - t) * i) / (SIDE + 1) });
  for (let i = TOP - 1; i >= 0; i--) out.push({ x: l + ((r - l) * i) / (TOP - 1), y: b });
  for (let i = SIDE; i >= 1; i--) out.push({ x: l, y: t + ((b - t) * i) / (SIDE + 1) });
  return out;
}

/** lit = ceil(24 x speed / 100); speed < 0 means the ring is off (face-down). */
export function litCount(speed: number): number {
  'worklet';
  if (speed <= 0) return 0;
  return Math.min(BULB_COUNT, Math.ceil((BULB_COUNT * speed) / 100));
}

/** Tier colour of a lit bulb: speed only, never streak. */
export function bulbColor(speed: number): string {
  'worklet';
  return speed >= 70 ? '#fec90e' : speed >= 35 ? '#00a5f5' : '#ffffff';
}

