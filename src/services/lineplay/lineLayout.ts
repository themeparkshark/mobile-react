/**
 * LinePlay screen fit. Pure, unit tested (tools/tests/lineplay-layout-fit.test.cjs).
 *
 * The activity pages scroll inside the space between the wait card and the
 * STORY / Next rail. On a short phone (iPhone SE) that space was a sliver, so
 * the rail seemed to sit on the mission header. A short screen gets a smaller
 * coin and tighter gaps. Each page is a framed window (PageScroll) that stays
 * put above the rail while its content scrolls inside.
 */
import type { GameIconName } from '../../ui/iconNames';

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
/** The small 1 2 3 bubbles row under the strip (30 pt badges in a 40 pt row) and the gap above it. */
export const STRIP_TRAIL_ROW = 40;
export const STRIP_TRAIL_GAP = 6;
/** The strip page has room for the bubbles under it (padding 5 top and bottom). */
export function stripTrailFits(viewHeight: number): boolean {
  return viewHeight >= 5 * 2 + CHAPTER_STRIP + STRIP_TRAIL_GAP + STRIP_TRAIL_ROW;
}

/** The strip with its name and the 3 mini bubbles (16 pt on a 20 pt navy capsule) under it, inside the gold button. */
export const STRIP_WITH_DOTS = 68;
/** Too short for the bubbles row, tall enough for the mini bubbles inside the strip (Details open on an SE). */
export function stripDotsFit(viewHeight: number): boolean {
  return viewHeight >= 5 * 2 + STRIP_WITH_DOTS;
}

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
 * What the one rail button does while the window has stepped aside. A kid who pressed pause
 * reads "Tap play when you're ready", so the button is Play: one tap resumes and brings the
 * games back. Any other time it just shows the games again ('show', no play triangle).
 */
export type RailBackAction = 'play' | 'show';
export function railBackAction(state: string, pauseReason: string | null | undefined): RailBackAction {
  return state === 'paused' && pauseReason === 'manual' ? 'play' : 'show';
}

/**
 * Details open or close: the page window dips to this opacity (never to 0, so
 * no frame shows an empty window), takes its new size, then fades back up.
 * Dip, the two-frame wait for the new layout and the rise stay near 200 ms.
 */
export const PAGES_DIP_OPACITY = 0.84;
export const PAGES_DIP_MS = 40;
export const PAGES_RISE_MS = 100;
/** If the window's size did not change (no onLayout), it rises after this. */
export const PAGES_RISE_FALLBACK_MS = 40;
/** The UI thread starts the rise after at most this long at the dim, whatever the JS thread is doing. */
export const PAGES_DIM_HOLD_MAX_MS = 60;

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
 * the page shows its header and one PLAY strip instead of a board
 * with a row peeking under the fade. Before layout it assumes the board fits.
 */
/** The PLAY strip page keeps the mission header above its strip when the page has this much room. */
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
 * scrolling. Room around it is kept thin so the tiles get the height: the
 * card's padding (2 top and bottom) and the panel's rims and padding (3 + 1), so
 * an iPhone SE's tiles are at least 44 pt, the size a 7-year-old's finger needs.
 */
export const BESIDE_CARD_PAD_V = 2;
export const BESIDE_PANEL_PAD_V = 1;
export const BESIDE_V = BESIDE_CARD_PAD_V * 2 + (3 + BESIDE_PANEL_PAD_V) * 2;
/** Gap between beside tiles; each tile's touch area reaches half of it, so a finger in a gap still turns a tile. */
export const BESIDE_TILE_GAP = 3;
/** The panel's sides: rims plus padding wide enough for the ports (19 pt each side). */
const BESIDE_PANEL_SIDES = (3 + 22) * 2;
/** The header column ("Fix the signal", the stars and the clue button) needs this much width. */
export const BESIDE_COLUMN = 122;
/** The smallest board beside its header: 3 tiles of about 30 pt each. */
export const BESIDE_FLOOR = 100;
/** "Tap a tile to turn it." on one line across the page, above the board and its column. */
export const BESIDE_STATUS_ROW = 24;

function besideByWidth(viewport: { width: number }): number {
  return viewport.width - 8 * 2 - 8 - BESIDE_COLUMN - BESIDE_PANEL_SIDES;
}

