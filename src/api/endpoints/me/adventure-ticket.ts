import client from '../../client';
import type { AdventureTicket } from './trip-goal';

/** Today's Adventure Ticket at the park the player is in (WS2, behind the server flag). */
export async function getAdventureTicket(): Promise<AdventureTicket | null> {
  const { data } = await client.get<{ data: AdventureTicket | null }>('/me/adventure-ticket', { timeout: 10_000 });
  return data.data;
}

/** Explicit ride choice or detour. A 422 carries a readable message (see adventureErrorMessage). */
export async function selectAdventureRide(taskId: number): Promise<AdventureTicket> {
  const { data } = await client.put<{ data: AdventureTicket }>('/me/adventure-ticket', { task_id: taskId }, { timeout: 10_000 });
  return data.data;
}

/** Tuck today's ticket away. Arrival will not bring it back until the next park day. */
export async function dismissAdventureTicket(): Promise<void> {
  await client.delete('/me/adventure-ticket', { timeout: 10_000 });
}
