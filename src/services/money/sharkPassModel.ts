/**
 * Shark Pass words and sums, pure (tools/tests/money-offers.test.cjs).
 */
import type { SharkPassReward, SharkPassState, SharkPassTier } from '../../api/endpoints/me/shark-pass';
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

/** A season wearable: a pin, a scene or a profile frame. */
export type Wearable = Extract<SharkPassReward, { type: 'item' | 'frame' }>;
export function isWearable(r: SharkPassReward | null | undefined): r is Wearable {
  return !!r && (r.type === 'item' || r.type === 'frame');
}

/** "2 coins" style words for a reward. Exported for tests. */
export function rewardWords(reward: SharkPassReward): string {
  switch (reward.type) {
    case 'item': case 'frame': return reward.name;
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
    if (isWearable(r)) items += 1;
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


/** The next item reward on either row the player hasn't reached yet, and how far it is. */
export function nextBigPrize(tiers: readonly SharkPassTier[], points: number, perStep: number):
  { tier: number; reward: SharkPassReward; pass: boolean; pointsAway: number } | null {
  for (const t of tiers) {
    if (t.unlocked) continue;
    const reward = isWearable(t.free) ? t.free : isWearable(t.paid) ? t.paid : null;
    if (!reward) continue;
    return { tier: t.tier, reward, pass: reward === t.paid, pointsAway: Math.max(0, t.tier * perStep - points) };
  }
  return null;
}

/** "You'd get 7 rewards right now: Frosty Scarf Pin, 450 coins and more" for the unlock panel. */
export function readyNowLine(tiers: readonly SharkPassTier[]): string | null {
  const ready = tiers.filter(t => t.unlocked).map(t => t.paid);
  if (!ready.length) return null;
  const items = ready.filter(isWearable).map(r => rewardWords(r));
  const coins = ready.reduce((n, r) => n + (r.type === 'coins' ? r.amount : 0), 0);
  const boxes = ready.reduce((n, r) => n + (r.type === 'mystery_box' ? r.boxes : 0), 0);
  const parts = [...items, boxes ? `${boxes} Mystery Pin ${boxes === 1 ? 'Box' : 'Boxes'}` : null, coins ? `${coins.toLocaleString('en-US')} coins` : null]
    .filter(Boolean).slice(0, 3);
  return `Get ${ready.length} Shark Pass ${ready.length === 1 ? 'reward' : 'rewards'} right away: ${parts.join(', ')}${ready.length > parts.length ? ' and more' : ''}.`;
}

/** What a "Claim all" landed, in words: the first three, then "and N more". */
export function claimedLine(rewards: readonly SharkPassReward[]): string {
  // Best first: items, then coins, tickets, Rescue Passes, boxes, energy. Six or fewer are all named.
  const rank: Record<string, number> = { item: 0, frame: 0, coins: 1, tickets: 2, rescue_passes: 3, mystery_box: 4, energy: 5 };
  const words = [...rewards].sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9)).map(rewardWords);
  if (words.length <= 6) return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0] ?? '';
  return words.length <= 3 ? words.join(', ') : `${words.slice(0, 3).join(', ')} and ${words.length - 3} more`;
}

/** "With the Shark Pass you'd also have: Frosty Scarf Pin, Cocoa Mug Pin and 4 more." for steps already reached. */
export function passTwinLine(tiers: readonly SharkPassTier[], premium: boolean): string | null {
  if (premium) return null;
  const waiting = tiers.filter(t => t.unlocked && !t.paid_claimed).map(t => t.paid);
  if (!waiting.length) return null;
  const items = waiting.filter(isWearable);
  const lead = [...items, ...waiting.filter(r => !isWearable(r))].slice(0, 2).map(rewardWords);
  return `With the Shark Pass you’d also have ${lead.join(', ')}${waiting.length > lead.length ? ` and ${waiting.length - lead.length} more` : ''}.`;
}

/** The Shark Pass row's coins, tickets and Rescue Passes added up (energy and pins are listed apart). */
export function passGrants(tiers: readonly SharkPassTier[]): { coins: number; tickets: number; rescue_passes: number; pins: number } {
  const out = { coins: 0, tickets: 0, rescue_passes: 0, pins: 0 };
  for (const { paid } of tiers) {
    if (isWearable(paid)) out.pins += 1;
    else if (paid.type === 'coins' || paid.type === 'tickets' || paid.type === 'rescue_passes') out[paid.type] += paid.amount;
  }
  return out;
}

/** "about 9 ride coin wins away", from the server's own points for a win. Null when unknown. */
export function winsAwayText(pointsAway: number, today: readonly { event: string; points: number }[]): string | null {
  const win = today.find(e => e.event === 'ride_coin_win')?.points ?? 0;
  if (win <= 0 || pointsAway <= 0) return null;
  const n = Math.ceil(pointsAway / win);
  return `about ${n} ride coin ${n === 1 ? 'win' : 'wins'} away`;
}

/** "4 free, 13 on the Shark Pass, 1 with Plus": the set's count, free first. */
export function setMixText(pieces: readonly { row: 'free' | 'pass' | 'plus' }[]): string {
  const c = (r: string) => pieces.filter(p => p.row === r).length;
  return [`${c('free')} free`, `${c('pass')} on the Shark Pass`, ...(c('plus') ? [`${c('plus')} with Plus`] : [])].join(', ');
}

export type SetPiece = {
  readonly reward: Wearable;
  /** 0 for a Shark Pass Plus extra. */
  readonly step: number;
  readonly row: 'free' | 'pass' | 'plus';
  readonly owned: boolean;
};

/**
 * The season set: every wearable this season (pins and scenes), free row first, then the Shark
 * Pass row by step, then Plus. Owned = claimed (Plus extras: owned with Plus). Exported for tests.
 */
export function seasonSet(tiers: readonly SharkPassTier[], plusRewards: readonly SharkPassReward[] = [], plus = false): { pieces: SetPiece[]; owned: number } {
  const free: SetPiece[] = [];
  const pass: SetPiece[] = [];
  for (const t of tiers) {
    if (isWearable(t.free)) free.push({ reward: t.free, step: t.tier, row: 'free', owned: t.free_claimed });
    if (isWearable(t.paid)) pass.push({ reward: t.paid, step: t.tier, row: 'pass', owned: t.paid_claimed });
  }
  const extras: SetPiece[] = plusRewards.flatMap(r => (isWearable(r) ? [{ reward: r, step: 0, row: 'plus' as const, owned: plus }] : []));
  const pieces = [...free, ...pass, ...extras];
  return { pieces, owned: pieces.filter(p => p.owned).length };
}

/** Where a piece comes from, in plain words: "Free at step 10", "Shark Pass, step 20", "Shark Pass Plus". */
export function pieceSource(piece: SetPiece): string {
  if (piece.row === 'plus') return 'Shark Pass Plus';
  return piece.row === 'free' ? `Free at step ${piece.step}` : `Shark Pass, step ${piece.step}`;
}

/** What changed since the last look: points gained and whether a step was crossed. Exported for tests. */
export function passGain(prev: { season: string; points: number; tier: number } | null, state: SharkPassState | null): { gained: number; stepUp: number | null } | null {
  if (!prev || !state || !state.enabled || !state.season || !state.progress || prev.season !== state.season.key) return null;
  const gained = state.progress.points - prev.points;
  if (gained <= 0) return null;
  return { gained, stepUp: state.progress.tier > prev.tier ? state.progress.tier : null };
}

