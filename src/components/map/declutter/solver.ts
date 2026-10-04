/**
 * Map declutter solver. Pure and deterministic, no React Native, unit tested
 * (tools/tests/map-declutter-solver.test.cjs).
 *
 * Every marker on the in-park map hands in a footprint (its drawn art and glow
 * around the geo anchor, in screen points), a priority and rules. For a camera
 * the solver decides:
 *
 *  1. Bodies (the art). Pinned and fixed markers always stand. Art mostly under
 *     a HUD inset, the strip above the map or wholly off screen hides (iOS
 *     draws an off-screen marker view at the top-left corner). A marker that
 *     touches art already placed folds into it when both share a group ("+N"
 *     on the survivor), else shrinks if it may, else hides. A ride hidden by
 *     other art (a haunt, a coin) still counts in the nearest ride's "+N", so
 *     nothing vanishes silently. Allowed overlap is near zero.
 *  2. Tags (timer chips, badges). Each keeps last pass's side while it is free,
 *     else tries above, the shoulders, the sides, below, then a farther slot
 *     with a leader line. A tag never covers art, another tag, the player, an
 *     inset or the screen edge; with no free slot it hides.
 *
 * Stability (no popping): markers shown last pass are placed first and keep
 * their scale. While a finger moves the map (`hold`) they never change, only
 * leave through an inset or the edge, and markers coming into view take the
 * free space. A full priority re-solve happens only when the zoom changes.
 *
 * Runs on settled camera moves, throttled during gestures and on data change,
 * never per frame: ~150 markers take a couple of milliseconds.
 */

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** An inset over the map; `share` of a body under it hides the body (default 0.35). */
export interface InsetRect extends Rect { readonly share?: number }

export type TagSide = 'top' | 'topRight' | 'topLeft' | 'right' | 'left' | 'bottom' | 'farTop' | 'farTopRight' | 'farTopLeft';

export interface LayoutItem {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Higher wins. Ties break on id, so the result never depends on input order. */
  readonly priority: number;
  /** The drawn art (with its glow) around the anchor point (screen points; y grows down, anchor at 0,0). */
  readonly body: Rect;
  /** The art when it scales with the zoom (a reef patch, the encounter ring); overrides `body`. */
  readonly bodyFor?: (zoom: number) => Rect;
  /** More fixed art drawn with the marker (a name chip under a haunt): an obstacle for everything placed after it. */
  readonly extras?: readonly Rect[];
  /** Same-group markers fold into the survivor ("+N") instead of hiding. */
  readonly group?: string;
  /** How many markers this one stands for. Default 1. */
  readonly weight?: number;
  /** Always drawn and an obstacle (selected ride). Ignores insets. */
  readonly pinned?: boolean;
  /** Always drawn and an obstacle; never folded, shrunk or hidden (gym, boss, the Fin-ister encounter). */
  readonly fixed?: boolean;
  /** Only an obstacle for tags (the player's shark): bodies may sit under it. */
  readonly tagObstacleOnly?: boolean;
  /** May shrink to this scale (around the anchor) before it hides. */
  readonly recedeScale?: number;
  /** Recedes (never hides) where the player's shark stands on it, so the shark is not drawn over full-size art. */
  readonly recedeUnderPlayer?: boolean;
  /** Always drawn at its recede scale (a closed ride while a night mode leads). */
  readonly forceRecede?: boolean;
  /** Hidden below this zoom unless pinned. */
  readonly minZoom?: number;
  /** A chip that rides with the marker. */
  readonly tag?: { readonly w: number; readonly h: number; readonly minZoom?: number };
}

export interface CameraFrame {
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
  /** Map rotation, degrees clockwise (MapLibre heading). */
  readonly bearing: number;
  readonly width: number;
  readonly height: number;
}

export interface TagPlacement {
  /** Tag box relative to the anchor point (in the marker's unscaled space). */
  readonly x: number;
  readonly y: number;
  readonly side: TagSide;
  /** Leader line from the tag to its art, relative to the anchor point, for far slots. */
  readonly leader: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } | null;
}

