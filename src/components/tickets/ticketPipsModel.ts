/**
 * The price of a ride as Ticket pictures (arcade plan, Nov 20 2026).
 *
 * A ride costs 1, 2 or 3 Tickets. Each pip is one Ticket of the price: filled when the player
 * holds it, an outline when they are short. Pure and import-free so the map, the coin card,
 * PLAY!, the loss card and Get Tickets all draw the same thing from the same rule.
 */

export type TicketPipSize = 'island' | 'card' | 'button';

export type TicketPip = { readonly key: string; readonly filled: boolean };

export type TicketPipsModel = {
  /** The served price, 1 to 3. */
  readonly price: number;
  /** Tickets the player holds, when known. */
  readonly held: number | null;
  readonly pips: readonly TicketPip[];
  readonly filled: number;
  readonly short: number;
  readonly canPay: boolean;
  readonly label: string;
};

/** The largest price a coin can have. Anything higher is drawn as 3 (never a row of 10 pictures). */
export const MAX_TICKET_PRICE = 3;

/** Widths in points. The art is 799 x 549, so height = width * 0.687. */
export const TICKET_PIP_WIDTH: Readonly<Record<TicketPipSize, number>> = { island: 15, card: 30, button: 22 };
export const TICKET_ART_RATIO = 549 / 799;

/**
 * Reads a served price. A missing, zero, negative or non-number price returns null so the
 * caller hides the pips (never a guessed 1).
 */
export function servedTicketPrice(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const whole = Math.floor(n);
  if (whole < 1) return null;
  return whole;
}

function heldCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

export function ticketWord(n: number): string {
  return `${n} Ticket${n === 1 ? '' : 's'}`;
}

/**
 * Builds the pips for a price and a wallet. Returns null when the price is missing.
 * With an unknown wallet every pip is drawn filled (the price, with no "short" claim).
 */
export function ticketPipsModel(price: unknown, held?: unknown): TicketPipsModel | null {
  const served = servedTicketPrice(price);
  if (served == null) return null;
  const shown = Math.min(MAX_TICKET_PRICE, served);
  const have = heldCount(held);
  const filledCount = have == null ? shown : Math.min(shown, have);
  const pips: TicketPip[] = [];
  for (let i = 0; i < shown; i += 1) pips.push({ key: `pip-${i}`, filled: i < filledCount });
  const short = have == null ? 0 : Math.max(0, served - have);
  const label = have == null ? ticketWord(served) : `${ticketWord(served)}, you have ${have}`;
  return { price: served, held: have, pips, filled: filledCount, short, canPay: have == null ? true : have >= served, label };
}
