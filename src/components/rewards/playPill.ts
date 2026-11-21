/**
 * The map's PLAY! pill at 0 Tickets (fix round W3, T030), pure: it dims and
 * wears a ticket only when nothing plays right now (no Ticket, no free or
 * extra try, no earned Tickets waiting). While the earned-Tickets lookup has
 * not answered it stays bright (never a dim pill that brightens a moment later).
 */
export function playPillState(input: {
  readonly isCoin: boolean;
  readonly tickets: number;
  readonly ticketCost: number;
  /** The free-try or extra-try badge PLAY! already wears. */
  readonly badge: 'free_try' | 'extra_try' | null;
  /** Earned Tickets waiting to be claimed; null while unknown. */
  readonly claimable: number | null;
  readonly rescueAvailable: boolean;
}): { dim: boolean; needTicket: boolean } {
  // T3 (arcade plan): the served price; a missing price is never guessed as 1 (it cannot be short of nothing).
  const price = Number(input.ticketCost);
  const short = input.isCoin && Number.isFinite(price) && price >= 1 && (Number(input.tickets) || 0) < price;
  const nothingNow = short && !input.badge && !input.rescueAvailable && input.claimable === 0;
  return { dim: nothingNow, needTicket: nothingNow };
}
