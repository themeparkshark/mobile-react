/**
 * Current Quest look (design 10.2): bright lagoon world, Alex's ink.
 * INK is measured from Alex's classic shark outline; navy is text only.
 */

export const CQ = {
  ink: '#2f2f3a',
  navy: '#09268f',
  water: '#3fc1ef',
  waterLight: '#8fe3fa',
  waterDeep: '#1f8fd1',
  current: '#6fd8f7',
  tidal: '#2fd3c0',
  sand: '#f6dfa1',
  wetSand: '#e9c98a',
  shoreline: '#d9b36e',
  rock: '#d9a86a',
  gold: '#fec90e',
  goldDeep: '#e0a800',
  coral: '#ff6b5c',
  white: '#ffffff',
  cream: '#fff8e4',
  sky: '#bfe9ff',
} as const;

/** Layout of the board canvas for a given available width. */
export interface BoardLayout {
  /** Canvas size. */
  readonly cw: number;
  readonly ch: number;
  /** Play area origin and cell size. */
  readonly ax: number;
  readonly ay: number;
  readonly cell: number;
  /** Sand rim thickness and its front face height. */
  readonly rim: number;
  readonly face: number;
  /** Play area size (5 cells). */
  readonly size: number;
}

export function boardLayout(availableWidth: number, maxHeight = Infinity): BoardLayout {
  const margin = 10;
  const rim = 10;
  let size = Math.min(availableWidth - 2 * (margin + rim) - 8, 360);
  const topPad = 0.34;
  const face = 12;
  // Fit height too (small phones): canvas height = top overlap + rims + face.
  const heightFor = (s: number) => (s / 5) * topPad + rim * 2 + s + face + margin * 2;
  while (heightFor(size) > maxHeight && size > 220) size -= 4;
  const cell = size / 5;
  const cw = size + 2 * (margin + rim);
  const ax = margin + rim;
  const ay = margin + rim + cell * topPad;
  const ch = ay + size + rim + face + margin;
  return { cw, ch, ax, ay, cell, rim, face, size };
}

export function cellCenter(l: BoardLayout, i: number): { x: number; y: number } {
  return { x: l.ax + ((i % 5) + 0.5) * l.cell, y: l.ay + (Math.floor(i / 5) + 0.5) * l.cell };
}
