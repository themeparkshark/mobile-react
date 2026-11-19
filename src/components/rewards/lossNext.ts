/**
 * The one way on from a lost ride try (fix round W3, T029 and T030). Every
 * loss card has a forward button that plays: never a card whose only button
 * is BACK TO MAP while the player could still play.
 *   free_retry  the Ticket came back, or a free or extra try is left: TRY AGAIN, no new Ticket
 *   vip_retry   a member's VIP try (the existing grant)
 *   paid_retry  Tickets in hand: TRY AGAIN for 1 Ticket, "You have N" said under it
 *   ways        no Ticket left: the free ways to play (claim, free try, the line, a practice game)
 * The map is always the small second button. The line under the buttons says
 * what is next: Tickets left, earned Tickets waiting, or the next coin and how
 * far it is. Pure, no React, no em dashes.
 */
import type { GameIconName } from '../../ui/iconNames';
import { VIP_RETRY_ACTION } from './lostTryCard';

export type LossPrimaryKind = 'free_retry' | 'vip_retry' | 'paid_retry' | 'ways';

export interface LossNextInput {
  /** The Ticket came back, or a Rescue (free or extra) try is still left on this coin. */
  readonly freeRetry: boolean;
  /** A member's VIP try is on offer. */
  readonly vipRetry: boolean;
  /** Tickets the player holds now (after the loss was counted). */
  readonly tickets: number;
  readonly ticketCost: number;
  /** Earned Tickets waiting to be claimed (Stamp Book), when known. */
  readonly claimableTickets?: number | null;
  /** The guide's next coin (never the one just lost), when it has one. */
  readonly nextCoin?: { readonly name: string; readonly meters: number | null } | null;
}

export interface LossNext {
  readonly kind: LossPrimaryKind;
  readonly label: string;
  readonly icons: readonly GameIconName[];
  /** A small tag inside the button (the price of a paid retry). */
  readonly note?: string;
  readonly a11yLabel: string;
  readonly footnotes: readonly { readonly icon: GameIconName; readonly text: string }[];
}

const whole = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** "60 m", "1.2 km", or null when the distance is not known. */
export function distanceText(meters: number | null | undefined): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  const m = Math.max(0, Math.round(meters));
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

export function lossNext(input: LossNextInput): LossNext {
  const cost = Math.max(1, whole(input.ticketCost) || 1);
  const tickets = whole(input.tickets);
  const claimable = whole(input.claimableTickets);
  const next = input.nextCoin && input.nextCoin.name ? input.nextCoin : null;
  const nextLine = next ? { icon: 'coin' as GameIconName, text: [`Next coin: ${next.name}`, distanceText(next.meters)].filter(Boolean).join(', ') } : null;
  const ticketWord = (n: number) => `${n} ${n === 1 ? 'Ticket' : 'Tickets'}`;
  if (input.freeRetry) {
    return { kind: 'free_retry', label: 'Try Again', icons: ['retry'], a11yLabel: 'Try again. No new Ticket.', footnotes: nextLine ? [nextLine] : [] };
  }
  if (input.vipRetry) {
    return { kind: 'vip_retry', label: VIP_RETRY_ACTION.label, icons: [...VIP_RETRY_ACTION.icons], note: VIP_RETRY_ACTION.note,
      a11yLabel: VIP_RETRY_ACTION.a11yLabel, footnotes: nextLine ? [nextLine] : [] };
  }
  if (tickets >= cost) {
    return {
      kind: 'paid_retry', label: 'Try Again', icons: ['retry'], note: ticketWord(cost),
      a11yLabel: `Try again for ${ticketWord(cost)}. You have ${ticketWord(tickets)}.`,
      footnotes: [{ icon: 'ticket', text: `You have ${ticketWord(tickets)}` }, ...(nextLine ? [nextLine] : [])],
    };
  }
  return {
    kind: 'ways', label: claimable > 0 ? 'Free Tickets' : 'Ways to Play', icons: ['gift'],
    a11yLabel: claimable > 0 ? `${ticketWord(claimable)} are waiting for you. Claim them and play.` : 'See the free ways to play.',
    footnotes: claimable > 0
      ? [{ icon: 'ticket', text: `${claimable} free ${claimable === 1 ? 'Ticket is' : 'Tickets are'} waiting` }]
      : nextLine ? [nextLine] : [],
  };
}
