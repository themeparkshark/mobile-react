/**
 * Fix w4 T101: a Ticket grant that has no card of its own (the park day starter at check-in) gets its moment: the
 * Tickets pop and fly to the header pill with one line that says why. Callers announce; the map plays them, one at a
 * time, once nothing else owns the screen. Pure queue plus a listener (no React here).
 */
export interface TicketGrant {
  readonly amount: number;
  /** Why, in kid words: "Park day starter". */
  readonly reason: string;
}

let queue: TicketGrant[] = [];
const listeners = new Set<() => void>();

export function announceTicketGrant(grant: TicketGrant): void {
  const amount = Number.isFinite(grant.amount) ? Math.floor(grant.amount) : 0;
  if (amount <= 0) return;
  queue = [...queue, { amount, reason: grant.reason.trim() }];
  listeners.forEach(listener => { try { listener(); } catch { /* one bad listener never stops the rest */ } });
}

/** The next grant to play, removed from the queue (null when none waits). */
export function takeTicketGrant(): TicketGrant | null {
  const [next, ...rest] = queue;
  queue = rest;
  return next ?? null;
}

export function pendingTicketGrants(): number {
  return queue.length;
}

export function onTicketGrant(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The toast line: "+2 Tickets: Park day starter". */
export function ticketGrantLine(grant: TicketGrant): string {
  const n = grant.amount;
  const what = `+${n} ${n === 1 ? 'Ticket' : 'Tickets'}`;
  return grant.reason ? `${what}: ${grant.reason}` : what;
}

/** Tests only. */
export function resetTicketGrantsForTests(): void {
  queue = [];
  listeners.clear();
}
