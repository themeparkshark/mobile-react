/**
 * The loss card (T4, arcade plan Nov 20 2026), pure. A Ticket is an arcade token: spent win or lose.
 * - Always "Nice try!" (never a closeness message).
 * - The Ride Parts the loss paid fly into the coin's slot: "+3 Ride Parts for Space Mountain", or
 *   "Parts full here today" when the 12 a day cap took them all.
 * - TRY AGAIN carries the price as Ticket pictures (same game, same price); short on Tickets it shows
 *   outlines and opens Get Tickets. BACK TO MAP is the same size beside it.
 * - The soft stop: after 2 losses at the same coin today, BACK TO MAP is the big button and TRY AGAIN
 *   a small link. Nothing is locked.
 * - "Practice this game free" is a quiet link on every loss card.
 * - No free retry, no VIP retry, no next coin line. On today's server a try whose Ticket the server
 *   really gave back (first_coin_ticket_returned) still says so, so the card works on both servers.
 */
import { servedTicketPrice, ticketWord } from './ticketPipsModel';

export const NICE_TRY = 'Nice try!';
export const PARTS_FULL_LINE = 'Parts full here today';
export const PRACTICE_LINK = 'Practice this game free';
export const TIMED_OUT_LINE = 'That game timed out. It counts as played.';
export const NEVER_STARTED_LINE = 'That game never started. Your Tickets are back.';
/** Losses at one coin in a park day that turn on the soft stop. */
export const SOFT_STOP_LOSSES = 2;

export interface LossAttemptFields {
  readonly ticket_cost?: number | null;
  readonly status?: string | null;
  readonly loss_parts?: number | null;
  readonly losses_here_today?: number | null;
  readonly loss?: { readonly parts?: number | null; readonly parts_full?: boolean | null; readonly task_name?: string | null } | null;
  readonly first_coin_ticket_returned?: boolean | null;
  readonly rescue_retry_available?: boolean | null;
  readonly rescue_pass?: boolean | null;
  readonly abandoned?: boolean | null;
}

export interface LossCardInput {
  readonly attempt: LossAttemptFields | null | undefined;
  /** The coin's name, for "+3 Ride Parts for Space Mountain". */
  readonly coinName: string;
  /** The coin's served price, when the attempt does not carry one. */
  readonly price: number | null;
  /** Tickets the player holds now (after the loss). */
  readonly tickets: number;
  /** A practice version of the game can open from here. */
  readonly practice: boolean;
}

export interface LossCardModel {
  readonly title: string;
  /** Parts this loss paid into the coin's slot (null: the server did not say, today's server). */
  readonly parts: { readonly amount: number; readonly full: boolean; readonly line: string } | null;
  /** The one short line under the shark (spoken too). */
  readonly message: string;
  /** Today's server gave the Ticket back: TRY AGAIN costs nothing (no pictures on it). */
  readonly freeRetry: boolean;
  /** The price TRY AGAIN shows as pictures (null on a free retry or with no served price). */
  readonly price: number | null;
  /** Not enough Tickets for TRY AGAIN: it shows outlines and opens Get Tickets. */
  readonly short: boolean;
  /** The soft stop: BACK TO MAP big, TRY AGAIN a small link. */
  readonly soft: boolean;
  readonly practiceLink: string | null;
}

const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null);

/** "Space Mountain", never "the Space Mountain" or an empty name. */
function nameFor(name: string | null | undefined): string {
  return String(name ?? '').trim().replace(/^the\s+/i, '');
}

export function lossCardModel(input: LossCardInput): LossCardModel {
  const a = input.attempt ?? {};
  const price = servedTicketPrice(a.ticket_cost) ?? input.price;
  const freeRetry = a.first_coin_ticket_returned === true || a.rescue_retry_available === true;
  const lossParts = whole(a.loss_parts ?? a.loss?.parts);
  const full = a.loss?.parts_full === true || (lossParts === 0 && a.loss_parts != null);
  const name = nameFor(a.loss?.task_name ?? input.coinName);
  const parts = lossParts == null ? null
    : full && lossParts === 0 ? { amount: 0, full: true, line: PARTS_FULL_LINE }
      : { amount: lossParts, full: false, line: `+${lossParts} Ride Part${lossParts === 1 ? '' : 's'}${name ? ` for ${name}` : ''}` };
  const timedOut = a.abandoned === true;
  let message: string;
  if (timedOut) message = TIMED_OUT_LINE;
  else if (a.first_coin_ticket_returned === true) message = 'Your Ticket came back. Try again!';
  else if (a.rescue_pass === true) message = a.rescue_retry_available === true ? 'No Ticket used. One more go!' : 'No Ticket used.';
  else if (parts) message = parts.line;
  else if (price != null) message = `${ticketWord(price)} used.`;
  else message = 'Your Ride Parts are saved.';
  const losses = whole(a.losses_here_today) ?? 0;
  const tickets = whole(input.tickets) ?? 0;
  return {
    title: NICE_TRY,
    parts,
    message,
    freeRetry,
    price: freeRetry ? null : price,
    short: !freeRetry && price != null && tickets < price,
    soft: !freeRetry && losses >= SOFT_STOP_LOSSES,
    practiceLink: input.practice ? PRACTICE_LINK : null,
  };
}

/** The expired card's line: a try that began and ran out is a loss; one that never began gave its Tickets back. */
export function expiredLine(attempt: LossAttemptFields | null | undefined, arcade: boolean): string | null {
  if (!arcade) return null;
  return attempt?.status === 'lost' || attempt?.abandoned === true ? TIMED_OUT_LINE : NEVER_STARTED_LINE;
}
