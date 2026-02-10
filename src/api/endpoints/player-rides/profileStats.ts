import client from '../../client';

export interface RideProfileStats {
  total_rides: number;
  unique_rides: number;
  favorite_park: string | null;
  top_rated_ride: string | null;
  top_rated_score: number | null;
  achievement_count: number;
  rider_title: string;
  rider_emoji: string;
}

export async function getRideProfileStats(playerId?: number): Promise<RideProfileStats> {
  const params = playerId ? { player_id: playerId } : {};
  const { data } = await client.get('/player-rides/profile-stats', { params });
  return data.data;
}
