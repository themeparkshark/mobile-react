import client from '../../client';
import { ParkType } from '../../../models/park-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function currentPark(park: number): Promise<ParkType> {
  const { data } = await client.get<ApiResponseType<ParkType>>(
    `/parks/${park}`
  );

  return data.data;
}
