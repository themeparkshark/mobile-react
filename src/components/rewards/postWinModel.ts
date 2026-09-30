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
    { icon: 'coins', amount: coinsEarned, label: 'Shark Coins' },
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

/** "2 more coins for 50% of the shelf". Null when the shelf is complete or unknown. */
export function nextUnlockLine(result: CollectionMilestones | null): string | null {
  if (!result?.progress || !result.next) return null;
  const { coins_needed: needed, percent } = result.next;
  const what = percent >= 100 ? 'to complete the shelf' : `for ${percent}% of the shelf`;
  return `${needed} more ${needed === 1 ? 'coin' : 'coins'} ${what}.`;
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
  const hint = maxed ? 'Max level. Feature it on your profile.'
    : missingParts > 0 && missingEnergy > 0 ? `${missingParts} more Ride Part${missingParts === 1 ? '' : 's'} and ${missingEnergy} Energy for Level ${nextLevel}.`
    : missingParts > 0 ? `${missingParts} more Ride Part${missingParts === 1 ? '' : 's'} for Level ${nextLevel}.`
    : missingEnergy > 0 ? `${missingEnergy} more Energy for Level ${nextLevel}. Find it on your home map.`
    : `Level ${nextLevel} is ready.`;
  return { have, need, nextLevel, before: clamp(have - Math.max(0, partsEarned)), after: clamp(have), ready, maxed, hint };
}
