import client from '../../client';

export interface RideType {
  id: number;
  name: string;
  slug: string;
  park_id: number;
  park_name: string | null;
  type: 'coaster' | 'dark_ride' | 'flat_ride' | 'water_ride' | 'show' | 'walk_through' | 'transport' | 'other';
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  metadata: {
    speed?: number;
    height?: number;
    inversions?: number;
    year_opened?: number;
    manufacturer?: string;
  } | null;
  radius: number;
  ride_duration_minutes: number | null;
  min_dwell_minutes: number | null;
}

export async function getRides(parkId?: number): Promise<RideType[]> {
  const params = parkId ? { park_id: parkId } : {};
  const { data } = await client.get('/rides', { params });
  return data.data;
}

export async function getRide(rideId: number): Promise<RideType> {
  const { data } = await client.get(`/rides/${rideId}`);
  return data.data;
}
