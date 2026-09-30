/**
 * Label sizing for Dustin's image buttons (yellow_button.png, red_button.png).
 *
 * The originals set the label to 72pt and let adjustsFontSizeToFit shrink it,
 * so a short label ("CLOSE") filled the whole face while a long one on the
 * same button came out half the size, and the text touched the art's edges.
 * The fix ties the label size to the button's measured label area, so every
 * label on a button of one size matches. Long labels still shrink to fit.
 */

/** Share of the label area's height the Shark caps use. */
export const ART_BUTTON_TEXT_RATIO = 0.46;
/** Never render a label smaller than this before the shrink-to-fit pass. */
export const ART_BUTTON_MIN_FONT = 12;
/** The originals' starting size; also the ceiling. */
export const ART_BUTTON_MAX_FONT = 72;

/** Font size for a label area of this height (points). 0 means not measured yet. */
export function artButtonFontSize(labelAreaHeight: number): number {
  if (!(labelAreaHeight > 0)) return ART_BUTTON_MAX_FONT;
  const size = Math.round(labelAreaHeight * ART_BUTTON_TEXT_RATIO);
  return Math.min(ART_BUTTON_MAX_FONT, Math.max(ART_BUTTON_MIN_FONT, size));
}
