import client from '../../client';

export interface ParkCoin {
  task_id: number;
  name: string;
  coin_url: string;
  times_completed: number;
  level: number;
  points: number;
}

export async function getMyParkCoins(parkId: number): Promise<ParkCoin[]> {
  const { data } = await client.get<{ data: ParkCoin[] }>(
    `/me/parks/${parkId}/coins`
  );
  return data.data;
}