export type HideReason = 'inset' | 'collision' | 'folded' | 'zoom' | 'offscreen' | null;

export interface Placement {
  readonly visible: boolean;
  /** 1, or the recede scale. */
  readonly scale: number;
  /** Markers folded into this one (by weight), including rides hidden by other art nearby. */
  readonly folded: number;
  readonly foldedInto: string | null;
  /** undefined: the item has no tag. null: hidden. */
  readonly tag?: TagPlacement | null;
  readonly reason: HideReason;
}

export interface SolveOptions {
  /** HUD and button areas in view points. */
  readonly insets?: readonly InsetRect[];
  /** Last result: shown markers are placed first and keep their scale and chip side. */
  readonly previous?: ReadonlyMap<string, Placement> | null;
  /** The zoom of the last result: a zoom change re-solves by priority alone. */
  readonly previousZoom?: number | null;
  /** A finger is moving the map: shown markers stay exactly as they are. */
  readonly hold?: boolean;
  /** Overlap (share of the smaller box) that counts as a collision. */
  readonly overlap?: number;
  /** Extra tolerance for markers that were visible last time. */
  readonly hysteresis?: number;
  /** Tags keep this far from the screen edge. */
  readonly edge?: number;
  /** Fill `rects` with each placed body and tag (development overlay). */
  readonly rects?: Map<string, { body: Rect; tag: Rect | null; point?: { x: number; y: number } }>;
}

export const VISIBLE: Placement = Object.freeze({ visible: true, scale: 1, folded: 0, foldedInto: null, reason: null });

/** Zoom change that triggers a full priority re-solve (smaller moves keep what is shown). */
export const ZOOM_RESOLVE = 0.15;
/** A ride hidden by other art counts in the "+N" of a shown ride this close (points). */
/** Share of the player's shark over a haunt that recedes it, and the share that keeps it receded. */
export const PLAYER_RECEDE = 0.2;
export const PLAYER_RECEDE_KEEP = 0.1;
export const FOLD_REACH = 220;
const DEFAULT_SHARE = 0.35;

const RAD = Math.PI / 180;

/** World point for a coordinate (MapLibre: 512-point tiles). */
function world(latitude: number, longitude: number, size: number): { x: number; y: number } {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * RAD;
  return {
    x: ((longitude + 180) / 360) * size,
    y: (0.5 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / (2 * Math.PI)) * size,
  };
}

