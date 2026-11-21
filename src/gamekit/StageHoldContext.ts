import { createContext, useContext, useEffect, useRef } from 'react';

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

/**
 * Fix pass w5 (N04): the ride try number on a board that stays mounted. TRY AGAIN of the same game keeps the last
 * board on screen and bumps this instead of mounting a new game: the shell and the game reset in place (score,
 * clocks, seed, combos, hit boxes, the results lock), so the next try is live in well under a second. 0 outside a
 * ride challenge and on a try's first mount; a game resets only when it changes after its mount.
 */
export const RetryRoundContext = createContext<number>(0);

/**
 * Fix pass w5 (N04): false while TRY AGAIN's kept board is on screen and counting but the server has not dealt the
 * new try yet. The board takes taps and counts 2-1-GO at once; the shell opens play (GO's onStart) only once this is
 * true again, so the try always plays the dealt seed and rules. True everywhere else.
 */
export const StageDealtContext = createContext<boolean>(true);

/**
 * Told each time a round really starts on screen (the shell's GO: after the how-to card, the punch and the 3 2 1),
 * once per try. The ride challenge uses it as the exact began mark (arcade plan T6) and as the try's clock start, so
 * a TRY AGAIN's elapsed time never includes the try before it (RIDE_PARTS_BUGS 5). Null outside a ride challenge.
 */
export const RoundStartContext = createContext<(() => void) | null>(null);

/** The ride try number (see RetryRoundContext). */
export function useRetryRound(): number {
  return useContext(RetryRoundContext);
}

/**
 * Runs `reset` once each time the retry round changes after the first render (never on mount), in the same commit
 * as the shell's own reset. The latest `reset` is used, so a game's new seed (dealt with the retry) is read.
 */
export function useOnRetryRound(reset: () => void): void {
  const round = useRetryRound();
  const last = useRef(round);
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    if (round === last.current) return;
    last.current = round;
    resetRef.current();
  }, [round]);
}
