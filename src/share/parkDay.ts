/**
 * The Park Day recap -> park_day flex payload. Only three fields cross over:
 * coins caught, new coins and coin art. Never the park, the day, ride names,
 * moments or anything about the player (locked by share-studio.test.cjs).
 */
import type { ParkDayRecap } from '../api/endpoints/me/park-day-recap';
import type { FlexPayloads } from './types';

export function parkDayFlexPayload(recap: Pick<ParkDayRecap, 'distinct_rides_won' | 'new_coins' | 'coins'>): FlexPayloads['park_day'] {
  return {
    coinsCaught: Math.max(0, Math.floor(Number(recap.distinct_rides_won) || 0)),
    newCoins: Math.max(0, Math.floor(Number(recap.new_coins) || 0)),
    coinUrls: (recap.coins ?? []).map(coin => coin.coin_url).filter((url): url is string => typeof url === 'string' && url.length > 0),
  };
}
