/**
 * layout.ts: the booth-wrap geometry (design v8 6.1), pure and tested.
 *
 * The grid is laid out first; the 9-slice booth kit is then sized around the
 * measured grid rect, so the booth always hugs the board at 4x2, 4x3, 4x4 and
 * 4x5:
 *
 *   awning   full width, capL + k tiles + capR (k picked so it is ~58pt tall);
 *            its scalloped lip overlaps the felt's top gutter by 10pt, and the
 *            top gutter is 18pt, so the lip never touches a card
 *   posts    18pt wooden posts with bulbs: the side borders
 *   counter  52pt prize counter: the bottom border, with one prize slot per
 *            pair on its front rail, the Showtime pot at its centre and the
 *            rail token (rival or ghost) on its top edge
 *   felt     between the posts, above the counter; the rim rope runs inside it
 *
 * The board is anchored to the thumb zone (counter at the bottom); whatever is
 * left above the awning is the top band (HUD plates and the barker).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Bulb extends Pt {
  /** Marquee segment 0 (left post + left third), 1 (centre), 2 (right post + right third). */
  seg: number;
  /** Order around the marquee (left post bottom -> top, awning left -> right, right post top -> bottom). */
  order: number;
  /** Bulb radius (pt). */
  r: number;
}

export interface TileStrip {
  /** Uniform scale applied to the kit's master pixels. */
  s: number;
  capA: Rect;
  tiles: Rect[];
  capB: Rect;
}

export interface BoothGeo {
  W: number;
  H: number;
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  gap: number;
  grid: Rect;
  felt: Rect;
  /** The rim rope's rectangle (inside the felt, below the awning lip). */
  rope: Rect;
  awning: Rect;
  awningStrip: TileStrip;
  posts: [Rect, Rect];
  postStrips: [TileStrip, TileStrip];
  counter: Rect;
  counterStrip: TileStrip;
  bulbs: Bulb[];
  /** Prize slots on the counter's front rail (one per pair). */
  prize: Rect[];
  pot: Pt;
  /** The rail token stands on the counter's top edge at this y. */
  railY: number;
  /** Top band: HUD plates (right) and the barker (left). */
  band: Rect;
  hud: Rect;
  barker: Rect;
  /** Medium callouts (ribbon) and Large callouts (sign letters) on the awning. */
  ribbonY: number;
  peek: Rect | null;
}

/** Master pixel sizes of the pipeline kit (studio/art/memory/booth_wrap). */
export const KIT = {
  awning: { h: 377, capL: 189, tile: 679, capR: 272, sockY: 222, capLSock: [142], tileSock: [124, 294, 462, 633], capRSock: [121], sockR: 17 },
  post: { w: 208, capT: 242, tile: 482, capB: 314, bulbY: 170, bulbR: 36 },
  counter: { h: 511, capL: 422, tile: 253, capR: 422 },
} as const;

/** Card targets per row count (6.1: 4x3 78x100, 4x4 76x92, 4x5 74x78). */
export const CARD_TARGET: Record<number, [number, number]> = { 2: [78, 100], 3: [78, 100], 4: [76, 92], 5: [74, 78] };

export const SIDE = 2;
export const POST_W = 18;
export const AWNING_TARGET = 58;
export const LIP = 10;
export const TOP_GUTTER = 18;
export const SIDE_GUTTER = 10;
export const BOTTOM_GUTTER = 10;
export const COUNTER_H = 52;
/** The counter's top rail overlaps the felt's bottom edge. */
export const COUNTER_OVERLAP = 8;
export const MIN_CARD = 64;

export interface GeoOptions {
  bottomInset?: number;
  /** Time Attack: reserve the Peek button at the counter's right end. */
  peek?: boolean;
  /** Fraction of H the top band may use at least (default 0.24). */
  bandFrac?: number;
}

function strip(x0: number, x1: number, y: number, h: number, capA: number, tile: number, capB: number, masterH: number, k: number): TileStrip {
  const s = h / masterH;
  const a = { x: x0, y, w: capA * s, h };
  const b = { x: x1 - capB * s, y, w: capB * s, h };
  const tiles: Rect[] = [];
  const span = b.x - (a.x + a.w);
  const tw = tile * s;
  const n = Math.max(1, k > 0 ? k : Math.ceil(span / tw));
  // Tiles are drawn at their natural width; the last one is clipped by the span.
  for (let i = 0; i < n; i++) tiles.push({ x: a.x + a.w + i * tw, y, w: tw, h });
  return { s, capA: a, tiles, capB: b };
}

function vstrip(x: number, y0: number, y1: number, w: number): TileStrip {
  const s = w / KIT.post.w;
  const capA = { x, y: y0, w, h: KIT.post.capT * s };
  const capB = { x, y: y1 - KIT.post.capB * s, w, h: KIT.post.capB * s };
  const tiles: Rect[] = [];
  const th = KIT.post.tile * s;
  const span = capB.y - (capA.y + capA.h);
  const n = Math.max(1, Math.ceil(span / th));
  for (let i = 0; i < n; i++) tiles.push({ x, y: capA.y + capA.h + i * th, w, h: th });
  return { s, capA, tiles, capB };
}

