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
  /** Results and stake card cream (J11). */
  card: '#fff6df',
  /** Tide palette (8.2, Alto): HIGH deep and saturated, LOW pale shallow turquoise. */
  waterHigh: '#2fb6ec',
  waterHighCaustic: '#7fdaf7',
  waterLow: '#5fd0f0',
  waterLowCaustic: '#a8ecfb',
  sky: '#bfe9ff',
} as const;

/** Layout of the board canvas for a given available width and board height. */
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
  /** Play area width (5 cells) and height (rows cells). */
  readonly pw: number;
  readonly ph: number;
  /** Rows on this board (5, 6 or 7). */
  readonly rows: number;
  /** Legacy alias of pw (square boards). */
  readonly size: number;
}

/**
 * Cell = min((width - margins) / 5, availableHeight / rows, 76) (design 10.2).
 * On a 375 pt phone a 5x7 Treasure board lands at about 64 to 68 pt cells and
 * never goes under 60 pt when the height allows; the rim and margins shrink
 * first on small screens.
 */
export function boardLayout(availableWidth: number, maxHeight = Infinity, rows = 5, tight = false): BoardLayout {
  // v7.1 J2: 14 pt side gutters (margin 2 + rim 12), so a 5x7 board spans about 92% of a 375 pt screen.
  const margin = tight ? 2 : availableWidth < 360 ? 6 : 10;
  const rim = tight ? 12 : availableWidth < 360 ? 8 : 10;
  // Room above row 0 for upright overhang (coral 0.28 cell, the standing shark 0.36 cell, minus the 14 pt rim).
  const topPad = tight ? 0.14 : 0.34;
  const face = 12;
  const chrome = (cell: number) => cell * topPad + rim * 2 + face + margin * 2;
  let cell = Math.min((availableWidth - 2 * (margin + rim) - (tight ? 0 : 4)) / 5, 76);
  // Fit height too: canvas height = top overlap + rims + face + rows cells.
  while (cell * rows + chrome(cell) > maxHeight && cell > 44) cell -= 1;
  const pw = cell * 5;
  const ph = cell * rows;
  const cw = pw + 2 * (margin + rim);
  const ax = margin + rim;
  const ay = margin + rim + cell * topPad;
  const ch = ay + ph + rim + face + margin;
  return { cw, ch, ax, ay, cell, rim, face, pw, ph, rows, size: pw };
}

export function cellCenter(l: BoardLayout, i: number): { x: number; y: number } {
  return { x: l.ax + ((i % 5) + 0.5) * l.cell, y: l.ay + (Math.floor(i / 5) + 0.5) * l.cell };
}

/** The cell under a board-local point, or -1 outside the play area. */
export function cellAt(l: BoardLayout, x: number, y: number): number {
  const c = Math.floor((x - l.ax) / l.cell);
  const r = Math.floor((y - l.ay) / l.cell);
  if (c < 0 || c > 4 || r < 0 || r >= l.rows) return -1;
  return r * 5 + c;
}
