import client from '../../client';
import { ApiResponseType } from '../../../models/api-response-type';
import {ParkType} from '../../../models/park-type';

export default async function getVisitedParks(user: number): Promise<ParkType[]> {
  const { data } = await client.get<ApiResponseType<ParkType[]>>(
    `/users/${user}/visited-parks`
  );

  return data.data;
}
