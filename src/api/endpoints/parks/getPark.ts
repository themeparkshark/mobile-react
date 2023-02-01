import { ApiResponseType } from '../../../models/api-response-type';
import { ParkType } from '../../../models/park-type';
import client from '../../client';

export default async function getPark(park: number): Promise<ParkType> {
  const { data } = await client.get<ApiResponseType<ParkType>>(
    `/me/visited-parks/${park}`
  );

  return data.data;
}
