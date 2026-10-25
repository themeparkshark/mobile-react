import { ApiResponseType } from '../../../models/api-response-type';
import { DailyGiftType } from '../../../models/daily-gift-type';
import client from '../../client';
import { QUIET_COIN_BROADCAST, QUIET_ENERGY_BROADCAST } from '../../broadcastFilter';

export default async function update(
  dailyGift: number
): Promise<DailyGiftType> {
  const { data } = await client.put<ApiResponseType<DailyGiftType>>(
    `/daily-gifts/${dailyGift}`,
    undefined,
    // The chest shows its own reward (coins fly to the wallet, the ticket punches in, the battery climbs out);
    // skip the duplicate banners.
    { [QUIET_COIN_BROADCAST]: true, [QUIET_ENERGY_BROADCAST]: true } as Record<string, unknown>,
  );

  return data.data;
}
