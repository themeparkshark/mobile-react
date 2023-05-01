import { ApiResponseType } from '../../../models/api-response-type';
import { DailyGiftType } from '../../../models/daily-gift-type';
import client from '../../client';

export default async function create(): Promise<DailyGiftType> {
  const { data } = await client.post<ApiResponseType<DailyGiftType>>(
    '/daily-gifts'
  );

  return data.data;
}
