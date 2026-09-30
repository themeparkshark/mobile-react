/**
 * Community Center reward and cooldown rules for the client (WS8). Pure, so it
 * is unit tested in tools/tests/community-center.test.cjs.
 *
 * Rewards are server-authoritative: the ticket count the client shows and
 * flies is whatever the server says it granted (tickets_earned). The fallback
 * only covers an older server that omits the field, and matches its rule
 * (leave a gift: 2 Tickets, claim a gift: 1 Ticket).
 */
export type CommunityCenterAction = 'give' | 'claim';

export const FALLBACK_TICKETS: Record<CommunityCenterAction, number> = { give: 2, claim: 1 };

export function ticketsEarnedFrom(data: unknown, action: CommunityCenterAction): number {
  const raw = (data as { tickets_earned?: unknown } | null | undefined)?.tickets_earned;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  return FALLBACK_TICKETS[action];
}

export function ticketLabel(count: number): string {
  return count === 1 ? 'Ticket' : 'Tickets';
}

/** The server sends cooldowns in seconds. "45s", "12m", "1h 5m". */
export function formatCooldown(seconds: number): string {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const minutes = Math.ceil(s / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
