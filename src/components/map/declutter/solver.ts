/**
 * Map declutter solver. Pure and deterministic, no React Native, unit tested
 * (tools/tests/map-declutter-solver.test.cjs).
 *
 * Every marker on the in-park map hands in a footprint (its art box around the
 * geo anchor, in screen points), a priority and optional rules. Given the
 * camera, the solver decides, in priority order:
 *
 *  1. Bodies (the art). Pinned and fixed markers always stand. Anything whose
 *     art sits mostly under the HUD or a button column is hidden (map insets).
 *     A marker that collides with one already placed folds into it when both
 *     share a group ("+N" on the survivor), else shrinks if it may recede, else
 *     hides. Higher priority art is never covered.
 *  2. Tags (timer chips, badges, labels). Each tag tries the side above its art
 *     first, then the shoulders, the sides, below, and finally a farther slot
 *     with a short leader line. A tag never covers placed art, another tag, the
 *     player, a HUD inset or the screen edge; with no free slot it hides.
 *
 * Markers are upright views pinned by the map, so screen offsets are exact
 * whatever the map's rotation. It runs on region and data change only (never
 * per frame); ~100 markers take well under a millisecond.
 */

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export type TagSide = 'top' | 'topRight' | 'topLeft' | 'right' | 'left' | 'bottom' | 'farTop' | 'farTopRight' | 'farTopLeft';

export interface LayoutItem {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Higher wins. Ties break on id, so the result never depends on input order. */
  readonly priority: number;
  /** The art around the anchor point (screen points; y grows down, anchor at 0,0). */
  readonly body: Rect;
  /** Same-group markers fold into the survivor ("+N") instead of hiding. */
  readonly group?: string;
  /** How many markers this one already stands for (a pre-folded ride stack). Default 1. */
  readonly weight?: number;
  /** Always drawn and an obstacle (selected ride). Ignores insets. */
  readonly pinned?: boolean;
  /** Always drawn and an obstacle; never folded, shrunk or hidden (gym, boss). */
  readonly fixed?: boolean;
  /** Only an obstacle for tags (the player's shark): bodies may sit under it. */
  readonly tagObstacleOnly?: boolean;
  /** May shrink to this scale (around the anchor) before it hides. */
  readonly recedeScale?: number;
  /** Always drawn shrunk and dimmed (a closed ride while a night mode leads). */
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
  /** Tag box relative to the anchor point. */
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
  readonly dim: boolean;
  /** Markers folded into this one (by weight). */
  readonly folded: number;
  readonly foldedInto: string | null;
  /** undefined: the item has no tag. null: hidden. */
  readonly tag?: TagPlacement | null;
  readonly reason: HideReason;
}

export interface SolveOptions {
  /** HUD and button areas in view points. */
  readonly insets?: readonly Rect[];
  /** Last result: markers already shown get a little more overlap before they hide (no flicker). */
  readonly previous?: ReadonlyMap<string, Placement> | null;
  /** Overlap (share of the smaller box) that counts as a collision. */
  readonly overlap?: number;
  /** Extra tolerance for markers that were visible last time. */
  readonly hysteresis?: number;
  /** Share of a body under an inset that hides it. */
  readonly insetShare?: number;
  /** Tags keep this far from the screen edge. */
  readonly edge?: number;
  /** Art this far past the view edge still counts as on screen. */
  readonly offscreen?: number;
}

export const VISIBLE: Placement = Object.freeze({ visible: true, scale: 1, dim: false, folded: 0, foldedInto: null, reason: null });

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

interface Placed { item: LayoutItem; rect: Rect; folded: number }

/** Uniform grid over the view so each collision check looks at its neighbours only. */
class Grid<T extends { rect: Rect }> {
  private cells = new Map<number, T[]>();
  constructor(private readonly size = 128) {}
  private keys(r: Rect): number[] {
    const out: number[] = [];
    const x0 = Math.floor(r.x / this.size), x1 = Math.floor((r.x + r.w) / this.size);
    const y0 = Math.floor(r.y / this.size), y1 = Math.floor((r.y + r.h) / this.size);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push((x + 512) * 4096 + (y + 512));
    return out;
  }
  add(entry: T): void {
    for (const key of this.keys(entry.rect)) {
      const cell = this.cells.get(key);
      if (cell) cell.push(entry); else this.cells.set(key, [entry]);
    }
  }
  near(r: Rect): T[] {
    const seen = new Set<T>();
    for (const key of this.keys(r)) for (const entry of this.cells.get(key) ?? []) seen.add(entry);
    return [...seen];
  }
}

