import { ApiResponseType } from '../../../models/api-response-type';
import { ParkType } from '../../../models/park-type';
import client from '../../client';

export default async function getVisitedParks(
  player: number
): Promise<ParkType[]> {
  const { data } = await client.get<ApiResponseType<ParkType[]>>(
    `/players/${player}/visited-parks`
  );

  return data.data;
}
