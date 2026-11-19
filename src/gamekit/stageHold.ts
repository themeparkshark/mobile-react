/**
 * Off-stage rules for a ride game (fix round w4, T036 and N04). Pure, so it is tested without a device.
 * A game that honors StageHoldContext is mounted and drawn under the ride's ticket punch (prewarm) and
 * under a first play's how-to card, so its board is on screen the moment either hands over.
 */

/** Games that hold their music, deal sounds and bots off stage (StageHoldContext). */
export const STAGE_HOLD_GAMES: readonly string[] = ['tap', 'memory', 'trivia'];

export interface StageHoldInput {
  /** The game is on screen (the punch has handed over). */
  readonly visible: boolean;
  /** Mounted under the punch, not yet seen (RedeemRedeemableModal's spinning state). */
  readonly prewarm: boolean;
  /** The game the server dealt. */
  readonly preferredGame?: string | null;
  /** The game picked for this mount (null until chosen). */
  readonly selectedGame?: string | null;
  /** A first play's how-to card is up. */
  readonly showIntro: boolean;
}

export interface StageHold {
  /** Mount the game now (seen or held off stage). */
  readonly mounted: boolean;
  /** Mounted but off stage: the shell holds its count, the game its sounds. */
  readonly held: boolean;
  /** The how-to card alone, the game mounting after it (a game that does not honor the hold). */
  readonly introOnly: boolean;
}

export function stageHoldFor(i: StageHoldInput): StageHold {
  const canHold = (g?: string | null) => !!g && STAGE_HOLD_GAMES.includes(g);
  const prewarming = i.prewarm && canHold(i.preferredGame) && !i.visible;
  const mounted = (i.visible || prewarming) && !!i.selectedGame;
  const introOnly = mounted && i.showIntro && !canHold(i.selectedGame);
  return { mounted, held: mounted && (prewarming || i.showIntro), introOnly };
}
