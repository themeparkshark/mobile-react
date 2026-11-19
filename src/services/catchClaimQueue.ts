import redeemPrepItem from '../api/endpoints/me/prep-items/redeem';
import type { CatchClaim } from '../screens/ExploreScreen/homeCatch';
import { RedeemRetryQueue } from './lineplay/RedeemRetryQueue';

/**
 * T175: treat claims whose answer was slow finish here, quietly, in the app's existing retry queue. A claim
 * that already landed (the server says it is collected) or that the server refuses is done; a slow or busy
 * server keeps it for the next try. Each success reaches the header through walletSync (a redeem is a grant).
 */
export const CATCH_DRAIN_MS = [4000, 12000, 30000] as const;

export const catchClaimQueue = new RedeemRetryQueue<CatchClaim>({
  storageKey: 'home_catch_claim_queue',
  maxAttempts: 12,
  executor: async claim => {
    try {
      await redeemPrepItem(claim.itemId, claim.pivotId, claim.latitude, claim.longitude, claim.details);
      return true;
    } catch (error) {
      const status = (error as { response?: { status?: number } } | null)?.response?.status;
      // Answered with a refusal or "already collected": nothing more to do.
      if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429) return true;
      return false;
    }
  },
});

/** Keep a slow claim, then try it again a few times while the app is open (and on every return to the app). */
export function queueCatchClaim(claim: CatchClaim): void {
  void catchClaimQueue.enqueue(claim, `catch_${claim.pivotId}`, { replace: true }).then(() => {
    for (const ms of CATCH_DRAIN_MS) setTimeout(() => { void catchClaimQueue.drain(); }, ms);
  }).catch(() => undefined);
}
