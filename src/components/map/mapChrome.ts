/**
 * The map's chrome layout: one owner for everything that sits over the map (Dustin, Nov 19: "there are
 * multiple things covering each other and it's so busy"). Pure, unit tested in tools/tests/map-chrome.test.cjs.
 * The rules are written out in core-loop/dustin-nov19/map/MAP_LAYOUT.md:
 *
 *  (a) One card in the top slot. Everything else that wants the top waits its turn or wears its small chip.
 *  (b) A coach tip shows only where its bubble fits without covering a card, a button, a marker or the shark,
 *      never while a card is arriving, one on screen and one per app open. If it cannot fit, it waits.
 *  (c) Chrome reserves its areas. A treat under a corner button or a card is not drawn peeking out from behind
 *      it: it becomes an edge arrow at the nearest clear edge.
 *  (d) Edge arrows never touch: one per side (the nearest find leads, the rest are its count), and two that
 *      would still touch merge into one.
 *  (e) One cue per marker: the hand or the NEW tag, never both; the calling rings only on the current target.
 *  (f) The distance pill is one quiet line (Report is a long press on the pill or the treat).
 *  (g) At rest the map shows only what matters now (restThings lists them).
 */
import type { Rect } from '../../screens/ExploreScreen/findEdges';

export type { Rect };

const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inflate = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });

// ---------------------------------------------------------------------------------------------------------------
// The fixed chrome (points, inside the map container).

/** The right rail: the compass button and its extras (the Rewards chest), 16 pt from the right edge. */
export const RAIL_RIGHT = 16;
export const RAIL_BUTTON = 54;
/** One rail button and its gap. */
export const RAIL_STEP = 62;
/** The home raid chip at the top right (HomeLive): 52 tall, then a gap before the rail. */
export const RAID_CHIP_ROW = 58;
/** The top slot's top and the gap the card keeps from the rail on its right. */
export const TOP_SLOT_TOP = 12;
/** The bottom-left menu disc and the bottom-right Shelf button (with its label), measured from the bottom. */
export const MENU_RECT = { left: 12, bottom: 96, w: 84, h: 84 } as const;
export const SHELF_RECT = { right: 10, bottom: 92, w: 96, h: 110 } as const;

export interface ChromeInput {
  readonly width: number;
  readonly height: number;
  /** The top slot's card, when one shows (its height; it spans from the left edge to the rail). */
  readonly card: { readonly height: number; readonly rightGap: number } | null;
  /** The live raid chip at the top right (home). */
  readonly raidChip: boolean;
  /** Buttons under the compass in the rail (the Rewards chest is one). */
  readonly railExtras: number;
  /** The menu disc at the bottom left and the Shelf at the bottom right. */
  readonly menu: boolean;
  readonly shelf: boolean;
}

export interface ChromeLayout {
  /** Where the top slot's card sits. A raid chip never pushes it down (it lives in the rail column). */
  readonly cardTop: number;
  readonly cardRect: Rect | null;
  /** Where the rail starts: under the raid chip when one shows. */
  readonly controlsTop: number;
  readonly compassRect: Rect;
  /** Every area chrome reserves on the map, by name. */
  readonly reserved: readonly { readonly kind: 'card' | 'raid' | 'rail' | 'menu' | 'shelf'; readonly rect: Rect }[];
}

