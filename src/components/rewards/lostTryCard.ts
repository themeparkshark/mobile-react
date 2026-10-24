/**
 * The ride try card after a lost ride challenge: its title, one short line
 * and the ticket picture. Shared by RedeemRedeemableModal and the queue
 * results capture screen, so a capture shows the exact words a kid sees.
 *
 * Honest title: the card cannot know how close the game was (the game's own
 * panel already showed that), so it never claims SO CLOSE!. When a retry is
 * on offer it says ONE MORE TRY! (the game's own card already said GOOD
 * TRY!, so a kid never reads GOOD TRY! twice); otherwise GOOD TRY!. The
 * ticket picture shows only what changed: -n spent or +1 back, never a
 * bare 0 that reads like "you have no Tickets".
 */

export interface LostTryInput {
  readonly usedRescuePass: boolean;
  readonly rescueRetryAvailable: boolean;
  readonly firstCoinTicketReturned: boolean;
  readonly lostTicketCost: number;
  /** A paid "one more try" (ad or VIP) is on offer. */
  readonly retryOffered?: boolean;
}

export interface LostTryCopy {
  readonly title: string;
  readonly message: string;
  /** Tickets this try changed: -n spent, +1 came back, 0 none spent (no picture). */
  readonly ticket: number;
}

export const LOST_TRY_TITLE = 'Good Try!';
export const RETRY_TRY_TITLE = 'One More Try!';

export function lostTryCopy(input: LostTryInput): LostTryCopy {
  const hasRetry = input.firstCoinTicketReturned || input.rescueRetryAvailable || !!input.retryOffered;
  const title = hasRetry ? RETRY_TRY_TITLE : LOST_TRY_TITLE;
  if (input.usedRescuePass) {
    return {
      title,
      message: input.rescueRetryAvailable ? 'No Ticket spent. One more try today!' : 'No Ticket spent. Rescue tries are done for today.',
      ticket: 0,
    };
  }
  if (input.firstCoinTicketReturned) return { title, message: 'Your Ticket came back. Try again!', ticket: 1 };
  const n = Math.max(0, Math.round(input.lostTicketCost));
  if (n > 0) return { title, message: `${n} Ticket${n === 1 ? '' : 's'} used.`, ticket: -n };
  return { title, message: 'No Ticket spent.', ticket: 0 };
}
