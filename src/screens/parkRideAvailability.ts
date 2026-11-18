import { plainRideName, rideNameKey } from '../helpers/plainRideName';
import type { WikiLiveEntry } from '../api/endpoints/parks/queue-times/getWikiTimes';

// One display name per ride (fix w3 T122): the feed rows and the coin names both pass through
// plainRideName, so "Thunder Mountain" and "Big Thunder Mountain Railroad" already read the same.
// The old per-park alias table (a second copy of that mapping) is gone.
const normalize = (name: string) => rideNameKey(plainRideName(name));

/** A status is usable only when one attraction in this park matches exactly or by reviewed alias. */
export function reportedRideStatus(entries: readonly WikiLiveEntry[], parkId: number,
  rideName: string): WikiLiveEntry['status'] | null {
  const name = normalize(rideName);
  if (!name) return null;
  void parkId;
  const matches = entries.filter(entry => normalize(entry.name) === name);
  return matches.length === 1 ? matches[0].status : null;
}
