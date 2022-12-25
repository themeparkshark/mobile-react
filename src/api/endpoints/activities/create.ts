import client from '../../client';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function recordActivity(body: string) {
  await client.post<ApiResponseType<[]>>('/activities/create', {
    body,
  });
}
