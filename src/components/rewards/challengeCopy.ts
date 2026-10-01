/**
 * Copy for the ride challenge card, kept pure so it is testable.
 * No emoji, no em dashes; ribbon titles fit the ribbon (22 characters).
 */

/** Ticket sources the server reports (WS7 wallet flag). Missing means unknown. */
export interface TicketSources {
  /** LinePlay pays Tickets right now (the queue Ticket faucet). */
  readonly line?: boolean;
  /** Home finds pay Tickets. */
  readonly home?: boolean;
  /** Queue Tickets still available today. */
  readonly line_remaining_today?: number | null;
}

export function challengeRibbon(taskType: 'task' | 'secret_task' | null, coinKind?: string | null) {
  if (taskType === 'secret_task') return { title: 'Secret Challenge', promise: 'WIN TO COLLECT THIS SECRET COIN' };
  if (coinKind === 'ride') return { title: 'Ride Challenge', promise: 'WIN TO COLLECT THIS RIDE COIN' };
  return { title: 'Coin Challenge', promise: 'WIN TO COLLECT THIS COIN' };
}

/** What to tell a player with no Ticket, driven by what actually pays Tickets today. */
export function outOfTicketsCopy({ sources, rescuePassUsedToday }: {
  sources?: TicketSources | null; rescuePassUsedToday: boolean;
}): { title: string; body: string } {
  const lead = rescuePassUsedToday ? 'Today’s Rescue Pass is used. ' : '';
  if (!sources) {
    return { title: 'NEED A PARK TICKET?', body: `${lead}LinePlay and home finds can earn Tickets. Refresh once you have one.` };
  }
  const lineOpen = !!sources.line && (sources.line_remaining_today === undefined || sources.line_remaining_today === null
    || sources.line_remaining_today > 0);
  if (lineOpen) {
    return { title: 'EARN ONE IN LINE', body: `${lead}Play LinePlay while you wait to earn a Ticket.${sources.home ? ' Home finds earn them too.' : ''}` };
  }
  if (sources.home) {
    return { title: 'NEED A PARK TICKET?', body: `${lead}${sources.line ? 'Today’s queue Tickets are collected. ' : ''}Home finds earn Tickets for your next park day.` };
  }
  return { title: 'NEED A PARK TICKET?', body: `${lead}New Tickets arrive with your next park day.` };
}
