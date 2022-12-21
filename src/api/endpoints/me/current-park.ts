import client from '../../client';
import { ParkType } from '../../../models/park-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function currentPark(
  latitude: number,
  longitude: number
): Promise<ParkType> {
  const { data } = await client.post<ApiResponseType<ParkType>>(
    '/me/current-park',
    {
      latitude,
      longitude,
    }
  );

  return data.data;
}
