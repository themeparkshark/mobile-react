import client from '../../client';

export interface CommunityStats {
  total_logs: number;
  unique_riders: number;
  avg_rating: number | null;
  rating_distribution: Record<number, number>;
  top_reactions: Array<{ reaction: string; count: number }>;
}

export async function getCommunityStats(rideId: number): Promise<CommunityStats> {
  const { data } = await client.get(`/rides/${rideId}/community-stats`);
  return data.data;
}
