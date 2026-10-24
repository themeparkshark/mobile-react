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

/**
 * The fade is at least about a third of a short page, so any row cut by the
 * frame's bottom dissolves into the mist instead of ending on a hard edge. Tall
 * pages keep the slim 26 pt fade.
 */
export function fadeHeight(viewHeight: number): number {
  if (!(viewHeight > 0)) return FRAME_FADE;
  return Math.round(Math.max(12, Math.min(FRAME_FADE, viewHeight * 0.35)));
}

/**
 * What the ride chapter's opening page leads with, from the height its frame
 * really has (it shrinks while Details is open):
 * - 'full': the mission header, then the big PLAY NOW card (tall pages).
 * - 'compact': PLAY NOW first (64 pt), then a one-line header (short phones, or Details open).
 * - 'strip': the page is only a one-row PLAY NOW strip that fits whole, so a
 *   kid never sees a button cut in half.
 * PLAY NOW is always fully on screen, above the fade.
 */
export type ChapterPageFit = 'full' | 'compact' | 'strip';
/** Header (100) + gap + PLAY NOW with its hint line (about 112) + padding + the fade. */
export const CHAPTER_FULL_PAGE = 262;
/** The 64 pt PLAY NOW card + padding + the fade under it. */
export const CHAPTER_COMPACT_PAGE = 112;
/** The one-row strip: 40 pt play icon, borders and padding. */
export const CHAPTER_STRIP = 54;

/**
 * The page window's smallest useful height: the strip plus the frame's rims,
 * padding and the gap above the rail. Below this (an iPhone SE reading Details)
 * the window is not drawn at all: a kid sees the Details lines and the STORY
 * rail, never an empty sliver or a button cut in half. Hide brings it back.
 */
export const PAGE_WINDOW_MIN = CHAPTER_STRIP + 3 * 2 + 10 + 4;

export function pageWindowShown(pagesHeight: number, detailsOpen = true): boolean {
  // Only Details squeezes the window this far, so with Details closed it always shows.
  if (!detailsOpen) return true;
  return !(pagesHeight > 0) || pagesHeight >= PAGE_WINDOW_MIN;
}

/**
 * The STORY rail while the page window has stepped aside (an iPhone SE reading
 * Details): its page buttons would act on a page nobody can see, so the rail is
 * one big "Back to games" button that closes Details and brings PLAY NOW back.
 */
export type PageRailMode = 'pages' | 'back';
export function pageRailMode(pagesShown: boolean): PageRailMode {
  return pagesShown ? 'pages' : 'back';
}

/**
 * Details open or close: the page window dips to this opacity (never to 0, so
 * no frame shows an empty window), takes its new size, then fades back up.
 * Dip plus rise stays under 220 ms.
 */
export const PAGES_DIP_OPACITY = 0.35;
export const PAGES_DIP_MS = 60;
export const PAGES_RISE_MS = 140;
/** If the window's size did not change (no onLayout), it rises after this. */
export const PAGES_RISE_FALLBACK_MS = 90;

export function chapterPageFit(viewHeight: number, shortScreen: boolean): ChapterPageFit {
  if (!(viewHeight > 0)) return shortScreen ? 'compact' : 'full';
  if (viewHeight < CHAPTER_COMPACT_PAGE) return 'strip';
  if (shortScreen || viewHeight < CHAPTER_FULL_PAGE) return 'compact';
  return 'full';
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
  'worklet';
  if (!(contentHeight > 0) || !(viewHeight > 0)) return false;
  return contentHeight - (Math.max(0, scrollY) + viewHeight) > 12;
}

/* Navigation panel board (NavigationPanelCard). */

/** A page shorter than this (an iPhone 17 Pro, or any phone with Details open) packs the board tighter. */
export const BOARD_TIGHT_PAGE = 340;
export function boardTight(viewHeight: number): boolean {
  return viewHeight > 0 && viewHeight < BOARD_TIGHT_PAGE;
}
/** Room above the board: card padding, the panel's gap, rim and padding (tight and roomy). */
const ABOVE_BOARD = { tight: 8 + 6 + 3 + 6, roomy: 12 + 10 + 3 + 12 };

/** The smallest board: on a short page (a 17 Pro, or Details open) the whole puzzle still fits without scrolling. */
export const BOARD_FLOOR = 110;

/**
 * The widest board that fits both the page width (ports stick out 19pt each
 * side) and the height left under the header, or null before layout.
 */
function boardByHeight(viewport: { width: number; height: number }, headerHeight: number): number {
  // The whole board sits above the page's bottom fade, so its last row is never hidden.
  const above = boardTight(viewport.height) ? ABOVE_BOARD.tight : ABOVE_BOARD.roomy;
  return viewport.height - fadeHeight(viewport.height) - headerHeight - above - 2;
}

export function boardSideFor(viewport: { width: number; height: number }, headerHeight: number): number | null {
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  const byWidth = viewport.width - (12 + 3) * 2 - (22 + 3) * 2;
  return Math.max(BOARD_FLOOR, Math.min(300, byWidth, boardByHeight(viewport, headerHeight)));
}

/**
 * The page is too short for even the smallest whole board (Details is open):
 * the page shows its header and one "Tap to play" strip instead of a board
 * with a row peeking under the fade. Before layout it assumes the board fits.
 */
/** The "Tap to play" page keeps the mission header above its strip when the page has this much room. */
export const NAV_STRIP_HEADER_PAGE = 140;
export function navStripHeader(viewHeight: number): boolean {
  return viewHeight >= NAV_STRIP_HEADER_PAGE;
}

export function boardFits(viewport: { width: number; height: number }, headerHeight: number): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return true;
  return boardByHeight(viewport, headerHeight) >= BOARD_FLOOR;
}
