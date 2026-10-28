/**
 * Free Tickets first (core loop blueprint 4.1 and must-fix 19, October 2026).
 *
 * When a player is out of Tickets, the free ways come before anything else, in
 * one fixed order:
 *   1. earned Tickets waiting to be claimed (stamps first, then sets, chests and the rest)
 *   2. today's free try (the one daily gift)
 *   3. extra tries the player already holds
 *   4. the line Ticket ("your first wait at a ride earns a Ticket"), only while queue_tickets is on
 *   5. treats at home (3 treats = 1 Ticket), which is always true and always last
 *
 * Pure and import-free. Shared contract: owned by the guide-map lane, every
 * other lane imports it and never edits it. The guide card, the challenge card
 * and the out-of-Tickets button all read the same order from here.
 */

/** Where earned, unclaimed Tickets are waiting. Stamps always come first. */
export type ClaimSourceKind = 'stamp' | 'set' | 'chest' | 'pass' | 'other';

export interface ClaimSource {
  readonly kind: ClaimSourceKind;
  /** The thing to claim (stamp id, set id, chest id). Optional: some sources claim as one. */
  readonly id?: number | string;
  readonly tickets: number;
}

export interface FreeTicketsInput {
  /** Tickets the player holds now. With 1 or more, no free step is needed. */
  readonly tickets: number;
  /** Earned Tickets waiting to be claimed, by source. Zero-Ticket sources are ignored. */
  readonly claimable?: readonly ClaimSource[];
  /** Today's free try is unused and its switch (ride_rescue_pass) is on for this player. */
  readonly freeTryReady: boolean;
  /** Extra tries the player holds (passes from Supplies or gifts). */
  readonly extraTries: number;
  /** The queue_tickets switch for this player. Line Ticket copy shows only while it is on. */
  readonly queueTicketsOn: boolean;
  /** Today's first wait at a ride has not paid its Ticket yet. Defaults to true while the switch is on. */
  readonly lineTicketUnused?: boolean;
}

export type FreeTicketStep =
  | { readonly kind: 'claim'; readonly tickets: number; readonly sources: readonly ClaimSource[] }
  | { readonly kind: 'free_try' }
  | { readonly kind: 'extra_try'; readonly count: number }
  | { readonly kind: 'line_ticket' }
  | { readonly kind: 'treats'; readonly treatsPerTicket: number };

/** Every 3 treats at home make 1 Ticket (blueprint section 2). */
export const TREATS_PER_TICKET = 3;

const SOURCE_ORDER: readonly ClaimSourceKind[] = ['stamp', 'set', 'chest', 'pass', 'other'];

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

/** Claim sources with Tickets, stamps first, then by kind order, stable inside a kind. */
export function orderClaimSources(sources: readonly ClaimSource[] | undefined): ClaimSource[] {
  const usable = (sources ?? []).filter(source => count(source?.tickets) > 0);
  const rank = (kind: ClaimSourceKind) => {
    const index = SOURCE_ORDER.indexOf(kind);
    return index < 0 ? SOURCE_ORDER.length : index;
  };
  return usable
    .map((source, index) => ({ source, index }))
    .sort((a, b) => rank(a.source.kind) - rank(b.source.kind) || a.index - b.index)
    .map(entry => entry.source);
}

/**
 * Every free way to a Ticket the player has right now, in the fixed order.
 * The list always ends with treats, so it is never empty. When the player
 * holds a Ticket it still lists the ways (for a "ways to get Tickets" sheet).
 */
export function freeTicketSteps(input: FreeTicketsInput): FreeTicketStep[] {
  const steps: FreeTicketStep[] = [];
  const sources = orderClaimSources(input.claimable);
  const claimTickets = sources.reduce((sum, source) => sum + count(source.tickets), 0);
  if (claimTickets > 0) steps.push({ kind: 'claim', tickets: claimTickets, sources });
  if (input.freeTryReady === true) steps.push({ kind: 'free_try' });
  const extra = count(input.extraTries);
  if (extra > 0) steps.push({ kind: 'extra_try', count: extra });
  if (input.queueTicketsOn === true && input.lineTicketUnused !== false) steps.push({ kind: 'line_ticket' });
  steps.push({ kind: 'treats', treatsPerTicket: TREATS_PER_TICKET });
  return steps;
}

/**
 * The one free step to offer now, or null while the player holds a Ticket
 * (PLAY! just spends it). Only claim, free_try and extra_try play right away;
 * line_ticket and treats are the "Need a Ticket" state.
 */
export function nextFreeTicket(input: FreeTicketsInput): FreeTicketStep | null {
  if (count(input.tickets) > 0) return null;
  return freeTicketSteps(input)[0];
}

/** True when the next free step can start a game right here (no walking, no waiting). */
export function playsNow(step: FreeTicketStep | null): boolean {
  return step?.kind === 'claim' || step?.kind === 'free_try' || step?.kind === 'extra_try';
}

/**
 * The "Need a Ticket" lines, in the vocabulary of blueprint 4.5. The line
 * Ticket sentence is present only while queue_tickets is on (test state A
 * must never show it).
 */
export function needTicketLines(queueTicketsOn: boolean): string[] {
  const lines = [`${TREATS_PER_TICKET} treats at home = 1 Ticket.`, 'Tomorrow brings a new free try.'];
  if (queueTicketsOn === true) lines.push('Your first wait at a ride earns a Ticket.');
  return lines;
}
