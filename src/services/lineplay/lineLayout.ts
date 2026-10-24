/**
 * LinePlay screen fit. Pure, unit tested (tools/tests/lineplay-layout-fit.test.cjs).
 *
 * The activity pages scroll inside the space between the wait card and the
 * STORY / Next rail. On a short phone (iPhone SE) that space was a sliver, so
 * the rail seemed to sit on the mission header. A short screen gets a smaller
 * coin and tighter gaps. Each page is a framed window (PageScroll) that stays
 * put above the rail while its content scrolls inside.
 */

/** Usable height (between the safe areas) under which the screen tightens up. iPhone SE is 647; the 17 Pro is 778. */
export const SHORT_LINE_SCREEN = 700;

export interface LineScreenFit {
  readonly short: boolean;
  /** The wait card's coin hero. */
  readonly coinSize: number;
  /** Gap above the activity pages. */
  readonly activityGap: number;
}

export function lineScreenFit(rootHeight: number, insetTop: number, insetBottom: number): LineScreenFit {
  const usable = rootHeight - Math.max(0, insetTop) - Math.max(0, insetBottom);
  const short = rootHeight > 0 && usable < SHORT_LINE_SCREEN;
  return short ? { short, coinSize: 92, activityGap: 4 } : { short, coinSize: 120, activityGap: 16 };
}

/** Fade height at the bottom of a page's frame while more is below. */
export const FRAME_FADE = 26;

/** A short page (iPhone SE) gets a shorter fade, so it never pales the card a kid is about to tap. */
export function fadeHeight(viewHeight: number): number {
  if (!(viewHeight > 0)) return FRAME_FADE;
  return Math.round(Math.max(10, Math.min(FRAME_FADE, viewHeight * 0.14)));
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The page's bottom fade: transparent, then solid over the last part, in a
 * near-white "mist" made from the frame's own fill. A card scrolling under it
 * just goes pale (yellow to cream, blue to sky). It never blends toward the dark
 * water, and never mixes yellow with blue into an olive band. It melts into the
 * frame's white rim right below it.
 */
export function frameFade(fill: string): { colors: [string, string, string]; locations: [number, number, number] } {
  const [r, g, b] = rgb(fill).map(c => Math.round(c + (255 - c) * FRAME_MIST)) as [number, number, number];
  return {
    colors: [`rgba(${r},${g},${b},0)`, `rgba(${r},${g},${b},1)`, `rgba(${r},${g},${b},1)`],
    locations: [0, 0.62, 1],
  };
}

/** How far the fade's color moves from the frame fill toward white. */
export const FRAME_MIST = 0.7;

/** More content below the visible part of a page (a few points of slack, so a page that just fits shows no arrow). */
export function moreBelow(contentHeight: number, viewHeight: number, scrollY: number): boolean {
  if (!(contentHeight > 0) || !(viewHeight > 0)) return false;
  return contentHeight - (Math.max(0, scrollY) + viewHeight) > 12;
}
