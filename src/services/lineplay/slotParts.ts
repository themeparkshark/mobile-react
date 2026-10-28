/**
 * Ride Parts waiting in a coin's slot (core loop 5.5): every line Part saved for a coin the player does
 * not own yet, not only this wait's. The recap's GO says "Win Jungle Cruise's coin: 3 Parts are waiting".
 * Read only (GET /me/ride-parts/{taskId}); a failed read falls back to this wait's Parts.
 */
import api from '../../api/api';

export async function waitingSlotParts(taskId: number, timeoutMs = 5_000): Promise<number | null> {
  if (!Number.isInteger(taskId) || taskId <= 0) return null;
  try {
    const response = await api.get(`/me/ride-parts/${taskId}`, { timeout: timeoutMs });
    const amount = Number(response.data?.data?.amount);
    return Number.isFinite(amount) && amount >= 0 ? Math.floor(amount) : null;
  } catch {
    return null;
  }
}

/** The count the recap names: the slot's saved Parts, never fewer than this wait just earned. */
export function slotPartsShown(sessionParts: number, slotParts: number | null): number {
  return Math.max(Math.max(0, sessionParts), slotParts ?? 0);
}
