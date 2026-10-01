import client from '../../../client';

/** Clears NEW on owned items the player has looked at (up to 60 per call). */
export default async function markItemsSeen(itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return;
  await client.post('/me/inventory/seen', { item_ids: itemIds.slice(0, 60) });
}
