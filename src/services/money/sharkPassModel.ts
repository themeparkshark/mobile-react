/**
 * Shark Pass words and sums, pure (tools/tests/money-offers.test.cjs).
 */
import type { SharkPassReward, SharkPassTier } from '../../api/endpoints/me/shark-pass';
import type { GameIconName } from '../../ui/iconNames';

/** The server's events in the player's words. Unknown events are left out. */
export const EVENT_COPY: Record<string, { label: string; icon: GameIconName }> = {
  ride_coin_win: { label: 'Win a ride coin', icon: 'coin' },
  mini_game_win: { label: 'Win a mini-game', icon: 'trophy' },
  home_find: { label: 'Grab a home find', icon: 'search' },
  coin_level_up: { label: 'Level up a ride coin', icon: 'parts' },
  daily3_complete: { label: 'Finish your Daily 3', icon: 'check' },
  level_up: { label: 'Level up your shark', icon: 'xp' },
  trail_box_open: { label: 'Open a Trail Box', icon: 'chest' },
  pin_of_day: { label: 'Catch the Pin of the Day', icon: 'pin' },
  mystery_box_open: { label: 'Open a Mystery Pin Box', icon: 'gift' },
  daily_login: { label: 'Play today', icon: 'star' },
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-12-27' -> 'Sunday, December 27' (the parks' calendar day, never relative). */
export function lastDayText(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[day]}, ${MONTHS[m - 1]} ${d}`;
}

/** "2 coins" style words for a reward. Exported for tests. */
export function rewardWords(reward: SharkPassReward): string {
  switch (reward.type) {
    case 'item': return reward.name;
    case 'mystery_box': return reward.boxes === 1 ? '1 Mystery Pin Box' : `${reward.boxes} Mystery Pin Boxes`;
    case 'rescue_passes': return reward.amount === 1 ? '1 Rescue Pass' : `${reward.amount} Rescue Passes`;
    case 'tickets': return `${reward.amount} ${reward.amount === 1 ? 'ticket' : 'tickets'}`;
    case 'energy': return `${reward.amount} energy`;
    default: return `${reward.amount.toLocaleString('en-US')} coins`;
  }
}

/** "6 winter items, 9 Mystery Pin Boxes, 2,550 coins and more" from the real Shark Pass row. */
export function passSummary(tiers: readonly SharkPassTier[]): string {
  let items = 0; let boxes = 0; let coins = 0;
  for (const t of tiers) {
    const r = t.paid;
    if (r.type === 'item') items += 1;
    else if (r.type === 'mystery_box') boxes += r.boxes;
    else if (r.type === 'coins') coins += r.amount;
  }
  const parts = [
    items ? `${items} season ${items === 1 ? 'item' : 'items'}` : null,
    boxes ? `${boxes} Mystery Pin ${boxes === 1 ? 'Box' : 'Boxes'}` : null,
    coins ? `${coins.toLocaleString('en-US')} coins` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')} and more` : 'A reward on every step';
}

