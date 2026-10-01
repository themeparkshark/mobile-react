import client from '../../client';
import { PlayerType } from '../../../models/player-type';

export type RideStandingsMetric = 'today' | 'collection' | 'mastery' | 'masters';

export interface RideStandings {
  data: PlayerType[];
  available: number;
  metric: RideStandingsMetric;
  park_day: string;
}

export default async function rideStandings(parkId: number, metric: RideStandingsMetric): Promise<RideStandings> {
  const { data } = await client.get<RideStandings>(`/parks/${parkId}/ride-standings`, { params: { metric } });
  return data;
}
