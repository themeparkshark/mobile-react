/**
 * The price a map island shows (T2, arcade plan Nov 20 2026): the task's own served price first,
 * then the price its caller passed. Never a guessed 1: no served price means no pips.
 */
import { servedTicketPrice } from './ticketPipsModel';

export function islandPrice(taskPrice: unknown, callerPrice?: unknown): number | null {
  return servedTicketPrice(taskPrice) ?? servedTicketPrice(callerPrice);
}
