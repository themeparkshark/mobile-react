/**
 * Where the LEAVE GIFT kiosk sits on the Community Center art, for any phone width.
 *
 * The background art is sized to the screen width, and its painted kiosk (the price plaque
 * with a single painted coin, and an empty green button slot) runs to 0.995 of the art's width,
 * so a button laid on the painted slot sat 4 to 5 pt from the right edge on every phone.
 * The art cannot move without new art, so a kiosk face drawn in the kiosk's own slate color
 * covers the painted price and slot, and on it sit our price (the coin stack, the coin you
 * spend everywhere) and a LEAVE GIFT button that ends 16 pt from the screen edge.
 */

/** The painted kiosk, as fractions of the art (measured on the first video frame, 964 x 2144). */
export const PAINTED_SLOT = { left: 0.732, right: 0.995, top: 0.754, bottom: 0.790 } as const;
export const PAINTED_PRICE = { left: 0.745, right: 0.94, top: 0.713, bottom: 0.745 } as const;

/** The drawn kiosk face: a little past the painted price and slot on every side. */
export const KIOSK_FACE = { left: 0.700, top: 0.706, bottom: 0.802 } as const;

/** The slate of the painted kiosk face, its dark edge, and the soft top light Alex paints on stone. */
export const KIOSK_COLORS = { face: '#3a3e45', edge: '#1f2226', light: 'rgba(255,255,255,0.14)' } as const;

export const LEAVE_GIFT_ART_ASPECT = 842 / 375;
export const SCREEN_GUTTER = 16;
const FACE_PAD = 8;

export interface KioskLayout {
  /** The drawn face, in the art's frame (it runs past the right screen edge, like the painted kiosk). */
  readonly face: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly button: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  /** The price row, centered over the button. */
  readonly price: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

export function kioskLayout(screenWidth: number, artHeight: number): KioskLayout {
  const faceLeft = Math.round(screenWidth * KIOSK_FACE.left);
  const faceTop = Math.round(artHeight * KIOSK_FACE.top);
  const faceHeight = Math.round(artHeight * (KIOSK_FACE.bottom - KIOSK_FACE.top));
  const buttonRight = screenWidth - SCREEN_GUTTER;
  const buttonLeft = faceLeft + FACE_PAD;
  const buttonWidth = Math.round(buttonRight - buttonLeft);
  const buttonHeight = Math.round(buttonWidth / LEAVE_GIFT_ART_ASPECT);
  const buttonTop = faceTop + faceHeight - FACE_PAD + 2 - buttonHeight;
  const priceTop = faceTop + 4;
  return {
    face: { left: faceLeft, top: faceTop, width: screenWidth - faceLeft + 24, height: faceHeight },
    button: { left: buttonRight - buttonWidth, top: buttonTop, width: buttonWidth, height: buttonHeight },
    price: { left: buttonLeft, top: priceTop, width: buttonWidth, height: Math.max(20, buttonTop - priceTop - 2) },
  };
}
