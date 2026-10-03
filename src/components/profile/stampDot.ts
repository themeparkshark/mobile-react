/**
 * How many earned stamps still have rewards to claim, for the Stamp Book
 * badge's red dot. Uses `summary.claimable` when the server sends it (the
 * stamps lead may add it), else counts from the stamp list the same way the
 * Stamp Book does (earned, not claimed, has a reward). Any failure: no dot.
 */
import type { StampsResponse } from '../../api/endpoints/me/stamps';

export function stampClaimableCount(resp: { stamps: StampsResponse['stamps']; summary?: object } | null | undefined): number {
  if (!resp) return 0;
  const fromServer = (resp.summary as { claimable?: unknown } | undefined)?.claimable;
  if (typeof fromServer === 'number' && Number.isFinite(fromServer)) return Math.max(0, fromServer);
  let n = 0;
  for (const list of Object.values(resp.stamps ?? {})) {
    for (const s of list ?? []) {
      const r = s.rewards;
      const hasReward = !!r && (r.energy > 0 || r.tickets > 0 || r.xp > 0 || r.coins > 0 || !!r.title);
      if (s.is_earned && !s.reward_claimed && hasReward) n++;
    }
  }
  return n;
}
