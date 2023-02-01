import { ApiResponseType } from '../../../models/api-response-type';
import { ParkType } from '../../../models/park-type';
import client from '../../client';

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