function compare(a: LayoutItem, b: LayoutItem): number {
  return Number(!!b.pinned) - Number(!!a.pinned) || Number(!!b.fixed) - Number(!!a.fixed) ||
    b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function solveLayout(items: readonly LayoutItem[], frame: CameraFrame, options: SolveOptions = {}): Map<string, Placement> {
  // Art cut off by the top of the map (under the header) reads as a glitch: the strip above the view is an inset too.
  const insets = [...(options.insets ?? []), { x: -frame.width, y: -400, w: frame.width * 3, h: 400 }];
  const previous = options.previous ?? null;
  const overlap = options.overlap ?? 0.14;
  const hysteresis = options.hysteresis ?? 0.08;
  const insetShare = options.insetShare ?? 0.35;
  const edge = options.edge ?? 4;
  const offscreen = options.offscreen ?? 0;
  const out = new Map<string, Placement>();
  const sorted = items.filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).sort(compare);
  const placed: Placed[] = [];
  const grid = new Grid<Placed>();
  const place = (entry: Placed) => { placed.push(entry); grid.add(entry); };
  const tagObstacles: Rect[] = [];
  const points = new Map<string, { x: number; y: number }>();
  const scales = new Map<string, number>();
  const foldedInto = new Map<string, Placed>();
  const hidden = new Map<string, HideReason>();

  for (const item of sorted) {
    const p = project(item.latitude, item.longitude, frame);
    points.set(item.id, p);
    if (item.tagObstacleOnly) { tagObstacles.push(at(item.body, p.x, p.y)); continue; }
    if (item.fixed || item.pinned) {
      const rect = at(item.body, p.x, p.y);
      place({ item, rect, folded: 0 });
      scales.set(item.id, 1);
      continue;
    }
    if (item.minZoom !== undefined && frame.zoom < item.minZoom) { hidden.set(item.id, 'zoom'); continue; }
    // Wholly off screen: hidden. The map does not always move marker views it
    // has scrolled out of view, so one left visible can linger at the edge
    // (the "LIMITED" chip peeking under the HUD). It fades in on the pass after
    // the camera settles with it in view.
    const box = at(item.body, p.x, p.y);
    if (box.x + box.w < -offscreen || box.y + box.h < -offscreen || box.x > frame.width + offscreen || box.y > frame.height + offscreen) {
      hidden.set(item.id, 'offscreen');
      continue;
    }
    const tolerance = overlap + (previous?.get(item.id)?.visible ? hysteresis : 0);
    const tryScale = (scale: number): { rect: Rect; blockers: Placed[] } => {
      const rect = at(item.body, p.x, p.y, scale);
      return { rect, blockers: grid.near(rect).filter(other => overlapShare(rect, other.rect) > tolerance)
        .sort((a, b) => placed.indexOf(a) - placed.indexOf(b)) };
    };
    const startScale = item.forceRecede && item.recedeScale ? item.recedeScale : 1;
    let attempt = tryScale(startScale);
    const area = attempt.rect.w * attempt.rect.h;
    if (area > 0 && insets.some(inset => overlapArea(attempt.rect, inset) / area > insetShare)) { hidden.set(item.id, 'inset'); continue; }
    if (attempt.blockers.length) {
      const host = item.group ? attempt.blockers.find(b => b.item.group === item.group && !b.item.fixed && !b.item.pinned) : undefined;
      if (host) {
        host.folded += (item.weight ?? 1);
        foldedInto.set(item.id, host);
        hidden.set(item.id, 'folded');
        continue;
      }
      if (item.recedeScale && startScale === 1) {
        const shrunk = tryScale(item.recedeScale);
        if (!shrunk.blockers.length) attempt = shrunk;
      }
      if (attempt.blockers.length) { hidden.set(item.id, 'collision'); continue; }
    }
    place({ item, rect: attempt.rect, folded: 0 });
    scales.set(item.id, attempt.rect.w / (item.body.w || 1));
  }

  // Tags, in the same priority order, against every placed body and earlier tag.
  const tagGrid = new Grid<{ rect: Rect }>();
  const tagRects = { push: (rect: Rect) => tagGrid.add({ rect }) };
  const tags = new Map<string, TagPlacement | null>();
  const view: Rect = { x: edge, y: edge, w: frame.width - edge * 2, h: frame.height - edge * 2 };
  for (const entry of placed) {
    const { item } = entry;
    if (!item.tag) continue;
    const p = points.get(item.id)!;
    if (!item.pinned && item.tag.minZoom !== undefined && frame.zoom < item.tag.minZoom) { tags.set(item.id, null); continue; }
    const scale = scales.get(item.id) ?? 1;
    const body: Rect = { x: item.body.x * scale, y: item.body.y * scale, w: item.body.w * scale, h: item.body.h * scale };
    let chosen: TagPlacement | null = null;
    // The selected marker's chip always sits on top (it draws there itself).
    const candidates = item.pinned ? tagCandidates(body, item.tag.w, item.tag.h).slice(0, 1) : tagCandidates(body, item.tag.w, item.tag.h);
    for (const c of candidates) {
      if (item.pinned) {
        chosen = { x: c.x, y: c.y, side: c.side, leader: null };
        tagRects.push({ x: p.x + c.x, y: p.y + c.y, w: item.tag.w, h: item.tag.h });
        break;
      }
      const rect: Rect = { x: p.x + c.x, y: p.y + c.y, w: item.tag.w, h: item.tag.h };
      const inside = rect.x >= view.x && rect.y >= view.y && rect.x + rect.w <= view.x + view.w && rect.y + rect.h <= view.y + view.h;
      if (!inside) continue;
      if (insets.some(inset => overlapArea(rect, inset) > 0)) continue;
      if (grid.near(rect).some(other => other !== entry && overlapArea(rect, other.rect) > 2)) continue;
      if (tagGrid.near(rect).some(other => overlapArea(rect, other.rect) > 0)) continue;
      if (tagObstacles.some(other => overlapArea(rect, other) > 0)) continue;
      chosen = { x: c.x, y: c.y, side: c.side, leader: c.far ? leaderFor(body, c.x, c.y, item.tag.w, item.tag.h) : null };
      tagRects.push(rect);
      break;
    }
    // The selected marker always keeps its tag, on top.
    if (!chosen && item.pinned) {
      const top = tagCandidates(body, item.tag.w, item.tag.h)[0];
      chosen = { x: top.x, y: top.y, side: 'top', leader: null };
    }
    tags.set(item.id, chosen);
  }

  const foldCount = new Map<string, number>(placed.map(entry => [entry.item.id, entry.folded]));
  for (const item of sorted) {
    if (item.tagObstacleOnly) continue;
    const reason = hidden.get(item.id) ?? null;
    const scale = scales.get(item.id) ?? 1;
    const host = foldedInto.get(item.id);
    out.set(item.id, {
      visible: reason === null,
      scale: reason === null ? scale : 1,
      dim: reason === null && (scale < 1 || !!item.forceRecede),
      folded: foldCount.get(item.id) ?? 0,
      foldedInto: host ? host.item.id : null,
      ...(item.tag ? { tag: reason === null ? (tags.has(item.id) ? tags.get(item.id)! : tagCandidateDefault(item, scale)) : null } : {}),
      reason,
    });
  }
  return out;
}

