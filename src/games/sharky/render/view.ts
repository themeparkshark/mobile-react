/**
 * The fixed Sharky view (design 3.2): every device sees exactly 960 x 1000u
 * of course. k = fieldWidth / 960; extra height becomes non-gameplay art bands
 * (sky above the surface, sand below the floor). Fields wider than 0.96:1 are
 * pillarboxed so no device ever sees more course than another.
 */

export const VIEW_W = 960;
export const VIEW_H = 1000;

export interface SharkyLayout {
  /** Field size (pt). */
  w: number;
  h: number;
  /** pt per world unit. */
  k: number;
  /** Top-left of the 960 x 1000 view in the field (pt). */
  offX: number;
  offY: number;
  /** Sky band height above the view (pt) and sand band below it. */
  skyH: number;
  sandTop: number;
  sandH: number;
  /** Visible course (u): always 960 x 1000. */
  visibleW: number;
  visibleH: number;
}

export function sharkyLayout(w: number, h: number): SharkyLayout {
  'worklet';
  const k = Math.min(w / VIEW_W, h / VIEW_H);
  const viewW = VIEW_W * k;
  const viewH = VIEW_H * k;
  const extra = Math.max(0, h - viewH);
  // Sky gets a little more: name pills, the tide bar and callouts live there.
  const skyH = Math.round(extra * 0.56);
  const offX = (w - viewW) / 2;
  const offY = skyH;
  const sandTop = offY + viewH;
  return { w, h, k, offX, offY, skyH, sandTop, sandH: Math.max(0, h - sandTop), visibleW: VIEW_W, visibleH: VIEW_H };
}

/** World view units to field points. */
export function toField(l: SharkyLayout, vx: number, vy: number): { x: number; y: number } {
  'worklet';
  return { x: l.offX + vx * l.k, y: l.offY + vy * l.k };
}