/** Lays the map's chrome out once, from the screen size and what is showing. Pure. */
export function mapChrome(i: ChromeInput): ChromeLayout {
  const reserved: { kind: 'card' | 'raid' | 'rail' | 'menu' | 'shelf'; rect: Rect }[] = [];
  const railX = i.width - RAIL_RIGHT - RAIL_BUTTON;
  const cardTop = TOP_SLOT_TOP;
  const controlsTop = TOP_SLOT_TOP + (i.raidChip ? RAID_CHIP_ROW : 0);
  const cardRect = i.card ? { x: 12, y: cardTop, w: Math.max(0, i.width - i.card.rightGap - 12), h: i.card.height } : null;
  if (cardRect) reserved.push({ kind: 'card', rect: cardRect });
  if (i.raidChip) reserved.push({ kind: 'raid', rect: { x: railX, y: TOP_SLOT_TOP, w: RAIL_BUTTON, h: RAID_CHIP_ROW - 6 } });
  const compassRect = { x: railX, y: controlsTop, w: RAIL_BUTTON, h: RAIL_BUTTON };
  reserved.push({ kind: 'rail', rect: { x: railX - 6, y: controlsTop - 6, w: RAIL_BUTTON + 12, h: RAIL_BUTTON + i.railExtras * RAIL_STEP + 18 } });
  if (i.menu) reserved.push({ kind: 'menu', rect: { x: MENU_RECT.left, y: i.height - MENU_RECT.bottom - MENU_RECT.h, w: MENU_RECT.w, h: MENU_RECT.h } });
  if (i.shelf) reserved.push({ kind: 'shelf', rect: { x: i.width - SHELF_RECT.right - SHELF_RECT.w, y: i.height - SHELF_RECT.bottom - SHELF_RECT.h, w: SHELF_RECT.w, h: SHELF_RECT.h } });
  return { cardTop, cardRect, controlsTop, compassRect, reserved };
}

// ---------------------------------------------------------------------------------------------------------------
// (a) The top slot.

/**
 * The top slot's order (core loop 4.1 and 4.3 rule 9: the guide always owns the top-left; D1: the one clear next
 * thing first). A boss moment you are in may hold the screen for a few seconds; otherwise the guide card leads and
 * a live raid wears its small chip in the rail column. Lower entries wait their turn.
 */
export const TOP_SLOT_ORDER = ['boss_moment', 'guide', 'raid', 'adventure', 'project'] as const;
export type TopSlotKind = typeof TOP_SLOT_ORDER[number];

/** Of what wants the top slot, the one card that shows, and what waits (folded into its chip or its turn). Pure. */
export function topSlot(wanting: readonly TopSlotKind[]): { readonly lead: TopSlotKind | null; readonly waiting: readonly TopSlotKind[] } {
  const ranked = TOP_SLOT_ORDER.filter(kind => wanting.includes(kind));
  return { lead: ranked[0] ?? null, waiting: ranked.slice(1) };
}

// ---------------------------------------------------------------------------------------------------------------
// (b) Coach tips.

/** The compass tip bubble (title and two lines). */
export const TIP_BUBBLE = { w: 210, h: 78 } as const;
/** The bubble's gap from the button it points at. */
const TIP_GAP = 10;
/** A card that just arrived settles this long before a tip may join it. */
export const TIP_CARD_SETTLE_MS = 1500;

export interface TipSpot {
  /** Beside the button, or tucked down to just under the top card (its tail still points up at the button). */
  readonly placement: 'beside' | 'tucked';
  /** How far below the button's top the bubble's top sits. */
  readonly drop: number;
  readonly rect: Rect;
}

/**
 * Where the tip for `anchor` (a rail button) fits: beside it, else tucked under the top card, in the lane left of
 * the rail. Null when every spot would cover a card, a button, a marker or the shark: then the tip waits. Pure.
 */
export function tipSpot(anchor: Rect, obstacles: readonly Rect[], screen: { readonly width: number; readonly height: number },
  card: Rect | null, bubble: { readonly w: number; readonly h: number } = TIP_BUBBLE): TipSpot | null {
  const x = anchor.x - TIP_GAP - bubble.w;
  if (x < 8) return null;
  const tops: { placement: TipSpot['placement']; y: number }[] = [{ placement: 'beside', y: anchor.y }];
  if (card) tops.push({ placement: 'tucked', y: Math.max(anchor.y, card.y + card.h + 8) });
  for (const { placement, y } of tops) {
    const rect = { x, y, w: bubble.w, h: bubble.h };
    if (y + bubble.h > screen.height - 8) continue;
    if (obstacles.some(o => hits(rect, o))) continue;
    return { placement, drop: y - anchor.y, rect };
  }
  return null;
}

