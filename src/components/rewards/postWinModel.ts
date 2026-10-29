/**
 * Pure presentation model for the post-win summary: which reward chips show,
 * the collection milestone headline, the next unlock line and the Ride Parts
 * meter. Every number comes from the server's confirmed attempt; this only
 * decides what to say about it. No emoji, no em dashes.
 */
import type { GameIconName } from '../../ui/iconNames';
import type { CollectionMilestones } from '../../api/endpoints/me/ride-coins/milestones';
import type { RideCoinLevelType } from '../../models/ride-coin-level-type';

export interface RewardChipModel { readonly icon: GameIconName; readonly amount: number; readonly label: string }

export function rewardChips({ coinsEarned, xpEarned, ridePartsEarned, energyEarned }: {
  coinsEarned: number; xpEarned: number; ridePartsEarned: number; energyEarned: number;
}): RewardChipModel[] {
  return ([
    { icon: 'coins', amount: coinsEarned, label: 'Coins' },
    { icon: 'xp', amount: xpEarned, label: 'XP' },
    { icon: 'parts', amount: ridePartsEarned, label: ridePartsEarned === 1 ? 'Ride Part' : 'Ride Parts' },
    { icon: 'energy', amount: energyEarned, label: 'Energy' },
  ] as RewardChipModel[]).filter(chip => chip.amount > 0);
}

export interface MilestoneHeadline {
  readonly ribbon: string;
  readonly title: string;
  readonly body: string;
  readonly icon: GameIconName;
  /** Park complete gets the big gold treatment. */
  readonly big: boolean;
}

/** The biggest thing this win did for the park shelf, or null. */
export function milestoneHeadline(result: CollectionMilestones | null): MilestoneHeadline | null {
  if (!result?.progress || !result.milestones.length) return null;
  const { park_name: park, collected, available } = result.progress;
  const types = result.milestones.map(milestone => milestone.type);
  if (types.includes('park_complete')) {
    return { ribbon: 'Shelf Complete!', title: `${park} shelf complete`, big: true, icon: 'trophy',
      body: `All ${available} Ride Coins collected. Every ride on this shelf is yours.` };
  }
  const percent = result.milestones.find(milestone => milestone.type === 'park_percent')?.percent;
  if (percent) {
    return { ribbon: `${percent}% Shelf!`, title: `${park} shelf ${percent}% full`, big: false, icon: 'star',
      body: `${collected} of ${available} Ride Coins collected.` };
  }
  if (types.includes('first_park_coin')) {
    return { ribbon: 'First Coin Here!', title: `First coin at ${park}`, big: false, icon: 'new',
      body: `Your ${park} shelf is open. ${available - collected} more to find.` };
  }
  return null;
}

/** "2 more ride coins for 50% of the shelf". Null when the shelf is complete or unknown. */
export function nextUnlockLine(result: CollectionMilestones | null): string | null {
  if (!result?.progress || !result.next) return null;
  const { coins_needed: needed, percent } = result.next;
  const what = percent >= 100 ? 'to complete the shelf' : `for ${percent}% of the shelf`;
  return `${needed} more ${needed === 1 ? 'ride coin' : 'ride coins'} ${what}.`;
}

export interface PartsProgress {
  readonly have: number;
  readonly need: number;
  readonly nextLevel: number;
  /** Meter fill 0..1 before and after this win's parts. */
  readonly before: number;
  readonly after: number;
  readonly ready: boolean;
  readonly maxed: boolean;
  readonly hint: string;
}

