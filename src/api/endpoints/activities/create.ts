import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function recordActivity(body: string) {
  await client.post<ApiResponseType<[]>>('/activities/create', {
    body,
  });
}
