/**
 * Reward claim logic for the collection book: the wearable pick rule and what
 * to tell the player after a milestone claim. Pure, so it is unit tested in
 * tools/tests/home-hunt-sets.test.cjs. The rest of the book's logic lives in
 * dexModel.ts.
 */
import type { MilestoneClaimResult, SetMilestone, SetWearableChoice } from '../../api/endpoints/me/prep-item-sets';

export const ADDED_TO_INVENTORY = 'Added to your Inventory';
export const WEARABLE_PENDING = 'Your wearable is on the way';
export const WEAR_IT = 'WEAR IT';

export interface MilestoneView {
  readonly key: SetMilestone['key'];
  readonly label: string;
  readonly target: number;
  readonly collected: number;
  readonly progress: number;
  readonly monthGoal: boolean;
  readonly status: SetMilestone['status'];
  readonly canClaim: boolean;
  readonly needsPick: boolean;
  readonly pending: boolean;
  readonly choices: readonly SetWearableChoice[];
  readonly rewardLine: string;
}

/** A pick must name an unowned choice before the claim is sent. */
export function validPick(milestone: Pick<MilestoneView, 'needsPick' | 'choices'>, pickedId: number | null): boolean {
  if (!milestone.needsPick) return true;
  return pickedId != null && milestone.choices.some(choice => choice.id === pickedId && !choice.owned);
}

export interface ClaimOutcome {
  readonly toast: string | null;
  readonly pendingLine: string | null;
  readonly ticketNote: string | null;
  readonly wear: { readonly itemId: number; readonly itemTypeId: number; readonly name: string } | null;
}

/** What to tell the player after a milestone claim. */
export function claimOutcome(result: MilestoneClaimResult | null | undefined): ClaimOutcome {
  const granted = result?.rewards_granted;
  const item = granted?.item;
  const wear = item && Number.isFinite(item.id) && Number.isFinite(item.item_type_id)
    ? { itemId: item.id, itemTypeId: item.item_type_id, name: item.name } : null;
  const pending = typeof granted?.pending_wearable === 'string' && granted.pending_wearable.trim() ? WEARABLE_PENDING : null;
  return {
    toast: wear ? ADDED_TO_INVENTORY : null,
    pendingLine: pending,
    ticketNote: granted?.ticket_note ?? null,
    wear,
  };
}

/** Params for RootNavigation.navigate('Inventory', ...) after WEAR IT equips the item. */
export function wearNavigationParams(wear: { readonly itemId: number; readonly itemTypeId: number }): { itemTypeId: number; focusItemId: number } {
  return { itemTypeId: wear.itemTypeId, focusItemId: wear.itemId };
}