let tipShownInOpen: string | null = null;

/** Whether a map tip may still show in this app open (one per open). Pure over the open id. */
export function mapTipAllowed(appOpenId: string, tipId: string, shownIn: string | null = tipShownInOpen, shownTip: string | null = tipShownTip): boolean {
  return shownIn !== appOpenId || shownTip === tipId;
}
let tipShownTip: string | null = null;
/** Records the one map tip of this app open. */
export function markMapTipShown(appOpenId: string, tipId: string): void {
  tipShownInOpen = appOpenId;
  tipShownTip = tipId;
}

/**
 * The whole tip gate: the moment is free (the caller's own checks), the top card has settled, no other tip this
 * open, and the bubble fits somewhere. Returns the spot to draw it in, or null (it waits). Pure.
 */
export function mapTipGate(g: {
  readonly free: boolean;
  readonly now: number;
  /** When the top card last changed (it slides in), or null when there is no card. */
  readonly cardChangedAt: number | null;
  readonly allowedThisOpen: boolean;
  readonly spot: TipSpot | null;
}): TipSpot | null {
  if (!g.free || !g.allowedThisOpen || !g.spot) return null;
  if (g.cardChangedAt != null && g.now - g.cardChangedAt < TIP_CARD_SETTLE_MS) return null;
  return g.spot;
}

// ---------------------------------------------------------------------------------------------------------------
// (c) Markers under chrome.

/** How far around a reserved area a treat still counts as under it (its art stands above its spot). */
export const UNDER_PAD = 18;

/** Whether a treat's map spot sits under any reserved area (then it shows as an edge arrow, never peeking). Pure. */
export function underChrome(point: { readonly x: number; readonly y: number }, reserved: readonly Rect[], pad = UNDER_PAD): boolean {
  // The art stands about 36 pt above its spot: test that box, not the bare point.
  const art: Rect = { x: point.x - 20, y: point.y - 36, w: 40, h: 44 };
  return reserved.some(r => hits(art, inflate(r, pad)));
}

// ---------------------------------------------------------------------------------------------------------------
// (d) Edge arrows.

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';
export interface EdgeInset { readonly top: number; readonly bottom: number; readonly side: number }
export interface EdgeToken<T> {
  /** The nearest find this arrow stands for. */
  readonly lead: T;
  /** How many finds this arrow stands for (the lead plus the ones it folded in). */
  readonly count: number;
  readonly side: EdgeSide;
  readonly x: number;
  readonly y: number;
  readonly angleDeg: number;
}
/** An edge token's size and the gap two tokens keep. */
export const EDGE_TOKEN = 48;
const EDGE_GAP = 8;

/** Where the line from the map's centre to a point leaves the safe box, and which side it leaves by. Pure. */
export function edgeExit(point: { readonly x: number; readonly y: number }, size: { readonly width: number; readonly height: number }, inset: EdgeInset):
  { x: number; y: number; angleDeg: number; side: EdgeSide } {
  const cx = size.width / 2, cy = size.height / 2;
  const dx = point.x - cx, dy = point.y - cy;
  const left = inset.side, right = size.width - inset.side, top = inset.top, bottom = size.height - inset.bottom;
  let scale = Infinity;
  let side: EdgeSide = 'top';
  const take = (s: number, which: EdgeSide) => { if (s < scale) { scale = s; side = which; } };
  if (dx > 0) take((right - cx) / dx, 'right');
  if (dx < 0) take((left - cx) / dx, 'left');
  if (dy > 0) take((bottom - cy) / dy, 'bottom');
  if (dy < 0) take((top - cy) / dy, 'top');
  if (!Number.isFinite(scale)) scale = 0;
  const angleDeg = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
  return { x: cx + dx * scale, y: cy + dy * scale, angleDeg, side };
}

const tokenRect = (x: number, y: number): Rect => ({ x: x - EDGE_TOKEN / 2, y: y - EDGE_TOKEN / 2, w: EDGE_TOKEN, h: EDGE_TOKEN });

