import client from '../../../client';
import { ParkType } from '../../../../models/park-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function getVisitedPark(park: number, user: number): Promise<ParkType> {
  const { data } = await client.get<ApiResponseType<ParkType>>(
    `/users/${user}/visited-parks/${park}`
  );

  return data.data;
}