/** Where a coordinate lands in the view (points), for this camera. */
export function project(latitude: number, longitude: number, frame: CameraFrame): { x: number; y: number } {
  const size = 512 * 2 ** frame.zoom;
  const p = world(latitude, longitude, size);
  const c = world(frame.latitude, frame.longitude, size);
  let dx = p.x - c.x;
  const dy = p.y - c.y;
  if (dx > size / 2) dx -= size;
  if (dx < -size / 2) dx += size;
  const b = frame.bearing * RAD;
  const cos = Math.cos(b), sin = Math.sin(b);
  return { x: frame.width / 2 + dx * cos + dy * sin, y: frame.height / 2 - dx * sin + dy * cos };
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Overlap as a share of the smaller box (0..1). */
export function overlapShare(a: Rect, b: Rect): number {
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 ? overlapArea(a, b) / smaller : 0;
}

function at(r: Rect, x: number, y: number, scale = 1): Rect {
  return { x: x + r.x * scale, y: y + r.y * scale, w: r.w * scale, h: r.h * scale };
}

function scaled(r: Rect, scale: number): Rect {
  return { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale };
}

/** Candidate tag boxes around a body (relative to the anchor), in preference order. */
export function tagCandidates(body: Rect, w: number, h: number): { side: TagSide; x: number; y: number; far: boolean }[] {
  const g = 3;
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  return [
    { side: 'top', x: cx - w / 2, y: body.y - h - g, far: false },
    { side: 'topRight', x: body.x + body.w - Math.min(16, w / 3), y: body.y - h + 6, far: false },
    { side: 'topLeft', x: body.x - w + Math.min(16, w / 3), y: body.y - h + 6, far: false },
    { side: 'right', x: body.x + body.w + g, y: cy - h / 2, far: false },
    { side: 'left', x: body.x - w - g, y: cy - h / 2, far: false },
    { side: 'bottom', x: cx - w / 2, y: body.y + body.h + g, far: false },
    { side: 'farTop', x: cx - w / 2, y: body.y - h - 24, far: true },
    { side: 'farTopRight', x: body.x + body.w + 10, y: body.y - h - 12, far: true },
    { side: 'farTopLeft', x: body.x - w - 10, y: body.y - h - 12, far: true },
  ];
}

function leaderFor(body: Rect, x: number, y: number, w: number, h: number): TagPlacement['leader'] {
  const tx = Math.max(x, Math.min(x + w, body.x + body.w / 2));
  const ty = y + h;
  return { x1: tx, y1: ty, x2: body.x + body.w / 2, y2: body.y + Math.min(10, body.h / 4) };
}

/**
 * A short pointer from a chip that sits beside its art (not straight above or
 * below) into that art, so in a crowd every chip has a clear owner.
 */
function pointerFor(body: Rect, x: number, y: number, w: number, h: number): TagPlacement['leader'] {
  const cx = x + w / 2, cy = y + h / 2;
  const bx = body.x + body.w / 2, by = body.y + body.h / 2;
  const x1 = Math.max(x, Math.min(x + w, bx)), y1 = Math.max(y, Math.min(y + h, by));
  const inner = { x: body.x + 10, y: body.y + 10, w: Math.max(0, body.w - 20), h: Math.max(0, body.h - 20) };
  const x2 = Math.max(inner.x, Math.min(inner.x + inner.w, cx)), y2 = Math.max(inner.y, Math.min(inner.y + inner.h, cy));
  return Math.hypot(x2 - x1, y2 - y1) < 6 ? null : { x1, y1, x2, y2 };
}

interface Placed { readonly item: LayoutItem; readonly rect: Rect; readonly order: number; readonly p: { x: number; y: number }; folded: number }
interface Cell<T> { readonly owner: T; readonly rect: Rect }

/** Uniform grid over the view so each collision check looks at its neighbours only. */
class Grid<T> {
  private cells = new Map<number, Cell<T>[]>();
  constructor(private readonly size = 128) {}
  private keys(r: Rect): number[] {
    const out: number[] = [];
    const x0 = Math.floor(r.x / this.size), x1 = Math.floor((r.x + r.w) / this.size);
    const y0 = Math.floor(r.y / this.size), y1 = Math.floor((r.y + r.h) / this.size);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push((x + 512) * 4096 + (y + 512));
    return out;
  }
  add(owner: T, rect: Rect): void {
    const cell = { owner, rect };
    for (const key of this.keys(rect)) {
      const list = this.cells.get(key);
      if (list) list.push(cell); else this.cells.set(key, [cell]);
    }
  }
  near(r: Rect): Cell<T>[] {
    const seen = new Set<Cell<T>>();
    for (const key of this.keys(r)) for (const cell of this.cells.get(key) ?? []) seen.add(cell);
    return [...seen];
  }
}

function compare(a: LayoutItem, b: LayoutItem): number {
  return Number(!!b.pinned) - Number(!!a.pinned) || Number(!!b.fixed) - Number(!!a.fixed) ||
    b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function insideView(r: Rect, frame: CameraFrame, edge: number): boolean {
  return r.x >= edge && r.y >= edge && r.x + r.w <= frame.width - edge && r.y + r.h <= frame.height - edge;
}

export function solveLayout(items: readonly LayoutItem[], frame: CameraFrame, options: SolveOptions = {}): Map<string, Placement> {
  // Art cut off by the top of the map (under the header) reads as a glitch: the strip above the view is an inset too.
  const insets: InsetRect[] = [...(options.insets ?? []), { x: -frame.width, y: -400, w: frame.width * 3, h: 400, share: 0.1 }];
  const previous = options.previous ?? null;
  const hold = !!options.hold;
  const anchoring = !!previous && (hold || (options.previousZoom != null && Math.abs(frame.zoom - options.previousZoom) < ZOOM_RESOLVE));
  const overlap = options.overlap ?? 0.03;
  const hysteresis = options.hysteresis ?? 0.01;
  const edge = options.edge ?? 4;

  const valid = items.filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  const shownBefore = (item: LayoutItem) => anchoring && !!previous!.get(item.id)?.visible;
  // Pinned and fixed first, then (when anchoring) what was on screen, then by priority.
  const sorted = [...valid].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Number(!!b.fixed) - Number(!!a.fixed) ||
    Number(shownBefore(b)) - Number(shownBefore(a)) || compare(a, b));

  const placed: Placed[] = [];
  const grid = new Grid<Placed>();
  const tagObstacles: Rect[] = [];
  const points = new Map<string, { x: number; y: number }>();
  const scales = new Map<string, number>();
  const foldedInto = new Map<string, Placed>();
  const hidden = new Map<string, HideReason>();
  const placedById = new Map<string, Placed>();
  const place = (entry: Placed) => {
    placed.push(entry);
    placedById.set(entry.item.id, entry);
    grid.add(entry, entry.rect);
    const scale = scales.get(entry.item.id) ?? 1;
    for (const extra of entry.item.extras ?? []) grid.add(entry, at(extra, entry.p.x, entry.p.y, scale));
  };

  const bodies = new Map<string, Rect>(sorted.map(item => [item.id, item.bodyFor ? item.bodyFor(frame.zoom) : item.body]));
  // The player's body, for art that recedes under the shark (tag obstacles are collected again below).
  const playerRects = sorted.filter(item => item.tagObstacleOnly).map(item => {
    const p = project(item.latitude, item.longitude, frame);
    return at(bodies.get(item.id)!, p.x, p.y);
  });
  for (const item of sorted) {
    const itemBody = bodies.get(item.id)!;
    const p = project(item.latitude, item.longitude, frame);
    points.set(item.id, p);
    if (item.tagObstacleOnly) { tagObstacles.push(at(itemBody, p.x, p.y)); continue; }
    if (item.fixed || item.pinned) {
      scales.set(item.id, 1);
      place({ item, rect: at(itemBody, p.x, p.y), order: placed.length, p, folded: 0 });
      continue;
    }
    if (item.minZoom !== undefined && frame.zoom < item.minZoom) { hidden.set(item.id, 'zoom'); continue; }
    const before = previous?.get(item.id);
    const anchored = shownBefore(item);
    const startScale = anchored && before ? before.scale : item.forceRecede && item.recedeScale ? item.recedeScale : 1;
    let rect = at(itemBody, p.x, p.y, startScale);
    // Wholly off screen: hidden (iOS draws an off-screen marker view at the top-left corner).
    if (rect.x + rect.w < 0 || rect.y + rect.h < 0 || rect.x > frame.width || rect.y > frame.height) { hidden.set(item.id, 'offscreen'); continue; }
    // The body and its extras (a haunt's name chip) each hide under an inset by the inset's share.
    const underInset = (r: Rect) => r.w * r.h > 0 && insets.some(inset => overlapArea(r, inset) / (r.w * r.h) > (inset.share ?? DEFAULT_SHARE));
    if (underInset(rect) || (item.extras ?? []).some(extra => underInset(at(extra, p.x, p.y, startScale)))) { hidden.set(item.id, 'inset'); continue; }
    // Held during a gesture: a marker on screen does not change.
    if (hold && anchored) {
      scales.set(item.id, startScale);
      place({ item, rect, order: placed.length, p, folded: 0 });
      continue;
    }
    const tolerance = overlap + (before?.visible ? hysteresis : 0);
    // The body and any extras (a haunt's name chip) must all land clear of placed art.
    const blockersAt = (r: Rect, scale: number) => {
      const hits = new Set<Placed>();
      const parts = [r, ...(item.extras ?? []).map(extra => at(extra, p.x, p.y, scale))];
      for (const part of parts) for (const cell of grid.near(part)) if (overlapShare(part, cell.rect) > tolerance) hits.add(cell.owner);
      return [...hits].sort((a, b) => a.order - b.order);
    };
    let scale = startScale;
    let blockers = blockersAt(rect, scale);
    if (blockers.length) {
      const host = item.group ? blockers.find(b => b.item.group === item.group && !b.item.fixed && !b.item.pinned) : undefined;
      if (host) {
        host.folded += (item.weight ?? 1);
        foldedInto.set(item.id, host);
        hidden.set(item.id, 'folded');
        continue;
      }
      if (item.recedeScale && scale === 1) {
        const shrunk = at(itemBody, p.x, p.y, item.recedeScale);
        const shrunkBlockers = blockersAt(shrunk, item.recedeScale);
        if (!shrunkBlockers.length) { rect = shrunk; blockers = shrunkBlockers; scale = item.recedeScale; }
      }
      if (blockers.length) { hidden.set(item.id, 'collision'); continue; }
    }
    // Under the player's shark: shrink to the recede scale when that fits (never hide for it).
    // A fifth of the shark on the art starts it; it stays receded down to a tenth (no flicker on a walk).
    const underPlayer = before?.visible && before.scale === item.recedeScale ? PLAYER_RECEDE_KEEP : PLAYER_RECEDE;
    if (item.recedeUnderPlayer && item.recedeScale) {
      const full = scale === 1 ? rect : at(itemBody, p.x, p.y, 1);
      const under = playerRects.some(r => overlapShare(full, r) > underPlayer);
      if (under && scale === 1) {
        const shrunk = at(itemBody, p.x, p.y, item.recedeScale);
        if (!blockersAt(shrunk, item.recedeScale).length) { rect = shrunk; scale = item.recedeScale; }
      } else if (!under && anchored && scale === item.recedeScale && !item.forceRecede && !blockersAt(full, 1).length) {
        // The shark walked off: grow back once the full-size art is clear.
        rect = full; scale = 1;
      }
    }
    scales.set(item.id, scale);
    place({ item, rect, order: placed.length, p, folded: 0 });
  }

  // No silent disappearances: a grouped marker hidden by other art counts in the nearest shown member's "+N".
  for (const item of sorted) {
    if (hidden.get(item.id) !== 'collision' || !item.group) continue;
    const p = points.get(item.id)!;
    let best: Placed | null = null;
    let bestD = FOLD_REACH;
    for (const entry of placed) {
      if (entry.item.group !== item.group || entry.item.fixed || entry.item.pinned) continue;
      const d = Math.hypot(entry.p.x - p.x, entry.p.y - p.y);
      if (d < bestD || (d === bestD && best && entry.item.id < best.item.id)) { best = entry; bestD = d; }
    }
    if (best) {
      best.folded += (item.weight ?? 1);
      foldedInto.set(item.id, best);
      hidden.set(item.id, 'folded');
    }
  }

  // Tags, in placement order, against every placed body, extra, earlier tag, the player and the insets.
  const tagGrid = new Grid<null>();
  const tags = new Map<string, TagPlacement | null>();
  for (const entry of placed) {
    const { item, p } = entry;
    if (!item.tag) continue;
    if (!item.pinned && item.tag.minZoom !== undefined && frame.zoom < item.tag.minZoom) { tags.set(item.id, null); continue; }
    const body = scaled(bodies.get(item.id)!, scales.get(item.id) ?? 1);
    const all = tagCandidates(body, item.tag.w, item.tag.h);
    const last = previous?.get(item.id)?.tag ?? null;
    const lastSide = last?.side;
    // During a gesture a chip never moves or appears: it keeps last pass's slot while that slot
    // stays in view and clear of the HUD (sides change only on a settled pass).
    if (hold && !item.pinned) {
      const kept = last && previous?.get(item.id)?.visible ? last : null;
      const rect = kept ? { x: p.x + kept.x, y: p.y + kept.y, w: item.tag.w, h: item.tag.h } : null;
      const ok = !!rect && insideView(rect, frame, edge) && !insets.some(inset => overlapArea(rect, inset) > 0);
      tags.set(item.id, ok ? kept : null);
      if (ok && rect) tagGrid.add(null, rect);
      continue;
    }
    // The selected marker's card always sits on top (it draws there itself); others keep last pass's side while it is free.
    const candidates = item.pinned ? all.slice(0, 1)
      : lastSide ? [...all.filter(c => c.side === lastSide), ...all.filter(c => c.side !== lastSide)] : all;
    let chosen: TagPlacement | null = null;
    for (const c of candidates) {
      const rect: Rect = { x: p.x + c.x, y: p.y + c.y, w: item.tag.w, h: item.tag.h };
      if (!item.pinned) {
        if (!insideView(rect, frame, edge)) continue;
        if (insets.some(inset => overlapArea(rect, inset) > 0)) continue;
        if (grid.near(rect).some(cell => cell.owner !== entry && overlapArea(rect, cell.rect) > 0)) continue;
        if (tagGrid.near(rect).some(cell => overlapArea(rect, cell.rect) > 0)) continue;
        if (tagObstacles.some(other => overlapArea(rect, other) > 0)) continue;
      }
      const beside = c.side !== 'top' && c.side !== 'bottom';
      chosen = { x: c.x, y: c.y, side: c.side, leader: c.far ? leaderFor(body, c.x, c.y, item.tag.w, item.tag.h)
        : beside ? pointerFor(body, c.x, c.y, item.tag.w, item.tag.h) : null };
      tagGrid.add(null, rect);
      break;
    }
    tags.set(item.id, chosen);
  }

  const out = new Map<string, Placement>();
  for (const item of sorted) {
    if (item.tagObstacleOnly) continue;
    const reason = hidden.get(item.id) ?? null;
    const entry = reason === null ? placedById.get(item.id) : undefined;
    const host = foldedInto.get(item.id);
    out.set(item.id, {
      visible: reason === null,
      scale: reason === null ? scales.get(item.id) ?? 1 : 1,
      folded: entry?.folded ?? 0,
      foldedInto: host ? host.item.id : null,
      ...(item.tag ? { tag: reason === null ? tags.get(item.id) ?? null : null } : {}),
      reason,
    });
    if (options.rects && entry) {
      const tag = tags.get(item.id);
      options.rects.set(item.id, { body: entry.rect, point: entry.p,
        tag: tag && item.tag ? { x: entry.p.x + tag.x, y: entry.p.y + tag.y, w: item.tag.w, h: item.tag.h } : null });
    }
  }
  return out;
}

export function samePlacement(a: Placement | undefined, b: Placement | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.visible !== b.visible || a.scale !== b.scale || a.folded !== b.folded || a.foldedInto !== b.foldedInto) return false;
  const ta = a.tag, tb = b.tag;
  if (ta === tb) return true;
  if (!ta || !tb) return false;
  return Math.round(ta.x) === Math.round(tb.x) && Math.round(ta.y) === Math.round(tb.y) && ta.side === tb.side;
}

/** Inset rects anchored to view edges, resolved for a view size. */
export interface EdgeInset {
  readonly left?: number; readonly right?: number; readonly top?: number; readonly bottom?: number;
  readonly width: number; readonly height: number;
  /** Share of a body under it that hides the body (default 0.35; the HUD row uses 0.1). */
  readonly share?: number;
}

export function resolveInsets(insets: readonly EdgeInset[], width: number, height: number): InsetRect[] {
  return insets.map(inset => {
    // A width or height past the view (e.g. 9999) spans it.
    const w = Math.min(inset.width, width);
    const h = Math.min(inset.height, height);
    return {
      x: inset.left !== undefined ? inset.left : inset.right !== undefined ? width - inset.right - w : 0,
      y: inset.top !== undefined ? inset.top : inset.bottom !== undefined ? height - inset.bottom - h : 0,
      w, h,
      ...(inset.share !== undefined ? { share: inset.share } : {}),
    };
  });
}