/** Awning tile count so the strip comes out closest to AWNING_TARGET tall. */
export function awningTiles(width: number): number {
  let best = 1;
  let bestErr = Infinity;
  for (let k = 1; k <= 8; k++) {
    const s = width / (KIT.awning.capL + KIT.awning.capR + KIT.awning.tile * k);
    const err = Math.abs(s * KIT.awning.h - AWNING_TARGET);
    if (err < bestErr) {
      bestErr = err;
      best = k;
    }
  }
  return best;
}

export function boothGeo(W: number, H: number, cols: number, rows: number, opts: GeoOptions = {}): BoothGeo {
  const g = boothGeoAt(W, H, cols, rows, opts);
  // Every card stays at least 64pt: give the top band back before shrinking cards further.
  if (Math.min(g.cw, g.ch) < MIN_CARD && opts.bandFrac == null) {
    const tight = boothGeoAt(W, H, cols, rows, { ...opts, bandFrac: 110 / Math.max(1, H) });
    if (Math.min(tight.cw, tight.ch) > Math.min(g.cw, g.ch)) return tight;
  }
  return g;
}

function boothGeoAt(W: number, H: number, cols: number, rows: number, opts: GeoOptions): BoothGeo {
  const bottomInset = Math.max(8, opts.bottomInset ?? 0);
  const gap = rows >= 5 ? 6 : 8;
  // Awning: capL + k tiles + capR across the width.
  const k = awningTiles(W - SIDE * 2);
  const sA = (W - SIDE * 2) / (KIT.awning.capL + KIT.awning.capR + KIT.awning.tile * k);
  const awnH = KIT.awning.h * sA;

  const feltX = SIDE + POST_W - 3;
  const feltW = W - feltX * 2;
  const [tw, th] = CARD_TARGET[rows] ?? CARD_TARGET[4];
  const ratio = th / tw;
  // Design sizes are the floor on a 375pt phone; bigger phones grow the cards (walk-safe targets), up to +15%.
  let cw = Math.min(tw * 1.15, (feltW - SIDE_GUTTER * 2 - gap * (cols - 1)) / cols);
  let ch = cw * ratio;

  const counterBottom = H - bottomInset;
  const counterTop = counterBottom - COUNTER_H;
  const feltBottom = counterTop + COUNTER_OVERLAP;
  const gridBottom = counterTop - BOTTOM_GUTTER;
  const bandMin = Math.max(100, H * (opts.bandFrac ?? 0.24));
  const maxGridH = gridBottom - (bandMin + awnH - LIP + TOP_GUTTER);
  const needH = ch * rows + gap * (rows - 1);
  if (needH > maxGridH) {
    ch = (maxGridH - gap * (rows - 1)) / rows;
    cw = Math.min(cw, Math.max(ch / ratio, Math.min(cw, MIN_CARD)));
  }
  const gridW = cw * cols + gap * (cols - 1);
  const gridH = ch * rows + gap * (rows - 1);
  const grid = { x: (W - gridW) / 2, y: gridBottom - gridH, w: gridW, h: gridH };
  const feltTop = grid.y - TOP_GUTTER;
  const felt = { x: feltX, y: feltTop, w: feltW, h: feltBottom - feltTop };
  const awning = { x: SIDE, y: feltTop + LIP - awnH, w: W - SIDE * 2, h: awnH };
  const awningStrip = strip(SIDE, W - SIDE, awning.y, awnH, KIT.awning.capL, KIT.awning.tile, KIT.awning.capR, KIT.awning.h, k);

  // Posts run from under the awning's band to the counter's top rail.
  const postTop = awning.y + awnH * 0.5;
  const postBottom = counterTop + COUNTER_H * 0.45;
  const posts: [Rect, Rect] = [
    { x: SIDE, y: postTop, w: POST_W, h: postBottom - postTop },
    { x: W - SIDE - POST_W, y: postTop, w: POST_W, h: postBottom - postTop },
  ];
  const postStrips: [TileStrip, TileStrip] = [vstrip(posts[0].x, postTop, postBottom, POST_W), vstrip(posts[1].x, postTop, postBottom, POST_W)];

  const counter = { x: SIDE, y: counterTop, w: W - SIDE * 2, h: COUNTER_H };
  const counterStrip = strip(SIDE, W - SIDE, counterTop, COUNTER_H, KIT.counter.capL, KIT.counter.tile, KIT.counter.capR, KIT.counter.h, 0);

  // Rope: inside the felt, clear of the lip and the counter rail.
  const rope = { x: felt.x + 5, y: feltTop + LIP + 2, w: felt.w - 10, h: counterTop - 2 - (feltTop + LIP + 2) };

  // Bulbs: awning sockets, then the middle bulb of every post tile.
  const raw: { x: number; y: number; r: number; side: 'L' | 'A' | 'R' }[] = [];
  const ay = awning.y + KIT.awning.sockY * sA;
  const ar = KIT.awning.sockR * sA;
  raw.push(...KIT.awning.capLSock.map((x) => ({ x: awningStrip.capA.x + x * sA, y: ay, r: ar, side: 'A' as const })));
  awningStrip.tiles.forEach((t) => KIT.awning.tileSock.forEach((x) => raw.push({ x: t.x + x * sA, y: ay, r: ar, side: 'A' })));
  raw.push(...KIT.awning.capRSock.map((x) => ({ x: awningStrip.capB.x + x * sA, y: ay, r: ar, side: 'A' as const })));
  const postBulbs = (ps: TileStrip, side: 'L' | 'R') => {
    const out: { x: number; y: number; r: number; side: 'L' | 'R' }[] = [];
    ps.tiles.forEach((t) => {
      const y = t.y + KIT.post.bulbY * ps.s;
      // Only bulbs on the visible body (between the awning band and the counter rail).
      if (y > awning.y + awnH + 4 && y < counterTop - 4) out.push({ x: t.x + t.w / 2, y, r: KIT.post.bulbR * ps.s, side });
    });
    return out;
  };
  const left = postBulbs(postStrips[0], 'L').reverse(); // bottom -> top
  const right = postBulbs(postStrips[1], 'R'); // top -> bottom
  const awn = raw.slice().sort((a, b) => a.x - b.x);
  const ordered = [...left, ...awn, ...right];
  const bulbs: Bulb[] = ordered.map((b, order) => ({
    x: b.x,
    y: b.y,
    r: b.r,
    order,
    seg: b.side === 'L' ? 0 : b.side === 'R' ? 2 : b.x < W / 3 ? 0 : b.x > (2 * W) / 3 ? 2 : 1,
  }));

  // Peek (Time Attack): the counter's right end, a thumb target that never covers a card.
  const peek = opts.peek ? { x: W - SIDE - 62, y: counterTop - 8, w: 60, h: 58 } : null;
  const pairs = (cols * rows) / 2;
  const slotX0 = counterStrip.capA.x + counterStrip.capA.w * 0.6;
  const slotX1 = (peek ? peek.x - 4 : counterStrip.capB.x + counterStrip.capB.w * 0.4);
  const slotW = (slotX1 - slotX0) / pairs;
  const slotH = Math.min(34, COUNTER_H * 0.62);
  const prize: Rect[] = [];
  for (let i = 0; i < pairs; i++) {
    const w = Math.min(slotW - 3, slotH * 0.8);
    prize.push({ x: slotX0 + i * slotW + (slotW - w) / 2, y: counterTop + COUNTER_H * 0.3, w, h: slotH });
  }
  const pot = { x: W / 2, y: counterTop + COUNTER_H * 0.5 };
  const band = { x: 0, y: 0, w: W, h: Math.max(0, awning.y) };
  // HUD plates sit just above the awning (glanceable next to the board), the barker beside them.
  const hud = { x: W * 0.4, y: Math.max(6, awning.y - 56), w: W * 0.6 - 8, h: 48 };
  const barkerH = Math.max(96, Math.min(210, awning.y + awnH * 0.55 - 2));
  const barker = { x: 4, y: awning.y + awnH * 0.55 - barkerH, w: barkerH * 0.79, h: barkerH };
  return {
    W, H, cols, rows, cw, ch, gap, grid, felt, rope, awning, awningStrip, posts, postStrips, counter, counterStrip,
    bulbs, prize, pot, railY: counterTop + 2, band, hud, barker, ribbonY: ay, peek,
  };
}

