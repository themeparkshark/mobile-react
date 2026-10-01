/**
 * The Coin Guide's rows (Coin Map 2.0): every coin, plus every cataloged ride
 * (type ride or attraction) without one as a Line Play row, so searching any
 * ride always finds something. A ride with a coin is never listed twice: its
 * rides.task_id link wins, then the name and alias match Line Play already uses.
 */
import type { RideType } from '../../api/endpoints/rides';
import type { TaskType } from '../../models/task-type';
import { normalizeRideName, rideKeysForTask } from '../lineplay/resolveRide';

export type CoinGuideRow =
  | { readonly kind: 'coin'; readonly key: string; readonly name: string; readonly search: string; readonly task: TaskType }
  | { readonly kind: 'line'; readonly key: string; readonly name: string; readonly search: string; readonly ride: RideType };

const GUIDE_RIDE_TYPES = new Set(['ride', 'attraction']);

/** Shows, restaurants and shops stay out of the guide; rides and attractions are in. */
export function isGuideRide(ride: Pick<RideType, 'type'>): boolean {
  return GUIDE_RIDE_TYPES.has(String(ride.type ?? '').toLowerCase());
}

export function buildCoinGuide({ parkId, coins, rides }: {
  readonly parkId: number;
  readonly coins: readonly TaskType[];
  readonly rides: readonly RideType[];
}): CoinGuideRow[] {
  const byId = new Map(coins.map(coin => [coin.id, coin]));
  const byName = new Map<string, TaskType>();
  for (const coin of coins) {
    for (const key of rideKeysForTask(parkId, coin.name)) if (!byName.has(key)) byName.set(key, coin);
  }
  const rideNames = new Map<number, string[]>();
  const lines: CoinGuideRow[] = [];
  const listed = new Set<string>();
  for (const ride of rides) {
    if (!isGuideRide(ride)) continue;
    const key = normalizeRideName(ride.name);
    const coin = (ride.task_id ? byId.get(ride.task_id) : undefined) ?? byName.get(key);
    if (coin) {
      rideNames.set(coin.id, [...(rideNames.get(coin.id) ?? []), ride.name]);
    } else if (!listed.has(key)) {
      listed.add(key);
      lines.push({ kind: 'line', key: `ride-${ride.id}`, name: ride.name, search: key, ride });
    }
  }
  const coinRows: CoinGuideRow[] = coins.map(task => ({
    kind: 'coin', key: `coin-${task.id}`, name: task.name, task,
    // A coin named "Thunder Mountain" is found by its ride's full name too.
    search: [task.name, ...(rideNames.get(task.id) ?? [])].map(normalizeRideName).join(' '),
  }));
  return [...coinRows, ...lines];
}
