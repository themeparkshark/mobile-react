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
/**
 * Header (100) + gap + PLAY NOW with its hint line (about 112) + gap + the named
 * trail (about 76) + padding + the fade, so the trail ends whole above the fade.
 * Shorter (a Pro Max page is about 364) leads with PLAY NOW instead.
 */
export const CHAPTER_FULL_PAGE = 400;
/**
 * The 64 pt PLAY NOW card + padding + the fade, plus enough of the header that it
 * reads as a header melting into the mist, never a title sliced mid-line. Below
 * this (an iPhone SE, Details open or closed) the page is the one-row strip, so
 * the SE closed page is always the same layout.
 */
export const CHAPTER_COMPACT_PAGE = 130;
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

/**
 * A board BESIDE its header (an iPhone SE, or a 17 Pro reading Details): the
 * header becomes a column on the left and the board takes the page's whole
 * height on the right, so the whole puzzle and both ports are on screen with no
 * scrolling. Room around it: the card's padding (8 top and bottom) and the
 * panel's rims and padding (3 + 6, top and bottom).
 */
const BESIDE_V = 8 * 2 + (3 + 6) * 2;
/** The panel's sides: rims plus padding wide enough for the ports (19 pt each side). */
const BESIDE_PANEL_SIDES = (3 + 22) * 2;
/** The header column ("Repair the signal", the stars and the clue button) needs this much width. */
export const BESIDE_COLUMN = 128;
/** The smallest board beside its header: 3 tiles of about 30 pt each. */
export const BESIDE_FLOOR = 100;

export function boardBesideSide(viewport: { width: number; height: number }): number {
  const byHeight = viewport.height - BESIDE_V;
  const byWidth = viewport.width - 8 * 2 - 8 - BESIDE_COLUMN - BESIDE_PANEL_SIDES;
  return Math.floor(Math.min(300, byHeight, byWidth));
}

/** The board side the beside layout draws: never under the floor (a page still growing just scrolls a little). */
export function boardBesideDrawn(viewport: { width: number; height: number }): number {
  return Math.max(BESIDE_FLOOR, boardBesideSide(viewport));
}

/**
 * How the navigation page lays out its board, from the room it really has. The
 * layout with the bigger whole board wins (bigger tiles are easier to hit):
 * - 'top': the header, then the whole board under it (roomy pages).
 * - 'beside': the header is a column beside the board (short pages: an iPhone SE,
 *   a 17 Pro, or any phone reading Details).
 * - 'strip': Details is open and neither fits: one "Tap to play" strip.
 * Before layout it assumes 'top', so nothing jumps.
 */
export type NavBoardLayout = 'top' | 'beside' | 'strip';
export function navBoardLayout(viewport: { width: number; height: number }, headerHeight: number,
  detailsOpen: boolean): NavBoardLayout {
  if (viewport.width <= 0 || viewport.height <= 0) return 'top';
  const top = boardFits(viewport, headerHeight) ? boardSideFor(viewport, headerHeight) ?? 0 : 0;
  const beside = boardBesideSide(viewport);
  // Too short for both: with Details open, the "Tap to play" strip. With Details closed this is only
  // the moment the page slides in before the crew row's room arrives: keep the beside layout (the
  // board at its floor) so it just grows, never a one-row board in the wrong layout.
  if (beside < BESIDE_FLOOR) return top > 0 ? 'top' : detailsOpen ? 'strip' : 'beside';
  return top >= beside ? 'top' : 'beside';
}

/**
 * The crew row ("Here with friends?") lends its room to a board page on a short
 * phone, as it does while Details is open, so the whole puzzle fits beside its
 * header with no scrolling. It is back on every other page.
 */
export function crewRowLent(shortScreen: boolean, detailsOpen: boolean, boardPage: boolean): boolean {
  return shortScreen && (detailsOpen || boardPage);
}

/**
 * The page window stepped aside (Details open on a short phone): the rail stays
 * at its usual bottom spot, so a thumb finds "Back to games" where Next was, and
 * the crew row comes back into the space between Details and the rail when it fits.
 */
export function crewRowInBand(bandHeight: number, crewRowHeight: number): boolean {
  return crewRowHeight > 0 && bandHeight >= crewRowHeight + 12;
}

/**
 * The page's first screen ends on whole blocks: when the block after the fold
 * would be cut by the window's bottom (a sliver peeking into the fade), it
 * starts just below the window instead, and the "more below" arrow points at
 * it. Returns that block's top margin.
 */
export function foldGap(viewHeight: number, foldBottom: number, nextHeight: number, normalGap: number): number {
  if (!(viewHeight > 0) || !(foldBottom > 0) || foldBottom > viewHeight) return normalGap;
  if (nextHeight > 0 && foldBottom + normalGap + nextHeight <= viewHeight - fadeHeight(viewHeight)) return normalGap;
  return Math.max(normalGap, Math.ceil(viewHeight - foldBottom) + 2);
}
