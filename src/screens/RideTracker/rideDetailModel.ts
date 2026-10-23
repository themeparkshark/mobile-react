// Ride Detail layout and copy rules. Pure, so tests can load it without the screen.

/** Before the title is measured, ride names this long or shorter are the header title. */
export const HEADER_TITLE_MAX = 16;
/** Header row: 12 pt padding each side, the 35 pt back button, the 44 pt star, two 8 pt gaps. */
export const HEADER_SIDE_SPACE = 12 * 2 + 35 + 44 + 8 * 2;
/** The header title may shrink this much to fit; past that the name moves into the ride card. */
export const HEADER_MIN_SCALE = 0.86;
/** With this few logs, the community card is one row instead of a five-bar chart. */
export const COMPACT_COMMUNITY_LOGS = 3;

/** Does a title of this natural width fit the header (allowing a small shrink)? */
export function titleFitsHeader(naturalWidth: number, screenWidth: number): boolean {
  return naturalWidth * HEADER_MIN_SCALE <= screenWidth - HEADER_SIDE_SPACE;
}

/** A rating for a tile: 4.67 -> "4.7", 5 -> "5", none -> "--". */
export function scoreText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return '--';
  return String(Math.round(Number(value) * 10) / 10);
}
