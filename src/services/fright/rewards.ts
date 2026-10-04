/**
 * The reward reveal after a done / found / catch. The server sends real items
 * (pins and cosmetics with item_id) and event milestones inside rewards[];
 * the app only renders. Pure, unit tested.
 *
 * Server fields read here (all optional, old servers still render):
 *  - `key` on a milestone item row (first_haunt, ten_in_one, all_haunts,
 *    haunts_5, case_files_10, first_night, encounter, lantern_lv10).
 *  - `owned: true` on an item row the player already had, plus the coins row
 *    the duplicate paid instead.
 */
import type { FrightReward } from '../../api/endpoints/fright/types';
import { caughtHeadline } from './critters';

/** Milestone keys to a short headline (the item name comes from the server). `encounter` names the critter: milestoneLine. */
export const MILESTONE_LINES: Readonly<Record<string, string>> = {
  first_haunt: 'Your first haunt!',
  haunts_5: '5 haunt runs survived!',
  all_haunts: 'Every haunt this season!',
  ten_in_one: 'Every haunt in one night!',
  case_files_10: '10 Case Files found!',
  first_night: 'Your first Fin-ister night!',
  encounter: 'You caught a Chaos critter!',
  lantern_lv10: 'The Lantern is fully lit!',
};

/** The headline for one milestone key; `encounter` uses the live critter's name. */
export function milestoneLine(key: string | null | undefined, critter: string | null = null): string | null {
  if (!key) return null;
  if (key === 'encounter') return caughtHeadline(critter);
  return Object.hasOwn(MILESTONE_LINES, key) ? MILESTONE_LINES[key] : null;
}

const ITEM_KINDS = new Set(['pin', 'cosmetic']);

export function isItemReward(reward: FrightReward): boolean {
  return ITEM_KINDS.has(reward.kind) && reward.item_id != null;
}

/** The player already had this item (server `owned: true`; a duplicate pays coins instead). */
export function isOwned(reward: FrightReward): boolean {
  return reward.owned === true;
}

/** "Added to your wardrobe" for a new real item, "Already yours" for a duplicate. */
export function wardrobeLine(reward: FrightReward): string | null {
  if (!isItemReward(reward)) return null;
  return isOwned(reward) ? 'Already yours' : 'Added to your wardrobe';
}

/** Pins also land on the Deep Lantern (a duplicate pin is already there). */
export function lanternLine(reward: FrightReward): string | null {
  return reward.kind === 'pin' && !isOwned(reward) ? 'On your Deep Lantern too' : null;
}

/**
 * Hero order: an earned cosmetic (the gear is the payoff) before a pin, new
 * before already owned, anything without an item_id last.
 */
function heroRank(reward: FrightReward): number {
  const owned = isOwned(reward) ? 2 : 0;
  if (!isItemReward(reward)) return 10;
  return owned + (reward.kind === 'cosmetic' ? 0 : 1);
}

export interface RewardReveal {
  /** Items in hero order: items[0] is shown large, the rest as the small row. */
  readonly items: readonly FrightReward[];
  /** XP and coins as small chips: "+25 XP", "+10 Coins". */
  readonly chips: readonly string[];
  readonly headline: string;
}

/**
 * What the reveal shows, or null when there is nothing worth a modal (XP alone
 * shows no modal). `critter` is the caught critter's name for the encounter
 * headline (from the catch result or the live encounter).
 */
export function rewardReveal(rewards: readonly FrightReward[] | null | undefined, critter: string | null = null): RewardReveal | null {
  const list = rewards ?? [];
  const items = list.filter(reward => ITEM_KINDS.has(reward.kind))
    .map((reward, index) => ({ reward, index }))
    .sort((a, b) => heroRank(a.reward) - heroRank(b.reward) || a.index - b.index)
    .map(entry => entry.reward);
  if (!items.length) return null;
  const chips = list.filter(reward => (reward.kind === 'xp' || reward.kind === 'coins') && (reward.amount ?? 0) > 0)
    .map(reward => `+${reward.amount} ${reward.kind === 'xp' ? 'XP' : 'Coins'}`);
  // The hero's own milestone first, then any other milestone in the drop.
  const milestone = [items[0], ...list].map(reward => milestoneLine(reward.key, critter)).find(Boolean);
  return { items, chips, headline: milestone ?? (items.length > 1 ? 'New rewards!' : 'New reward!') };
}
