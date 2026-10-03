/**
 * Geometry for the Fin-ister intro art. Pure, unit tested (fright-r3).
 */

/** The Case File prop (card-case-file.webp, 480x693): where its blank nameplate sits, as fractions of the image. */
export const CASE_FILE_PLATE = { aspect: 480 / 693, top: 0.69, bottom: 0.78, left: 0.094, right: 0.906 } as const;

/** The nameplate rectangle for the Case File image drawn contain-fit in a `box` x `box` square. */
export function casePlateRect(box: number): { left: number; top: number; width: number; height: number } {
  const imageWidth = box * CASE_FILE_PLATE.aspect;
  const x0 = (box - imageWidth) / 2;
  return {
    left: x0 + imageWidth * CASE_FILE_PLATE.left,
    top: box * CASE_FILE_PLATE.top,
    width: imageWidth * (CASE_FILE_PLATE.right - CASE_FILE_PLATE.left),
    height: box * (CASE_FILE_PLATE.bottom - CASE_FILE_PLATE.top),
  };
}

/**
 * The cinematic lantern glow: offset toward the lantern (to the right of the
 * angler) but always fully inside the screen with an 8 pt margin (SE included).
 * `box` is the centred square that holds the angler. Returns the glow size and
 * its left offset relative to that box.
 */
export function cinematicGlow(screenWidth: number, box: number, wanted: number, offset: number,
  margin = 8): { size: number; left: number } {
  const size = Math.min(wanted, screenWidth - margin * 2);
  const boxLeft = (screenWidth - box) / 2;
  const centredLeft = (box - size) / 2 + offset;
  const minLeft = margin - boxLeft;
  const maxLeft = screenWidth - margin - size - boxLeft;
  return { size, left: Math.max(minLeft, Math.min(maxLeft, centredLeft)) };
}
