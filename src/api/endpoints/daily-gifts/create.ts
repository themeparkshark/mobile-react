import { ApiResponseType } from '../../../models/api-response-type';
import { DailyGiftType } from '../../../models/daily-gift-type';
import client from '../../client';

/** The device's IANA timezone, so the chest turns over at the player's midnight. */
export function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export default async function create(): Promise<DailyGiftType> {
  const timezone = deviceTimezone();
  const { data } = await client.post<ApiResponseType<DailyGiftType>>(
    '/daily-gifts',
    timezone ? { timezone } : undefined
  );

  return data.data;
}
