import client from '../../client';
import type { FriendPresence } from '../../../components/map/alive/friendsNearby';

export type LiveRideStatus = 'OPERATING' | 'DOWN' | 'CLOSED' | 'REFURBISHMENT' | string;

export interface LiveRush {
  /** ISO time the Rush window closes (fixed when it opened). */
  readonly ends_at: string;
  readonly wait: number;
  readonly typical: number;
}

export interface LiveRide {
  readonly task_id: number;
  readonly status: LiveRideStatus;
  readonly wait: number | null;
  /** This ride's usual wait around now, once the server has learned it. */
  readonly typical: number | null;
  readonly rush: LiveRush | null;
}

export interface LivePark {
  readonly rides: readonly LiveRide[];
  readonly fetched_at: string | null;
  /** Friends in this park who share their spot (optional; drawn as ghost sharks when present). */
  readonly friends_nearby?: readonly FriendPresence[];
}

export async function getParkLive(parkId: number): Promise<LivePark> {
  const { data } = await client.get<{ data: LivePark }>(`/parks/${parkId}/live`);
  return data.data;
}
