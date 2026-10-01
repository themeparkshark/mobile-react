/**
 * layout.ts: Bonk Rush screen geometry (design v4 8.1). Pure numbers, built
 * once per field size and theme, read by the UI-thread renderer and the
 * touch-down hit test.
 *
 *   HUD plate (64pt): timer ring, combo medallion, meter bar. Never moves.
 *   Stage band (about 30% of the rest): the lifted, desaturated backdrop as
 *     distant haze, theme props, the boss, banners and prompts.
 *   Deck (the rest, ending at the bottom inset + 14pt): the themed floor with
 *     9 splash wells. Columns at 22/50/78% of the width; rows at 24/54/84% of
 *     the deck height; rims 112/102/92pt front to back (390pt reference).
 */

import { RIM_GEO, type WhackTheme } from '../assets';

export const ROW_SCALE = [0.82, 0.91, 1.0];
/** v4 rim widths (pt on a 390pt-wide phone), back to front. */
export const RIM_PT = [92, 102, 112];
export const COLS = [0.22, 0.5, 0.78];
export const ROWS = [0.24, 0.54, 0.84];
export const HUD_H = 64;

export interface BoardLayout {
  w: number;
  h: number;
  /** Bottom of the HUD plate. */
  hudH: number;
  /** Bottom of the stage band = top of the deck. Kept as `topH` for older callers. */
  topH: number;
  deckTop: number;
  deckBottom: number;
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
  /** Character content height when fully up. */
  spriteH: number[];
  /** Touch boxes: x0, x1, yTopIdle, yTopUp, yBottom. */
  hx0: number[];
  hx1: number[];
  hyIdle: number[];
  hyUp: number[];
  hyBot: number[];
  cellW: number;
}

export function computeLayout(w: number, h: number, theme: WhackTheme, opts: { topFrac?: number; compact?: boolean; bottomInset?: number } = {}): BoardLayout {
  const geo = RIM_GEO[theme];
  const [mcx, mcy, mrxF, mryF] = geo.mouth;
  // The live party board has its own room HUD: no plate, a short stage.
  const hudH = opts.compact ? 8 : HUD_H + 6;
  const rest = h - hudH;
  const stageFrac = opts.topFrac ?? (opts.compact ? 0.08 : 0.25);
  const deckTop = Math.round(hudH + rest * stageFrac);
  const deckBottom = h - (opts.bottomInset ?? 14);
  const deckH = deckBottom - deckTop;
  const colGap = (COLS[1] - COLS[0]) * w;
  const k = w / 390;
  const cellW = Math.min(colGap, deckH * 0.32);
  const L: BoardLayout = {
    w, h, hudH, topH: deckTop, deckTop, deckBottom, cx: [], my: [], mrx: [], mry: [], rimX: [], rimY: [], rimW: [], rimH: [], sc: [], spriteH: [],
    hx0: [], hx1: [], hyIdle: [], hyUp: [], hyBot: [], cellW,
  };
  for (let r = 0; r < 3; r++) {
    const s = ROW_SCALE[r];
    const rw = Math.min(RIM_PT[r] * k, colGap * 0.98, cellW * 0.95 * (RIM_PT[r] / RIM_PT[2]));
    const rh = rw / geo.aspect;
    // Rim bottom never leaves the deck: the front row sits on deckBottom.
    let my = deckTop + deckH * ROWS[r];
    const maxMy = deckBottom - rh * (1 - mcy) - 2;
    if (my > maxMy) my = maxMy;
    // Character size follows the cell, not the rim art (flat ring rims like space would shrink Finn).
    const sprite = Math.min(cellW * 1.2 * s, rw * 1.5);
    for (let c = 0; c < 3; c++) {
      // Back rows pull in a touch (perspective) so the board reads as a floor.
      const x = w / 2 + (COLS[c] - 0.5) * w * (0.9 + 0.1 * s);
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
      L.spriteH.push(sprite);
      // Walk-safe hitboxes: the cell plus 8pt slop, extended upward while a target is up.
      const half = Math.min(colGap * (0.9 + 0.1 * s) / 2, rw * 0.62) + 8;
      L.hx0.push(x - half);
      L.hx1.push(x + half);
      L.hyIdle.push(my - rh * 0.55 - 8);
      L.hyUp.push(my - sprite * 0.95 - 8);
      L.hyBot.push(rimY + rh + 8);
    }
  }
  return L;
}

