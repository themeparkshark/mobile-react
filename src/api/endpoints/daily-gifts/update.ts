import { ApiResponseType } from '../../../models/api-response-type';
import { DailyGiftType } from '../../../models/daily-gift-type';
import client from '../../client';

export default async function update(
  dailyGift: number
): Promise<DailyGiftType> {
  const { data } = await client.put<ApiResponseType<DailyGiftType>>(
    `/daily-gifts/${dailyGift}`
  );

  return data.data;
}
