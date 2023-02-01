import { ApiResponseType } from '../../../models/api-response-type';
import { ParkType } from '../../../models/park-type';
import client from '../../client';

export default async function allParks(): Promise<ParkType[]> {
  const { data } = await client.get<ApiResponseType<ParkType[]>>('/parks');

  return data.data;
}
