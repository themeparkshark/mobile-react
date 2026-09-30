import type { AdventureTicket } from '../../api/endpoints/me/trip-goal';
import type { LivePark } from '../../api/endpoints/parks/live';

/** The live response must belong to the ticket's park and remain recently confirmed. */
export function adventureRideClosed(ticket: AdventureTicket, live: LivePark | null, parkId: number, now: number): boolean {
  if (ticket.park_id !== parkId || ticket.phase === 'complete' || !live?.fetched_at) return false;
  const age = now - Date.parse(live.fetched_at);
  if (!Number.isFinite(age) || age < -30000 || age > 180000) return false;
  const matches = live.rides.filter(ride => ride.task_id === ticket.ride.task_id);
  return matches.length === 1 && ['CLOSED', 'DOWN', 'REFURBISHMENT'].includes(matches[0].status);
}

export function adventurePrompt(ticket: AdventureTicket, closed = false) {
  if (ticket.phase === 'complete') return { title: 'Your park-day souvenir', action: 'Visit my coin', detail: 'A coin, a story, a day to remember.' };
  if (closed && ticket.phase !== 'celebrate') return { title: 'Adventure takes a detour', action: 'Choose another ride', detail: 'Keep every stamp you’ve earned.' };
  if (ticket.phase === 'discover') return { title: 'Your first chapter awaits', action: 'Find this coin', detail: 'Discover its challenge on the map.' };
  if (ticket.phase === 'play') return { title: 'A story for your next wait', action: 'Play the queue adventure', detail: 'Three short missions. Pause whenever the line moves.' };
  return { title: 'You made a park memory', action: 'Unfold my souvenir', detail: 'Your coin and your story, together.' };
}
