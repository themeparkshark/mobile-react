/**
 * The Park Day recap -> park_day flex payload. Only three fields cross over:
 * coins caught, new coins and coin art. Never the park, the day, ride names,
 * moments or anything about the player (locked by share-studio.test.cjs).
 */
import type { ParkDayRecap } from '../api/endpoints/me/park-day-recap';
import type { FlexPayloads } from './types';

const whole = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));

export function parkDayFlexPayload(recap: Pick<ParkDayRecap, 'distinct_rides_won' | 'new_coins' | 'coins'>
  & Partial<Pick<ParkDayRecap, 'eligible_line_minutes' | 'coin_upgrades'>>): FlexPayloads['park_day'] {
  // Fix w3 T130: the day's numbers worth bragging about (minutes of line turned into games, level ups)
  // ride along as plain counts. Still no ride or park names: the flex card never prints them (CONTRACT 4).
  const extraStats = [
    { value: whole(recap.eligible_line_minutes), label: 'MIN IN LINE' },
    { value: whole(recap.coin_upgrades), label: recap.coin_upgrades === 1 ? 'LEVEL UP' : 'LEVEL UPS' },
  ].filter(s => s.value > 0);
  return {
    coinsCaught: whole(recap.distinct_rides_won),
    newCoins: whole(recap.new_coins),
    ...(extraStats.length ? { extraStats } : {}),
    coinUrls: (recap.coins ?? []).map(coin => coin.coin_url).filter((url): url is string => typeof url === 'string' && url.length > 0),
  };
}

/** The in-app story's coin row: the day's coins with art and ride name, new ones first, eight at most. */
export function parkDayCoinRow(recap: Pick<ParkDayRecap, 'coins'>): { assetId: number; name: string; url: string | null; isNew: boolean }[] {
  const seen = new Set<number>();
  return (recap.coins ?? [])
    .filter(c => c && typeof c.ride_name === 'string' && c.ride_name.trim() && !seen.has(c.asset_id) && seen.add(c.asset_id))
    .map(c => ({ assetId: c.asset_id, name: c.ride_name.trim(), url: typeof c.coin_url === 'string' && c.coin_url ? c.coin_url : null, isNew: !!c.new }))
    .sort((a, b) => Number(b.isNew) - Number(a.isNew))
    .slice(0, 8);
}
