/**
 * The ride try card after a lost ride challenge: its title, one short line
 * and the ticket picture. Shared by RedeemRedeemableModal and the queue
 * results capture screen, so a capture shows the exact words a kid sees.
 *
 * Honest title: the card cannot know how close the game was (the game's own
 * panel already showed that), so it never claims SO CLOSE!. It is GOOD TRY!
 * on every miss, and the ticket picture says what the try cost.
 */

export interface LostTryInput {
  readonly usedRescuePass: boolean;
  readonly rescueRetryAvailable: boolean;
  readonly firstCoinTicketReturned: boolean;
  readonly lostTicketCost: number;
}

export interface LostTryCopy {
  readonly title: string;
  readonly message: string;
  /** Tickets this try changed: -n spent, +1 came back, 0 none spent. */
  readonly ticket: number;
}

export const LOST_TRY_TITLE = 'Good Try!';

export function lostTryCopy(input: LostTryInput): LostTryCopy {
  if (input.usedRescuePass) {
    return {
      title: LOST_TRY_TITLE,
      message: input.rescueRetryAvailable ? 'No Ticket spent. One more try today!' : 'No Ticket spent. Rescue tries are done for today.',
      ticket: 0,
    };
  }
  if (input.firstCoinTicketReturned) return { title: LOST_TRY_TITLE, message: 'Your Ticket came back. Try again!', ticket: 1 };
  const n = Math.max(0, Math.round(input.lostTicketCost));
  if (n > 0) return { title: LOST_TRY_TITLE, message: `${n} Ticket${n === 1 ? '' : 's'} used.`, ticket: -n };
  return { title: LOST_TRY_TITLE, message: 'No Ticket spent.', ticket: 0 };
}