/** The coin's Ride Parts meter after this win, with what is still missing. */
export function partsProgress(coin: Pick<RideCoinLevelType, 'current_level' | 'max_level' | 'parts_to_next_level' |
  'available_parts' | 'energy_to_next_level' | 'is_unlocked'> | null, playerEnergy: number | null | undefined,
  partsEarned: number): PartsProgress | null {
  if (!coin) return null;
  const maxed = coin.current_level >= coin.max_level;
  const need = Math.max(0, coin.parts_to_next_level);
  const have = Math.max(0, coin.available_parts ?? 0);
  const clamp = (value: number) => need > 0 ? Math.max(0, Math.min(1, value / need)) : 1;
  const energyKnown = typeof playerEnergy === 'number';
  const missingEnergy = energyKnown ? Math.max(0, coin.energy_to_next_level - (playerEnergy as number)) : 0;
  const missingParts = Math.max(0, need - have);
  const ready = !maxed && coin.is_unlocked && energyKnown && missingParts === 0 && missingEnergy === 0;
  const nextLevel = Math.min(coin.max_level, coin.current_level + 1);
  const hint = maxed ? 'Top level! Show it off on your profile.'
    : missingParts > 0 && missingEnergy > 0 ? `${missingParts} more Ride Part${missingParts === 1 ? '' : 's'} and ${missingEnergy} Energy for Level ${nextLevel}.`
    : missingParts > 0 ? `${missingParts} more Ride Part${missingParts === 1 ? '' : 's'} for Level ${nextLevel}.`
    : missingEnergy > 0 ? `${missingEnergy} more Energy for Level ${nextLevel}. Find it on your home map.`
    : `Level ${nextLevel} is ready.`;
  return { have, need, nextLevel, before: clamp(have - Math.max(0, partsEarned)), after: clamp(have), ready, maxed, hint };
}

/* ---------- The core-loop win card (blueprint 5.3 and 5.13) ---------- */

/** The park trophies, in coins (shelf-words draws them on the park screen). */
export const TROPHY_STEPS: readonly { readonly name: string; readonly at: number }[] = [
  { name: 'Bronze', at: 12 }, { name: 'Silver', at: 50 }, { name: 'Gold', at: 100 },
];

/**
 * The shelf line under a new coin: "1 of 35 coins. Bronze at 12". The next
 * trophy this shelf can still reach; a shelf too small for the next trophy
 * names the full shelf instead; a full shelf says so. Null without numbers.
 */
export function shelfLine(result: CollectionMilestones | null | undefined): string | null {
  const progress = result?.progress;
  if (!progress || !(progress.available > 0)) return null;
  const have = Math.max(0, Math.min(progress.collected, progress.available));
  const lead = `${have} of ${progress.available} coins.`;
  if (have >= progress.available) return `${lead} Shelf complete!`;
  const trophy = TROPHY_STEPS.find(step => have < step.at && step.at <= progress.available);
  return trophy ? `${lead} ${trophy.name} at ${trophy.at}` : `${lead} Full shelf at ${progress.available}`;
}

export interface WinRowInput {
  readonly coins: number;
  readonly tickets: number;
  readonly parts: number;
  readonly energy: number;
  readonly xp: number;
  /** VIP double coins already granted for a member (one "+N VIP" chip, no button). */
  readonly vipCoins?: number;
  /** Rung 3 (coin levels): Parts and Energy show as themselves. */
  readonly coinLevelsOpen: boolean;
  /** Rung 4 (daily): XP shows on the card. */
  readonly dailyOpen: boolean;
}

/**
 * Where the win card's rewards fly (blueprint 4.2), by the names the map registers with
 * CurrencyFlyProvider: the header pills register 'coins' and 'tickets' (Topbar Currency
 * flyTarget), the Shelf button 'energy' and the Profile tab 'xp' (guide-map's flyAnchors), and
 * the Rewards button 'rewards' (guide-map's RewardsButton).
 */
export type WinFlyTarget = 'coins' | 'tickets' | 'energy' | 'xp' | 'rewards';

/**
 * Each reward's targets in order: the first one the map has registered wins. A stamp lands on the
 * Rewards button; on a map that has not drawn one yet it lands on the Profile tab, where the Stamp
 * Book lives, so a won stamp always has a place to fly (never silently dropped).
 */
export const WIN_FLY_ROUTES: Readonly<Record<'coins' | 'tickets' | 'energy' | 'parts' | 'xp' | 'stamp', readonly WinFlyTarget[]>> = {
  coins: ['coins'],
  tickets: ['tickets'],
  energy: ['energy'],
  parts: ['energy'],
  xp: ['xp'],
  stamp: ['rewards', 'xp'],
};

/** The first registered target of a route, or null when the map has drawn none of them. */
export function flyTargetFor(route: readonly WinFlyTarget[], registered: (name: string) => unknown): WinFlyTarget | null {
  return route.find(name => !!registered(name)) ?? null;
}

