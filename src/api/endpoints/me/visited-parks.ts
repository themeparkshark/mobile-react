import client from '../../client';
import { ParkType } from '../../../models/park-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function visitedParks(): Promise<ParkType[]> {
  const { data } = await client.get<ApiResponseType<ParkType[]>>(
    '/me/visited-parks'
  );

  return data.data;
}
