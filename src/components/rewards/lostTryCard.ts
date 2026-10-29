/**
 * The ride try card after a lost ride challenge: its title, one short line
 * and the ticket picture. Shared by RedeemRedeemableModal and the queue
 * results capture screen, so a capture shows the exact words a kid sees.
 *
 * Honest title: the card cannot know how close the game was (the game's own
 * panel already showed that), so it never claims SO CLOSE!. When a free
 * retry is waiting (the Ticket came back, a Rescue try) it says ONE MORE
 * TRY!; otherwise GOOD TRY! (a Ticket spent is not a free try, so ONE MORE
 * TRY! over a -1 Ticket would be a mixed message, even with a paid retry on
 * offer: that button carries its own pictures). The
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
  /** The try reached 75% of its goal (rideTry.ts): only then may the card say SO CLOSE!. */
  readonly near?: boolean;
}

export interface LostTryCopy {
  readonly title: string;
  readonly message: string;
  /** Tickets this try changed: -n spent, +1 came back, 0 none spent (no picture). */
  readonly ticket: number;
}

export const LOST_TRY_TITLE = 'Good Try!';
export const RETRY_TRY_TITLE = 'One More Try!';
/** Only when the try reached 75% of its goal (core loop 5.3: "so close" only when it was close). */
export const NEAR_TRY_TITLE = 'So Close!';
/** The one loss card's line when the first try's Ticket comes back (blueprint 5.3). */
export const TICKET_BACK_LINE = 'Your Ticket came back. Same game, try again!';

export function lostTryCopy(input: LostTryInput): LostTryCopy {
  const title = input.near ? NEAR_TRY_TITLE : lostTryHasFreeRetry(input) ? RETRY_TRY_TITLE : LOST_TRY_TITLE;
  if (input.usedRescuePass) {
    return {
      title,
      message: input.rescueRetryAvailable ? 'No Ticket used. One more free go!' : 'No Ticket used. Free try done today.',
      ticket: 0,
    };
  }
  if (input.firstCoinTicketReturned) return { title, message: TICKET_BACK_LINE, ticket: 1 };
  const n = Math.max(0, Math.round(input.lostTicketCost));
  if (n > 0) return { title, message: `${n} Ticket${n === 1 ? '' : 's'} used.`, ticket: -n };
  return { title, message: 'No Ticket spent.', ticket: 0 };
}

/**
 * True when a lost ride try still has a retry on offer (the Ticket came back,
 * a Rescue retry, or a paid one more try). With none, a miss whose game
 * already showed its own GOOD TRY! card goes straight back to the map: one
 * card per miss in a moving line. RedeemRedeemableModal and the queue results
 * capture both use this rule.
 */
/** A retry that costs nothing more: the Ticket came back, or a Rescue try is left. */
export function lostTryHasFreeRetry(input: Pick<LostTryInput, 'firstCoinTicketReturned' | 'rescueRetryAvailable'>): boolean {
  return input.firstCoinTicketReturned || input.rescueRetryAvailable;
}

/** The paid retry button: pictures lead (play, then retry), a short label, the whole idea spoken. */
export const AD_RETRY_ACTION = { label: 'Watch Ad', icons: ['play', 'retry'], a11yLabel: 'Watch an ad for one more try' } as const;
/** A VIP member's retry lives inside TRY AGAIN, with a quiet "VIP try" tag (no upsell to anyone else). */
export const VIP_RETRY_ACTION = { label: 'Try Again', icons: ['retry'], note: 'VIP try', a11yLabel: 'Try again. A VIP try.' } as const;

/** A member's loss card once today's VIP tries are used: said kindly, in place of a try that is not there. */
export const VIP_TRY_TOMORROW = 'Your VIP try comes back tomorrow.';

/**
 * A member's VIP tries left today, from the server's ad summary (the retry placement's remaining
 * count; the server caps it per shop day). Null when the summary has no answer, so the loss card
 * still offers the try and the server decides.
 */
export function vipTriesLeft(summary: { readonly placements?: Partial<Record<string, { readonly remaining?: number }>> } | null | undefined): number | null {
  const remaining = summary?.placements?.retry?.remaining;
  return typeof remaining === 'number' && Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : null;
}

export function lostTryHasRetry(input: Pick<LostTryInput, 'firstCoinTicketReturned' | 'rescueRetryAvailable' | 'retryOffered'>): boolean {
  return input.firstCoinTicketReturned || input.rescueRetryAvailable || !!input.retryOffered;
}
