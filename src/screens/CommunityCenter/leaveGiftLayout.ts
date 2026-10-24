/**
 * Where the LEAVE GIFT kiosk sits on the Community Center art, for any phone width.
 *
 * The background art is sized to the screen width, and its painted kiosk (the price plaque
 * with a single painted coin, and an empty green button slot) runs to 0.995 of the art's width,
 * so a button laid on the painted slot sat 4 to 5 pt from the right edge on every phone.
 * The art cannot move without new art, so the game's own warm-white price plaque covers the painted
 * price and slot (14 pt from the screen edge), and on it sit our price (the coin stack, the coin you
 * spend everywhere) and the LEAVE GIFT pill, centered with 8 pt on each side.
 */

/** The painted kiosk, as fractions of the art (measured on the first video frame, 964 x 2144). */
export const PAINTED_SLOT = { left: 0.732, right: 0.995, top: 0.754, bottom: 0.790 } as const;
export const PAINTED_PRICE = { left: 0.745, right: 0.94, top: 0.713, bottom: 0.745 } as const;

/**
 * The kiosk plaque: the game's own warm-white price card with a thick navy rim (like the HUD cards
 * and the favorites toast), laid on Alex's pedestal over the painted price and slot. It keeps a
 * 14 pt gutter from the screen edge like every card in the game, and LEAVE GIFT sits centered in it.
 */
export const KIOSK_FACE = { left: 0.67, top: 0.706, bottom: 0.818 } as const;

/**
 * The painted kiosk's dark face runs past the plaque to the art's edge. A strip in that same dark
 * paint, tucked under the plaque, hides the last bit of the painted green slot in the gutter, so
 * the gutter reads as the pedestal's shaded side, never a second green button.
 */
export const KIOSK_CAP = { top: PAINTED_PRICE.top - 0.004, bottom: PAINTED_SLOT.bottom + 0.004, tuck: 10 } as const;

/** The plaque's colors: warm-white card, navy rim and price, the dark paint of the side strip. Never dark slate on the plaque. */
export const KIOSK_COLORS = { face: '#fff7e6', edge: '#05346e', ink: '#05346e', side: '#2b2f35' } as const;

/** The LEAVE GIFT art (842 x 375) and the share of its height that is the green pill (its stone foot and gem are cropped). */
export const LEAVE_GIFT_ART_ASPECT = 842 / 375;
export const LEAVE_GIFT_PILL_SHARE = 0.685;
export const SCREEN_GUTTER = 16;
/** The plaque's own gutter from the screen edge. */
export const FACE_EDGE_INSET = 14;
/** LEAVE GIFT's padding inside the plaque, the same on the left and the right. */
export const FACE_PAD = 8;
const PRICE_H = 24;
const PRICE_GAP = 4;

export interface KioskLayout {
  /** The plaque, in the art's frame. */
  readonly face: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  /** The dark side strip from under the plaque to the screen edge (over the painted slot's end). */
  readonly cap: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  /** The visible button (the green pill); the art inside is taller and cropped at the bottom. */
  readonly button: { readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly artHeight: number };
  /** The price row, centered over the button. */
  readonly price: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

export function kioskLayout(screenWidth: number, artHeight: number): KioskLayout {
  const faceLeft = Math.round(screenWidth * KIOSK_FACE.left);
  const faceTop = Math.round(artHeight * KIOSK_FACE.top);
  const faceHeight = Math.round(artHeight * (KIOSK_FACE.bottom - KIOSK_FACE.top));
  const faceRight = screenWidth - FACE_EDGE_INSET;
  const buttonLeft = faceLeft + FACE_PAD;
  const buttonWidth = Math.round(faceRight - FACE_PAD - buttonLeft);
  const buttonArtHeight = Math.round(buttonWidth / LEAVE_GIFT_ART_ASPECT);
  const buttonHeight = Math.round(buttonArtHeight * LEAVE_GIFT_PILL_SHARE);
  // Price over button, centered in the plaque.
  const content = PRICE_H + PRICE_GAP + buttonHeight;
  const priceTop = faceTop + Math.max(FACE_PAD, Math.round((faceHeight - content) / 2));
  const buttonTop = priceTop + PRICE_H + PRICE_GAP;
  const capTop = Math.round(artHeight * KIOSK_CAP.top);
  return {
    face: { left: faceLeft, top: faceTop, width: faceRight - faceLeft, height: faceHeight },
    cap: { left: faceRight - KIOSK_CAP.tuck, top: capTop, width: screenWidth - faceRight + KIOSK_CAP.tuck, height: Math.round(artHeight * KIOSK_CAP.bottom) - capTop },
    button: { left: buttonLeft, top: buttonTop, width: buttonWidth, height: buttonHeight, artHeight: buttonArtHeight },
    price: { left: buttonLeft, top: priceTop, width: buttonWidth, height: PRICE_H },
  };
}
