import { createContext, useContext } from 'react';

/**
 * Set while a mounted game waits off stage: under the ride's ticket punch, or under its how-to card on a
 * first play (fix round w4, T036 and N04). The game mounts, loads its art and draws its board, so the
 * board is on screen the moment the punch or the card hands over; the shell holds its count, and the game
 * holds its music, deal sounds, intro barker and autoplay until the hold ends. Never set in a game's normal
 * open, so every other path behaves as before.
 */
export const StageHoldContext = createContext<boolean>(false);

/** True while the game waits off stage (see StageHoldContext). */
export function useStageHold(): boolean {
  return useContext(StageHoldContext);
}

/**
 * Fix round w4 (N04, T036): told once when a held game's stage art is drawn, so the ride's ticket punch can hand
 * over the moment the board is really on screen (a short punch on TRY AGAIN, never a blank page after it).
 * Null outside a ride challenge's punch.
 */
export const StageDrawnContext = createContext<(() => void) | null>(null);
