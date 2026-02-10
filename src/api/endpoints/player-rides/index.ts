import client from '../../client';
import { RideType } from '../rides';

export interface PlayerRideType {
  id: number;
  ride_id: number;
  ride_name: string;
  ride_slug: string;
  ride_type: string;
  ride_image_url: string | null;
  park_id: number;
  rating: number | null;
  reaction: string | null;
  wait_time_minutes: number | null;
  note: string | null;
  photo_url: string | null;
  rode_at: string;
  weather: string | null;
}

export interface RideStatsType {
  total_rides: number;
  unique_rides: number;
  per_park: Array<{ park_id: number; park_name: string; count: number }>;
  top_rated: Array<{ id: number; name: string; type: string; park_id: number; avg_rating: number; ride_count: number }>;
  most_ridden: Array<{ id: number; name: string; type: string; park_id: number; ride_count: number }>;
  current_streak: number;
}

export interface RideAchievementType {
  id: number;
  key: string;
  name: string;
  description: string;
  icon: string;
  requirement: Record<string, any>;
  unlocked: boolean;
  unlocked_at: string | null;
}

export interface LogRidePayload {
  ride_id: number;
  rating?: number;
  reaction?: string;
  wait_time_minutes?: number;
  note?: string;
  photo_url?: string;
  rode_at?: string;
  weather?: string;
}

export interface LogRideResponse {
  data: PlayerRideType;
  new_achievements: Array<{
    id: number;
    key: string;
    name: string;
    description: string;
    icon: string;
  }>;
  xp_earned: number;
}

export async function logRide(payload: LogRidePayload): Promise<LogRideResponse> {
  const { data } = await client.post('/player-rides', payload);
  return data;
}

export async function getPlayerRides(params?: {
  park_id?: number;
  ride_id?: number;
  page?: number;
  per_page?: number;
}): Promise<{ data: PlayerRideType[]; meta: { current_page: number; last_page: number; total: number } }> {
  const { data } = await client.get('/player-rides', { params });
  return data;
}

export async function getRideStats(): Promise<RideStatsType> {
  const { data } = await client.get('/player-rides/stats');
  return data.data;
}

export async function getRideAchievements(): Promise<RideAchievementType[]> {
  const { data } = await client.get('/player-rides/achievements');
  return data.data;
}
