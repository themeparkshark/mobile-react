/**
 * layout.ts: Bonk Rush screen geometry (design 6.1). Pure numbers, built once
 * per field size and theme, read by the UI-thread renderer and the touch-down
 * hit test.
 *
 *   Top zone (about 28%): timer, combo badge, meter, boss, banners, prompts.
 *   Board: a 3-row perspective ground plane (back 0.8, middle 0.9, front 1.0).
 *   Rows overlap slightly so front rims occlude back-row bodies.
 */

import { RIM_GEO, type WhackTheme } from '../assets';

export const ROW_SCALE = [0.8, 0.9, 1.0];

export interface BoardLayout {
  w: number;
  h: number;
  topH: number;
  /** Per hole (row-major, 0 = back left). */
  cx: number[];
  /** Mouth centre (water line) y. */
  my: number[];
  /** Mouth ellipse radii. */
  mrx: number[];
  mry: number[];
  /** Rim image rect. */
  rimX: number[];
  rimY: number[];
  rimW: number[];
  rimH: number[];
  /** Row scale per hole. */
  sc: number[];
  /** Character content height when fully up (front row). */
  spriteH: number[];
  /** Touch boxes: x0, x1, yTopIdle, yTopUp, yBottom. */
  hx0: number[];
  hx1: number[];
  hyIdle: number[];
  hyUp: number[];
  hyBot: number[];
  cellW: number;
}

export function computeLayout(w: number, h: number, theme: WhackTheme): BoardLayout {
  const geo = RIM_GEO[theme];
  const [mcx, mcy, mrxF, mryF] = geo.mouth;
  const topH = Math.round(h * 0.27);
  const boardTop = topH;
  const boardBottom = h - 8;
  const boardH = boardBottom - boardTop;
  const cellW = Math.min(w / 3.02, boardH / 2.15);
  const L: BoardLayout = {
    w, h, topH, cx: [], my: [], mrx: [], mry: [], rimX: [], rimY: [], rimW: [], rimH: [], sc: [], spriteH: [],
    hx0: [], hx1: [], hyIdle: [], hyUp: [], hyBot: [], cellW,
  };
  const rimWOf = (r: number) => cellW * 0.9 * ROW_SCALE[r];
  const rimHOf = (r: number) => rimWOf(r) / geo.aspect;
  // Front row: rim bottom sits on the board bottom.
  const frontMouth = boardBottom - rimHOf(2) * (1 - mcy) - 2;
  const sprite = (r: number) => rimWOf(r) * 1.3;
  // Back row mouth leaves room for its character to rise into the top zone edge.
  const backMouth = Math.max(boardTop + sprite(0) * 0.62, frontMouth - boardH * 0.66);
  const midMouth = backMouth + (frontMouth - backMouth) * 0.49;
  const rowMouth = [backMouth, midMouth, frontMouth];
  for (let r = 0; r < 3; r++) {
    const s = ROW_SCALE[r];
    const spread = Math.min(w * 0.33, cellW * 1.04) * (0.86 + 0.14 * s);
    const rw = rimWOf(r);
    const rh = rimHOf(r);
    for (let c = 0; c < 3; c++) {
      const x = w / 2 + (c - 1) * spread;
      const my = rowMouth[r];
      const rimX = x - rw * mcx;
      const rimY = my - rh * mcy;
      L.cx.push(x);
      L.my.push(my);
      L.mrx.push(rw * mrxF);
      L.mry.push(Math.max(rh * mryF, rw * 0.06));
      L.rimX.push(rimX);
      L.rimY.push(rimY);
      L.rimW.push(rw);
      L.rimH.push(rh);
      L.sc.push(s);
      L.spriteH.push(sprite(r));
      // Walk-safe hitboxes: the whole cell plus 8pt slop, extended upward while a target is up.
      const half = Math.min(spread / 2, rw * 0.58) + 8;
      L.hx0.push(x - half);
      L.hx1.push(x + half);
      L.hyIdle.push(my - rh * 0.55 - 8);
      L.hyUp.push(my - sprite(r) * 0.95 - 8);
      L.hyBot.push(rimY + rh + 8);
    }
  }
  return L;
}

/**
 * Touch-down hit test (worklet). Prefers a hole whose target is up and whose
 * body contains the touch; otherwise the nearest mouth whose idle box
 * contains it. Returns -1 outside every box.
 */
export function hitTest(L: BoardLayout, x: number, y: number, up: number[]): number {
  'worklet';
  let best = -1;
  let bestD = 1e12;
  for (let i = 0; i < 9; i++) {
    if (x < L.hx0[i] || x > L.hx1[i] || y > L.hyBot[i]) continue;
    const top = up[i] ? L.hyUp[i] : L.hyIdle[i];
    if (y < top) continue;
    // Distance to the character centre when up, to the mouth otherwise; up targets win ties.
    const ty = up[i] ? L.my[i] - L.spriteH[i] * 0.45 : L.my[i];
    const dx = x - L.cx[i];
    const dy = y - ty;
    const d = dx * dx + dy * dy * 0.6 - (up[i] ? 4000 : 0);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