/** Slides a token along its own edge to the nearest spot that covers no reserved area (or keeps it). Pure. */
function slideClear(t: { x: number; y: number; side: EdgeSide }, reserved: readonly Rect[], size: { width: number; height: number }, inset: EdgeInset):
  { x: number; y: number } {
  const clear = (x: number, y: number) => !reserved.some(r => hits(tokenRect(x, y), r));
  if (clear(t.x, t.y)) return { x: t.x, y: t.y };
  const along = t.side === 'left' || t.side === 'right';
  const lo = along ? inset.top : inset.side, hi = along ? size.height - inset.bottom : size.width - inset.side;
  for (let k = 1; k <= 60; k++) {
    for (const d of [k * 8, -k * 8]) {
      const v = (along ? t.y : t.x) + d;
      if (v < lo || v > hi) continue;
      const x = along ? t.x : v, y = along ? v : t.y;
      if (clear(x, y)) return { x, y };
    }
  }
  return { x: t.x, y: t.y };
}

/**
 * The edge arrows for finds off screen or under chrome: one per side, led by the nearest find (the rest are its
 * count), slid clear of reserved areas, and any two that would still touch merged into one. Pure.
 */
export function edgeTokens<T extends { readonly point: { readonly x: number; readonly y: number }; readonly distance: number | null }>(finds: readonly T[],
  size: { readonly width: number; readonly height: number }, inset: EdgeInset, reserved: readonly Rect[] = []): EdgeToken<T>[] {
  if (size.width === 0 || size.height === 0) return [];
  const bySide = new globalThis.Map<EdgeSide, { lead: T; count: number; exit: ReturnType<typeof edgeExit> }>();
  const order = [...finds].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  for (const find of order) {
    const exit = edgeExit(find.point, size, inset);
    const held = bySide.get(exit.side);
    if (held) held.count += 1;
    else bySide.set(exit.side, { lead: find, count: 1, exit });
  }
  const tokens: (EdgeToken<T> & { distance: number })[] = [];
  for (const [side, { lead, count, exit }] of bySide) {
    const at = slideClear({ x: exit.x, y: exit.y, side }, reserved, size, inset);
    tokens.push({ lead, count, side, x: at.x, y: at.y, angleDeg: exit.angleDeg, distance: lead.distance ?? Infinity });
  }
  // Nearest first, so a merge keeps the nearer find as the lead.
  tokens.sort((a, b) => a.distance - b.distance);
  const kept: (EdgeToken<T> & { distance: number })[] = [];
  for (const token of tokens) {
    const near = kept.find(k => Math.hypot(k.x - token.x, k.y - token.y) < EDGE_TOKEN + EDGE_GAP);
    if (near) { (near as { count: number }).count += token.count; continue; }
    kept.push(token);
  }
  return kept.map(({ distance: _d, ...token }) => token);
}

// ---------------------------------------------------------------------------------------------------------------
// (e) One cue per marker.

export interface MarkerCues {
  readonly finger: boolean;
  readonly newTag: boolean;
  /** The small NEW dot on a far find (a whisper, not a tag). */
  readonly newDot: boolean;
  /** The two gold calling rings. */
  readonly rings: boolean;
}

/**
 * The current target (the find the hand points at) wears the hand and the rings; any other find in range wears its
 * NEW tag if it is new, and nothing else. A far new find keeps its small dot. Pure.
 */
export function markerCues(m: { readonly isNew: boolean; readonly inRange: boolean; readonly target: boolean; readonly grouped: boolean }): MarkerCues {
  const finger = m.inRange && m.target;
  return {
    finger,
    newTag: m.isNew && !m.grouped && m.inRange && !finger,
    newDot: m.isNew && !m.grouped && !m.inRange,
    rings: finger,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// (g) The map at rest.

/** Edge arrows step back while a treat is in range: the hand on it is the one next thing. Pure. */
export function edgesAtRest(input: { readonly targetInRange: boolean }): boolean {
  return !input.targetInRange;
}
