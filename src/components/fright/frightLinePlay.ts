import type { FrightSpot } from '../../api/endpoints/fright';
import type { RideContext } from '../../services/lineplay/LinePlaySession';

/** L2: a haunt line opens Line Play on the existing games-only path (no Parts, no coin). */
export function frightLinePlayRide(spot: FrightSpot, parkId: number, observedAt: number): RideContext {
  return {
    rideId: 0, rideName: spot.name, rideSlug: `fright-${spot.key}`, parkId, lineRewardsReady: false,
    postedWaitMinutes: spot.posted_minutes, postedWaitObservedAt: spot.posted_minutes != null ? observedAt : null,
  };
}