/**
 * Decoy core box (v5 5.1, Fruit Ninja bomb rule): the occupant's content box
 * inset by 10%, no slop, no upward extension. The angler art is about 0.8 as
 * wide as tall, so the core is +-0.29 sprite heights around the well centre,
 * from 0.86 sprite heights above the waterline down to the waterline.
 */
export const DECOY_CORE_HALF_W = 0.29;
export const DECOY_CORE_TOP = 0.86;

export function inDecoyCore(L: BoardLayout, i: number, x: number, y: number): boolean {
  'worklet';
  const half = L.spriteH[i] * DECOY_CORE_HALF_W;
  if (x < L.cx[i] - half || x > L.cx[i] + half) return false;
  return y >= L.my[i] - L.spriteH[i] * DECOY_CORE_TOP && y <= L.my[i];
}

/**
 * Touch-down hit test (worklet), v5 5.1.
 *   up[i]   1 while a target is up or in its tell.
 *   harm[i] 1 when that target is a decoy (angler, Mimic).
 * Friendly targets use the cell plus 8pt walk slop, extended up while up.
 * Decoys use their core box only. Any tap a friendly hitbox contains goes to
 * the nearest friendly target, even when a decoy is nearer; a decoy is hit
 * only inside its core and outside every friendly box. A tap in a decoy's
 * slop but outside its core resolves to the nearest idle well (a free whiff),
 * else -1 (nothing). Without `harm` it is the v4 nearest-box test.
 */
export function hitTest(L: BoardLayout, x: number, y: number, up: number[], harm?: number[]): number {
  'worklet';
  let best = -1;
  let bestD = 1e12;
  // 1. Friendly targets (and, without kind info, every live target).
  for (let i = 0; i < 9; i++) {
    if (!up[i] || (harm && harm[i])) continue;
    if (x < L.hx0[i] || x > L.hx1[i] || y > L.hyBot[i] || y < L.hyUp[i]) continue;
    const dx = x - L.cx[i];
    const dy = y - (L.my[i] - L.spriteH[i] * 0.45);
    const d = dx * dx + dy * dy * 0.6;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) return best;
  // 2. Decoys: core only.
  if (harm) {
    for (let i = 0; i < 9; i++) {
      if (!up[i] || !harm[i] || !inDecoyCore(L, i, x, y)) continue;
      const dx = x - L.cx[i];
      const dy = y - (L.my[i] - L.spriteH[i] * 0.45);
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) return best;
  }
  // 3. Idle wells (a whiff on the rim; one whiff is free).
  for (let i = 0; i < 9; i++) {
    if (up[i]) continue;
    if (x < L.hx0[i] || x > L.hx1[i] || y > L.hyBot[i] || y < L.hyIdle[i]) continue;
    const dx = x - L.cx[i];
    const dy = y - L.my[i];
    const d = dx * dx + dy * dy * 0.6;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Touch offset of a hit (proof v4 5.1): touch minus the hole's body centre
 * in 1/32 cell units, clamped to int8 (worklet).
 */
export function touchOffset(L: BoardLayout, h: number, x: number, y: number, up: boolean): [number, number] {
  'worklet';
  const cy = up ? L.my[h] - L.spriteH[h] * 0.45 : L.my[h];
  const unit = L.cellW / 32;
  let dx = Math.round((x - L.cx[h]) / unit);
  let dy = Math.round((y - cy) / unit);
  if (dx < -128) dx = -128;
  if (dx > 127) dx = 127;
  if (dy < -128) dy = -128;
  if (dy > 127) dy = 127;
  return [dx, dy];
}

/**
 * Inverse of the board camera (5.1): maps a screen point back into board
 * space through translate(tx, ty) . scaleAbout(ox, oy, s). The renderer and
 * the hit test read the same values on the same frame (worklet).
 */
export function invertBoardPoint(x: number, y: number, tx: number, ty: number, s: number, ox: number, oy: number): [number, number] {
  'worklet';
  const sc = s > 0.0001 ? s : 1;
  return [(x - tx - ox) / sc + ox, (y - ty - oy) / sc + oy];
}
