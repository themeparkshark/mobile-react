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

/** The most a short results card zooms the scene (the sharks stay inside the screen edges). */
export const TAKEOVER_ZOOM_MAX = 1.16;
/** Sky the dropped scene may leave above it, as a share of the field height, before it zooms. */
export const TAKEOVER_SKY_OK = 0.1;
/** Where the scene zooms from (Stage's camera origin, as a share of the band height). */
export const TAKEOVER_ZOOM_ORIGIN = 0.75;

/**
 * Results takeover zoom (pure, testable). A short card (a ride miss, a loss)
 * drops the scene a long way, which left about a third of the screen as
 * empty sky above the arch. The scene zooms in a little (capped) around the
 * podiums, so the arch and the sharks fill that space while the podiums
 * still stand on the card. A tall card drops less and never zooms.
 */
export function takeoverZoom(input: TakeoverInput): number {
  const drop = takeoverDrop(input);
  const extra = drop - TAKEOVER_SKY_OK * input.H;
  if (extra <= 0 || input.band <= 0) return 1;
  const z = 1 + extra / (TAKEOVER_ZOOM_ORIGIN * input.band);
  return Math.round(Math.min(TAKEOVER_ZOOM_MAX, z) * 1000) / 1000;
}
