/**
 * LinePlay screen fit. Pure, unit tested (tools/tests/lineplay-layout-fit.test.cjs).
 *
 * The activity pages scroll inside the space between the wait card and the
 * STORY / Next rail. On a short phone (iPhone SE) that space was a sliver, so
 * the rail seemed to sit on the mission header. A short screen gets a smaller
 * coin and tighter gaps, and every page ends in a soft fade instead of a hard
 * cut through a line of text.
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

/** Fade height at the bottom of every activity page, above the rail. */
export const PAGE_EDGE_FADE = 22;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The screen background color at a point, `fraction` of the way down a
 * top-to-bottom gradient with evenly spaced stops (LinearGradient's default).
 * The page fade ends in exactly this color, so it melts into the water behind it.
 */
export function gradientColorAt(colors: readonly string[], fraction: number): [number, number, number] {
  if (colors.length === 0) return [0, 0, 0];
  if (colors.length === 1) return rgb(colors[0]);
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 1));
  const span = f * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(span));
  const t = span - i;
  const a = rgb(colors[i]);
  const b = rgb(colors[i + 1]);
  return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t)) as [number, number, number];
}

/** Transparent to solid, in the background color where the page ends. */
export function pageEdgeFade(colors: readonly string[], fraction: number): [string, string] {
  const [r, g, b] = gradientColorAt(colors, fraction);
  return [`rgba(${r},${g},${b},0)`, `rgba(${r},${g},${b},1)`];
}
