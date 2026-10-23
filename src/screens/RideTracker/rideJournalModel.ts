import type { RideType } from '../../api/endpoints/rides';

/**
 * The park catalog also lists places to eat and drink (bars, taverns, snack
 * stands, all typed 'restaurant'). The ride journal is for rides and shows,
 * so those never appear in the pick list.
 */
export function journalRides(rides: readonly RideType[]): RideType[] {
  return rides.filter(ride => ride.type !== 'restaurant');
}
