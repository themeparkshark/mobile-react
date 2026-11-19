/**
 * Fix pass w5 (T036): warm a ride's game art while its coin card is up, so PLAY's board draws from memory.
 * Whack's board decodes about 40 images on the JS thread the first time a theme is played (about 2 s on device,
 * image by image, each one re-rendering the board); decoded ahead, the board is drawn on its first render.
 * Once per theme per app run, one image per frame, and never while the card is closed.
 */
import { deckIdForRideName } from '../services/rideTheme';
import { THEMED_SHARK_FRAMES, type WhackTheme } from './whack/assets';
import { warmBoardImages } from './whack/render/WhackBoard';

const warmed = new Map<WhackTheme, Promise<void>>();

/** The Whack theme a ride plays in (WhackAShark's own rule for a ride try). */
export function whackThemeForRide(taskName: string | null | undefined): WhackTheme {
  const deck = deckIdForRideName(taskName ?? '');
  return (deck in THEMED_SHARK_FRAMES ? deck : 'park') as WhackTheme;
}

/** Start warming this ride's game art (safe to call on every open; a theme decodes once). */
export function warmRideGameArt(taskName: string | null | undefined): Promise<void> {
  const theme = whackThemeForRide(taskName);
  let p = warmed.get(theme);
  if (!p) {
    p = warmBoardImages(theme).catch(() => undefined);
    warmed.set(theme, p);
  }
  return p;
}
