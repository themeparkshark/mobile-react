/**
 * Results takeover drop (pure, testable). The stage band is laid out at the
 * top of the field; on the results it drops until the bottom of the band
 * tucks just under the top of the real results card. The card hugs its
 * content, so its height is measured, never assumed: a short loss card and a
 * tall RANK UP card both get podiums standing right on the card, with no
 * wood, railing or flat sky between scene and card.
 */
export interface TakeoverInput {
  /** Field height. */
  H: number;
  /** Measured height of the results card (border box, ribbon not included). */
  cardH: number;
  /** Field y where the stage canvas starts. */
  stageTop: number;
  /** Height of the normal stage band (top of the canvas). */
  band: number;
  /** Full stage canvas height (the most the scene can drop is full - band). */
  full: number;
}

/** Space under the card inside the results root (paddingBottom). */
export const CARD_BOTTOM_PAD = 10;
/** How far the bottom of the band tucks under the card's top edge. */
export const CARD_TUCK = 22;

export function takeoverDrop({ H, cardH, stageTop, band, full }: TakeoverInput): number {
  const cardTop = H - CARD_BOTTOM_PAD - Math.max(0, cardH);
  const want = cardTop + CARD_TUCK - (stageTop + band);
  return Math.round(Math.max(0, Math.min(Math.max(0, full - band), want)));
}
