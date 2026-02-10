import client from '../../client';

export interface WrappedData {
  period: string;
  year: number;
  month: number | null;
  total_rides: number;
  unique_rides: number;
  ride_days: number;
  most_ridden: { id: number; name: string; count: number } | null;
  favorite_park: { id: number; name: string; count: number } | null;
  top_rated: { id: number; name: string; avg_rating: number } | null;
  longest_streak: number;
  achievements_earned: number;
  park_breakdown: { id: number; name: string; count: number }[];
  reactions: { reaction: string; count: number }[];
}

export async function getWrapped(params: {
  period: 'monthly' | 'yearly';
  year: number;
  month?: number;
}): Promise<WrappedData> {
  const { data } = await client.get('/player-rides/wrapped', { params });
  return data.data;
}