/**
 * The status goes on its own line above the board when the page has height to spare (the board
 * is held back by the width, a 17 Pro or a Pro Max), so the column only holds the title and
 * nothing wraps. A short page (an iPhone SE) keeps every point for the tiles.
 */
export function besideStatusRow(viewport: { width: number; height: number }): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return false;
  return viewport.height - BESIDE_V - BESIDE_STATUS_ROW >= Math.min(300, besideByWidth(viewport));
}

export function boardBesideSide(viewport: { width: number; height: number }): number {
  const byHeight = viewport.height - BESIDE_V - (besideStatusRow(viewport) ? BESIDE_STATUS_ROW : 0);
  return Math.floor(Math.min(300, byHeight, besideByWidth(viewport)));
}

/** A tile's side on a board of this side (3 tiles, two gaps). */
export function besideTileSide(boardSide: number, size = 3): number {
  return (boardSide - BESIDE_TILE_GAP * (size - 1)) / size;
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
 * - 'strip': Details is open and neither fits: one PLAY strip.
 * Before layout it assumes 'top', so nothing jumps.
 */
export type NavBoardLayout = 'top' | 'beside' | 'strip';
export function navBoardLayout(viewport: { width: number; height: number }, headerHeight: number,
  detailsOpen: boolean): NavBoardLayout {
  if (viewport.width <= 0 || viewport.height <= 0) return 'top';
  const top = boardFits(viewport, headerHeight) ? boardSideFor(viewport, headerHeight) ?? 0 : 0;
  const beside = boardBesideSide(viewport);
  // Too short for both: with Details open, the PLAY strip. With Details closed this is only
  // the moment the page slides in before the crew row's room arrives: keep the beside layout (the
  // board at its floor) so it just grows, never a one-row board in the wrong layout.
  if (beside < BESIDE_FLOOR) return top > 0 ? 'top' : detailsOpen ? 'strip' : 'beside';
  return top >= beside ? 'top' : 'beside';
}

/**
 * The page is still growing into its room (on an iPhone SE the crew row's room arrives a frame or
 * two after the board page slides in): too short for the beside board with Details closed. The
 * board stays unseen until its final size, then fades in, so no small board or stale arrow shows.
 */
export function navBoardSettling(layout: NavBoardLayout, viewport: { width: number; height: number },
  detailsOpen: boolean): boolean {
  return layout === 'beside' && !detailsOpen && viewport.width > 0 && viewport.height > 0
    && boardBesideSide(viewport) < BESIDE_FLOOR;
}
/** A page that never grows (no crew row to lend) shows its board after this anyway. */
export const NAV_SETTLE_MAX_MS = 350;
/** The board's fade in once it has its final size. */
export const NAV_SETTLE_FADE_MS = 120;

/**
 * The crew row ("Here with friends?") lends its room to a board page on a short
 * phone, as it does while Details is open, so the whole puzzle fits beside its
 * header with no scrolling. It is back on every other page.
 */
export function crewRowLent(shortScreen: boolean, detailsOpen: boolean, boardPage: boolean): boolean {
  return shortScreen && (detailsOpen || boardPage);
}

/** The page frame around a page's scroll view: its bottom margin (10) and white rims (3 top, 3 bottom). */
export const PAGE_FRAME_V = 10 + 3 * 2;

/**
 * The board page's scroll height once the crew row has lent its room on a short phone with Details
 * closed, from the last window measurement (taken lent or not) and the row's height. Undefined when
 * no lending is coming (a tall phone, Details open) or nothing is measured yet.
 */
export function lentBoardViewport(shortScreen: boolean, detailsOpen: boolean, pagesHeight: number,
  measuredLent: boolean, crewRowHeight: number): number | undefined {
  if (!shortScreen || detailsOpen || !(pagesHeight > 0)) return undefined;
  if (!measuredLent && !(crewRowHeight > 0)) return undefined;
  return pagesHeight + (measuredLent ? 0 : crewRowHeight) - PAGE_FRAME_V;
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

/** The chapter's 3 clue page ids, in order (trivia, field note, finale). */
export function chapterMissionIds(chapter: { readonly id: string; readonly finale: { readonly idSuffix: string } }): string[] {
  return [`${chapter.id}-trivia`, `${chapter.id}-field-note`, `${chapter.id}-${chapter.finale.idSuffix}`];
}

/** What the chapter page's PLAY NOW opens: the first unplayed clue, then the crew relay, then Crew Prompts. */
export function chapterPlayNow(chapter: {
  readonly id: string; readonly missionNames: readonly string[];
  readonly finale: { readonly idSuffix: string }; readonly relay: { readonly title: string };
}, completedIds: ReadonlySet<string>): { readonly id: string; readonly name: string; readonly done: number } {
  const missionIds = chapterMissionIds(chapter);
  const done = missionIds.filter(id => completedIds.has(id)).length;
  const next = missionIds.findIndex(id => !completedIds.has(id));
  if (next >= 0) return { id: missionIds[next], name: chapter.missionNames[next] ?? '', done };
  const relayId = `${chapter.id}-crew-relay`;
  return completedIds.has(relayId)
    ? { id: `${chapter.id}-crew-grid`, name: 'Crew Prompts', done }
    : { id: relayId, name: chapter.relay.title, done };
}

/**
 * The rail's Next on the chapter page skips the page PLAY NOW opens, so two buttons on one
 * screen never open the same game under two names. Elsewhere it is simply the next page.
 */
export function railNextIndex(pageIds: readonly string[], visibleIndex: number, playNowId: string | null): number {
  const count = pageIds.length;
  if (count === 0) return 0;
  const step = (index: number) => (index + 1 < count ? index + 1 : 0);
  const next = step(visibleIndex);
  if (playNowId == null || count <= 2 || pageIds[next] !== playNowId) return next;
  return step(next);
}

/** Below this screen width (an iPhone SE is 375) the rail's Next button is too narrow for "Next: " plus a mission name. */
export const RAIL_NARROW_WIDTH = 390;

/**
 * The words on the rail's Next button. A narrow phone drops the "Next:" prefix (the picture and the
 * arrow already say next) and lets the mission name take two lines at the normal size, so it never
 * shrinks to a small font. The spoken label always says "Next activity".
 */
export function railNextText(nextLabel: string, screenWidth: number): { readonly text: string; readonly lines: 1 | 2 } {
  return screenWidth > 0 && screenWidth < RAIL_NARROW_WIDTH
    ? { text: nextLabel, lines: 2 } : { text: `Next: ${nextLabel}`, lines: 1 };
}

/**
 * A small picture for each page, beside the rail's "Next: ..." so a kid who can't read yet still follows.
 * The magnifier is the clue page's alone: the board's hint button wears the "turn this tile" picture.
 */
export function railPageIcon(kind: string | undefined): GameIconName | undefined {
  switch (kind) {
    case 'chapter_intro': return 'map';
    case 'crew_grid': return 'sparkle';
    case 'circuit': return 'wrench';
    case 'crew_relay': return 'shark';
    case 'signal': return 'map';
    case 'puzzle': return 'lock';
    case 'trivia': return 'info';
    case 'lore': return 'search';
    case 'prediction': return 'timer';
    case 'minigame': return 'star';
    default: return undefined;
  }
}

/** The wait card's top row (ride name, ARCADE, pause) and its bottom row (Details), measured on an iPhone SE. */
export const WAIT_CARD_TOP_ROW = 56;
export const WAIT_CARD_DETAILS_ROW = 42;
/** A queue toast's height with a two-line body, and the slim one-line toast (the one LinePlay uses). */
export const QUEUE_TOAST_H = 86;
export const QUEUE_TOAST_SLIM_H = 54;
/**
 * Where a queue toast lands: just under the wait card, in the crew row's slot (that row fades while the toast is
 * up), as the slim one-line toast. Never inside the card: on a short card its middle band IS the stat row
 * (SIGN SAYS, IN LINE), and the one number a kid or parent is watching must never be covered (honesty, wave 6).
 * Never over the header either. Before the card is measured: null (the default spot).
 */
export function queueToastSpot(cardTop: number | null, cardBottom: number | null): { top: number; slim: boolean } | null {
  if (cardTop == null || cardBottom == null || cardBottom <= cardTop) return null;
  return { top: cardBottom + 6, slim: true };
}

/**
 * A page window this short (an iPhone SE with the crew row showing) shows a slim one-row banner, and a clue
 * page leads with what to do (its prompt and first choice) before the story, so a non-reader sees an action
 * without scrolling. 0 (not measured yet) keeps the full banner.
 */
export const HERO_SLIM_PAGE = 240;
export function heroSlim(viewHeight: number): boolean {
  return viewHeight > 0 && viewHeight < HERO_SLIM_PAGE;
}
