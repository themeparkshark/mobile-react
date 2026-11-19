/**
 * Outlined Shark type rules, as pure functions (tested in tools/tests/sticker-kit.test.cjs).
 *
 * React Native has no text stroke, so the round navy stroke is built from copies of the
 * words placed on a circle around the fill. Each navy copy also casts one hard text shadow
 * straight down, so the same copies draw the drop: K copies give the ring and the drop.
 */
import { STROKE } from './tokens';

export type Offset = { readonly x: number; readonly y: number };

/** Stroke width (pt outside the letters) for a size: none under 17 pt, never above 3. */
export function strokeFor(fontSize: number, asked?: number): number {
  if (fontSize < STROKE.minSize) return 0;
  const want = asked ?? (fontSize >= 24 ? STROKE.title : STROKE.button);
  return Math.max(0, Math.min(STROKE.max, want));
}

/** The hard drop under outlined type for a size. */
export function dropFor(fontSize: number, asked?: number): number {
  if (asked !== undefined) return Math.max(0, asked);
  return fontSize >= 24 ? STROKE.dropTitle : STROKE.drop;
}

const ringCache = new Map<string, readonly Offset[]>();

/** K points on a circle of radius r, starting at 3 o'clock, rounded to 0.01 pt. */
export function ring(radius: number, count: number): readonly Offset[] {
  const key = `${radius}:${count}`;
  const hit = ringCache.get(key);
  if (hit) return hit;
  const points: Offset[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    points.push({ x: Math.round(Math.cos(a) * radius * 100) / 100, y: Math.round(Math.sin(a) * radius * 100) / 100 });
  }
  const frozen = Object.freeze(points);
  ringCache.set(key, frozen);
  return frozen;
}

/**
 * How far a ring of `count` copies falls short of a true round stroke between two copies
 * (pt). Under about 0.1 pt nothing shows even at 3x.
 */
export function scallop(radius: number, count: number): number {
  return radius * (1 - Math.cos(Math.PI / count));
}

/** Copies the chosen technique draws for a stroke: 12 is the spike's pick (see PARTS.md). */
export const RING_COPIES = 12;

/** Copies per title for each candidate the spike measured (ring + drop + fill). */
export function nodeCount(technique: 'shadow' | 'copies', count: number): number {
  return technique === 'shadow' ? count + 1 : count + Math.ceil(count / 2) + 1;
}
