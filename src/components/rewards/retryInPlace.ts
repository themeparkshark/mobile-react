/**
 * TRY AGAIN on the kept board (fix pass w5, N04). Pure rules, tested without a device.
 *
 * After a lost ride try the game stays mounted, hidden and held under the loss card. TRY AGAIN of the same game
 * bumps the try number (RetryRoundContext): the shell and the game reset in place, the board shows at once (held,
 * nothing counting) and its 2-1-GO runs the moment the server deals the new try. Mounting a new game cost 2.5 s
 * of board drawing on device; the kept board is live in well under a second after the deal.
 */
import { STAGE_HOLD_GAMES } from '../../gamekit/stageHold';

/** A kept board is let go after this long on the loss card (a phone left on the card goes quiet). */
export const KEEP_BOARD_MS = 45_000;

/** The flow states the kept board stays mounted through. */
export const KEPT_BOARD_STATES: readonly string[] = ['spinning', 'minigame', 'postwin', 'lost', 'replay'];

export interface RetryInPlaceInput {
  /** The card is on the loss card (TRY AGAIN pressed from it). */
  readonly flowState: string;
  /** The game mounted under the loss card, or null. */
  readonly keptGame: string | null;
  /** The kept board is still held (not let go after KEEP_BOARD_MS). */
  readonly keepBoard: boolean;
  /** The game the server says TRY AGAIN deals when it differs from the one lost (retry_game, T232), else null. */
  readonly nextGame: string | null;
}

/** TRY AGAIN can reset the kept board in place (else the ticket punch mounts the dealt game, as before). */
export function canRetryInPlace(i: RetryInPlaceInput): boolean {
  return i.flowState === 'lost' && i.keepBoard && !!i.keptGame && STAGE_HOLD_GAMES.includes(i.keptGame) && !i.nextGame;
}

/**
 * Where a dealt try goes. A kept board waiting for its deal ('replay') goes straight to play when the server dealt
 * the same game; any other game (or an unknown one) takes the ticket punch, which mounts it fresh.
 */
export function flowAfterDeal(i: { readonly replay: boolean; readonly keptGame: string | null; readonly dealtGame: string | null | undefined; readonly known: boolean }): 'minigame' | 'spinning' | 'wheel' {
  if (!i.known) return 'wheel';
  if (i.replay && !!i.keptGame && i.dealtGame === i.keptGame) return 'minigame';
  return 'spinning';
}