export function slotXY(g: BoothGeo, slot: number): Pt {
  const c = slot % g.cols;
  const r = Math.floor(slot / g.cols);
  return { x: g.grid.x + c * (g.cw + g.gap), y: g.grid.y + r * (g.ch + g.gap) };
}

export function slotCenter(g: BoothGeo, slot: number): Pt {
  const p = slotXY(g, slot);
  return { x: p.x + g.cw / 2, y: p.y + g.ch / 2 };
}

/** Nearest card centre within its rect plus forgiveness (4pt standing, 10pt walking). */
export function hitSlot(g: BoothGeo, x: number, y: number, forgive: number, skip: (slot: number) => boolean): number {
  let best = -1;
  let bestD = Infinity;
  for (let s = 0; s < g.cols * g.rows; s++) {
    if (skip(s)) continue;
    const c = slotCenter(g, s);
    const dx = Math.abs(x - c.x);
    const dy = Math.abs(y - c.y);
    if (dx > g.cw / 2 + g.gap / 2 + forgive || dy > g.ch / 2 + g.gap / 2 + forgive) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Manhattan wave step from a slot (Showtime gold backs, glimpse, board-clear wells). */
export function waveStep(g: Pick<BoothGeo, 'cols'>, from: number, slot: number): number {
  return Math.abs((slot % g.cols) - (from % g.cols)) + Math.abs(Math.floor(slot / g.cols) - Math.floor(from / g.cols));
}