export interface WinChip extends RewardChipModel {
  /** Where it flies when the card closes (CurrencyFly targets, blueprint 4.2). */
  readonly flyTo: WinFlyTarget;
  /** A shorter, kinder chip (Energy before rung 3: "saved for growing coins"). */
  readonly quiet?: boolean;
}

/**
 * The one reward row. Shark Coins and Tickets always; the member's VIP coins
 * as one chip; Parts and Energy only after rung 3 (before it Energy shows as
 * the battery "saved for growing coins"); XP only after rung 4 (before it, it
 * still flies to the Profile tab, with no chip). Never a "+0".
 */
export function winRewardChips(input: WinRowInput): WinChip[] {
  const chips: WinChip[] = [];
  const n = (value: number | undefined) => (Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : 0);
  if (n(input.coins)) chips.push({ icon: 'coins', amount: n(input.coins), label: 'Shark Coins', flyTo: 'coins' });
  if (n(input.vipCoins)) chips.push({ icon: 'member', amount: n(input.vipCoins), label: 'VIP', flyTo: 'coins' });
  if (n(input.tickets)) chips.push({ icon: 'ticket', amount: n(input.tickets), label: n(input.tickets) === 1 ? 'Ticket' : 'Tickets', flyTo: 'tickets' });
  if (input.coinLevelsOpen && n(input.parts)) {
    chips.push({ icon: 'parts', amount: n(input.parts), label: n(input.parts) === 1 ? 'Ride Part' : 'Ride Parts', flyTo: 'energy' });
  }
  if (n(input.energy)) {
    chips.push(input.coinLevelsOpen
      ? { icon: 'energy', amount: n(input.energy), label: 'Energy', flyTo: 'energy' }
      : { icon: 'energy', amount: n(input.energy), label: 'saved for growing coins', flyTo: 'energy', quiet: true });
  }
  if (input.dailyOpen && n(input.xp)) chips.push({ icon: 'xp', amount: n(input.xp), label: 'XP', flyTo: 'xp' });
  return chips;
}

/**
 * The one team sentence after a team pick: "Team Shark took Main Street".
 * No points, no Captain (the Ride Control sheet explains both). Nothing when
 * the player has no team yet: the team offer is its own step after the card.
 */
export function teamSentence(result: {
  needs_team?: boolean; team?: string; ride_name?: string | null; flipped?: boolean; controller?: string | null;
} | null | undefined, teamName: (team: string) => string): string | null {
  if (!result || result.needs_team || !result.team) return null;
  const team = teamName(result.team);
  const ride = (result.ride_name ?? '').trim() || 'this ride';
  if (result.flipped) return `${team} took ${ride}`;
  if (result.controller === result.team) return `${team} holds ${ride}`;
  return `Your win helps ${team} at ${ride}`;
}

/** "1 coin this week" (the Standings count, one per ride per park day). Null when the server did not count it. */
export function weekLine(standings: unknown): string | null {
  const s = standings as { counted?: unknown; week_rides?: unknown } | null | undefined;
  if (!s || s.counted !== true) return null;
  const week = Math.max(1, Math.floor(Number(s.week_rides) || 0));
  return `${week} ${week === 1 ? 'coin' : 'coins'} this week`;
}

/** The win card's big button: the next coin by name and distance, or today's Adventure line story. */
export interface NextCoinButton {
  readonly kind: 'next' | 'line_story' | 'map';
  readonly label: string;
  readonly detail: string | null;
}

export function nextCoinButton(target: {
  taskId: number; name: string; meters: number | null; reason: string;
} | null | undefined, wonTaskId: number | null | undefined): NextCoinButton {
  if (target && wonTaskId != null && target.taskId === wonTaskId && target.reason === 'line_story') {
    return { kind: 'line_story', label: 'Play its line story', detail: null };
  }
  if (target && target.taskId !== wonTaskId) {
    const meters = typeof target.meters === 'number' && Number.isFinite(target.meters) ? Math.max(0, Math.round(target.meters)) : null;
    const where = meters === null ? null : meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
    return { kind: 'next', label: 'NEXT COIN', detail: [target.name, where].filter(Boolean).join(', ') || null };
  }
  return { kind: 'map', label: 'NEXT COIN', detail: null };
}
