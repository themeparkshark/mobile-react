/**
 * The Get Tickets rows (T7, arcade plan Nov 20 2026), pure. Only rows that work right now, in one order:
 *   1. claim   Tickets already earned (stamps): CLAIM
 *   2. line    wait in this ride's line: "+1 Ticket and its Ride Parts" (a ride with a line, line Tickets left)
 *   3. trail   Trail Box steps to the next box
 *   4. near    coins you can play with what you have: SEE (NEAR ME, "I can play now")
 *   5. pick    save for this coin: MAKE THIS MY PICK
 *   6. grownups  a plain row through the grown-up gate to Supplies, the smallest covering pack on top
 * It ends with "Tomorrow at any park: +3" on the arcade server. No countdown, no red, no pack art.
 */
import type { TicketSources } from '../../api/endpoints/me/task-attempts';
import { ticketWord } from './ticketPipsModel';

export type GetTicketsRowKind = 'claim' | 'line' | 'trail' | 'near' | 'pick' | 'grownups';

export interface GetTicketsRow {
  readonly kind: GetTicketsRowKind;
  readonly text: string;
  /** The button's word (null: an information row with no button, like Trail Box steps). */
  readonly action: string | null;
  readonly a11y: string;
}

export interface GetTicketsInput {
  readonly price: number | null;
  readonly tickets: number;
  readonly sources: TicketSources | null | undefined;
  /** Stamp Tickets earned and not yet claimed, from the app's own Stamp Book read (today's server). */
  readonly stampTickets: number | null;
  readonly rideHasLine: boolean;
  /** The line Ticket switch (today's server: queue_tickets). */
  readonly queueTicketsOn: boolean;
  /** Coins near the player whose price is at or under the wallet (null: not counted). */
  readonly affordableNear: number | null;
  /** This coin is not already the player's pick. */
  readonly canPick: boolean;
  /** The shop is available in this build. */
  readonly storeOn: boolean;
  readonly arcade: boolean;
  /**
   * The coinless sheet (top card, header pill) at a park: no ride is picked for the player, so the line row is a plain
   * "any ride's line" fact with no button (the player chooses the ride).
   */
  readonly anyLine?: boolean;
}

export const TOMORROW_LINE = 'Tomorrow at any park: +3';

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null);

export function getTicketsRows(input: GetTicketsInput): { rows: GetTicketsRow[]; footer: string | null; have: string } {
  const rows: GetTicketsRow[] = [];
  const src = input.sources ?? null;
  const stamps = n(src?.stamps_waiting_tickets) ?? n(input.stampTickets) ?? 0;
  if (stamps > 0) rows.push({ kind: 'claim', text: `Stamps waiting: +${stamps}`, action: 'CLAIM', a11y: `${ticketWord(stamps)} from stamps are waiting. Claim them.` });
  const lineLeft = n(src?.line_tickets_left_today) ?? (input.queueTicketsOn ? 1 : 0);
  if (input.rideHasLine && lineLeft > 0) {
    rows.push({ kind: 'line', text: '+1 Ticket and its Ride Parts', action: 'LINEPLAY', a11y: '10 minutes in a ride line earns 1 Ticket and its Ride Parts.' });
  } else if (input.anyLine && lineLeft > 0) {
    rows.push({ kind: 'line', text: 'Wait in any ride line: +1', action: null, a11y: '10 minutes in any ride line earns 1 Ticket.' });
  }
  const steps = n(src?.trail_box_steps_left);
  if (steps != null && steps > 0) rows.push({ kind: 'trail', text: `${steps} steps to open: +1`, action: null, a11y: `${steps} more steps open a Trail Box with 1 Ticket.` });
  const tickets = n(input.tickets) ?? 0;
  if (tickets > 0) {
    const count = n(input.affordableNear);
    const text = count != null && count > 0 ? `${count} coin${count === 1 ? '' : 's'} near you cost what you have` : 'Coins you can play now';
    if (count == null || count > 0) rows.push({ kind: 'near', text, action: 'SEE', a11y: `${text}. See them.` });
  }
  if (input.canPick) rows.push({ kind: 'pick', text: 'Save up', action: 'MAKE THIS MY PICK', a11y: 'Make this coin your pick and save up for it.' });
  if (input.storeOn) rows.push({ kind: 'grownups', text: 'Grown-ups', action: 'SHOP', a11y: 'Ask a grown-up. Opens the Shark Shop on Tickets.' });
  const price = n(input.price);
  return { rows, footer: input.arcade ? TOMORROW_LINE : null, have: price != null ? `You have ${tickets} of ${price}` : `You have ${ticketWord(tickets)}` };
}
