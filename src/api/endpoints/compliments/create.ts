import { ApiResponseType } from '../../../models/api-response-type';
import { ComplimentType } from '../../../models/compliment-type';
import client from '../../client';

export default async function createCompliment(
  user: number
): Promise<ComplimentType> {
  const response = await client.post<ApiResponseType<ComplimentType>>(
    `/users/${user}/compliment`
  );

  return response.data.data;
}
