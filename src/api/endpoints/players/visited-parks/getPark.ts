import { ApiResponseType } from '../../../../models/api-response-type';
import { ParkType } from '../../../../models/park-type';
import client from '../../../client';

export default async function getVisitedPark(
  park: number,
  player: number
): Promise<ParkType> {
  const { data } = await client.get<ApiResponseType<ParkType>>(
    `/players/${player}/visited-parks/${park}`
  );

  return data.data;
}
