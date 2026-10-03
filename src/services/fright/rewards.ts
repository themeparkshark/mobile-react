/**
 * The reward reveal after a done / found / catch. The server sends real items
 * (pins and cosmetics with item_id) and event milestones inside rewards[];
 * the app only renders. Pure, unit tested.
 */
import type { FrightReward } from '../../api/endpoints/fright/types';

/** Milestone keys to a short headline (the item name comes from the server). */
export const MILESTONE_LINES: Readonly<Record<string, string>> = {
  first_haunt: 'Your first haunt!',
  haunts_5: '5 haunts survived!',
  all_haunts: 'Every haunt survived!',
  ten_in_one: 'Ten-in-One night!',
  case_files_10: '10 Case Files found!',
  first_night: 'Your first Fin-ister night!',
  encounter: 'You caught the Lantern Star!',
  lantern_lv10: 'The Lantern is fully lit!',
};

const ITEM_KINDS = new Set(['pin', 'cosmetic']);

export function isItemReward(reward: FrightReward): boolean {
  return ITEM_KINDS.has(reward.kind) && reward.item_id != null;
}

/** "Added to your wardrobe" only for a real item (pin or cosmetic with an item_id). */
export function wardrobeLine(reward: FrightReward): string | null {
  return isItemReward(reward) ? 'Added to your wardrobe' : null;
}

/** Pins also land on the Deep Lantern. */
export function lanternLine(reward: FrightReward): string | null {
  return reward.kind === 'pin' ? 'On your Deep Lantern too' : null;
}

export interface RewardReveal {
  /** Items first (pins, then cosmetics), the headline item shown large. */
  readonly items: readonly FrightReward[];
  /** XP and coins as small chips: "+25 XP", "+10 Coins". */
  readonly chips: readonly string[];
  readonly headline: string;
}

/** What the reveal shows, or null when there is nothing worth a modal (XP alone shows no modal). */
export function rewardReveal(rewards: readonly FrightReward[] | null | undefined): RewardReveal | null {
  const list = rewards ?? [];
  const items = list.filter(reward => ITEM_KINDS.has(reward.kind))
    .sort((a, b) => (a.kind === 'pin' ? 0 : 1) - (b.kind === 'pin' ? 0 : 1));
  if (!items.length) return null;
  const chips = list.filter(reward => (reward.kind === 'xp' || reward.kind === 'coins') && (reward.amount ?? 0) > 0)
    .map(reward => `+${reward.amount} ${reward.kind === 'xp' ? 'XP' : 'Coins'}`);
  const milestone = items.map(item => item.key ? MILESTONE_LINES[item.key] : undefined).find(Boolean);
  return { items, chips, headline: milestone ?? (items.length > 1 ? 'New rewards!' : 'New reward!') };
}
