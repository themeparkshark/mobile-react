import client from '../../../client';

/**
 * POST /me/prep-items/{pivotId}/ride-off (Home Hunt v3): the player's Legendary
 * rode off. The server records it (gone for today, preferred as tomorrow's daily
 * rare) so the client never decides it alone. Never throws: an older server
 * without the route still hides the find locally for this session.
 */
export default async function reportRideOff(pivotId: number): Promise<boolean> {
  try {
    await client.post(`/me/prep-items/${pivotId}/ride-off`);
    return true;
  } catch {
    return false;
  }
}