/** Off-screen markers keep their tag in the default slot until the next pass. */
function tagCandidateDefault(item: LayoutItem, scale: number): TagPlacement {
  const body: Rect = { x: item.body.x * scale, y: item.body.y * scale, w: item.body.w * scale, h: item.body.h * scale };
  const top = tagCandidates(body, item.tag!.w, item.tag!.h)[0];
  return { x: top.x, y: top.y, side: 'top', leader: null };
}

export function samePlacement(a: Placement | undefined, b: Placement | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.visible !== b.visible || a.scale !== b.scale || a.dim !== b.dim || a.folded !== b.folded || a.foldedInto !== b.foldedInto) return false;
  const ta = a.tag, tb = b.tag;
  if (ta === tb) return true;
  if (!ta || !tb) return false;
  return Math.round(ta.x) === Math.round(tb.x) && Math.round(ta.y) === Math.round(tb.y) && ta.side === tb.side;
}

/** Inset rects anchored to view edges, resolved for a view size. */
export interface EdgeInset {
  readonly left?: number; readonly right?: number; readonly top?: number; readonly bottom?: number;
  readonly width: number; readonly height: number;
}

export function resolveInsets(insets: readonly EdgeInset[], width: number, height: number): Rect[] {
  return insets.map(inset => {
    // A width or height past the view (e.g. 9999) spans it.
    const w = Math.min(inset.width, width);
    const h = Math.min(inset.height, height);
    return {
      x: inset.left !== undefined ? inset.left : inset.right !== undefined ? width - inset.right - w : 0,
      y: inset.top !== undefined ? inset.top : inset.bottom !== undefined ? height - inset.bottom - h : 0,
      w, h,
    };
  });
}
