/**
 * Set screen logic for Home Hunt sets (hero row, exchange costs, gate badges,
 * the milestone track and the claim outcome). Pure, so it is unit tested in
 * tools/tests/home-hunt-sets.test.cjs. Legacy sets send milestones: null and
 * keep the starter claim flow; authored sets use the milestone endpoint for
 * every key, including starter.
 */
import type {
  MilestoneClaimResult, PrepItemSetItem, SetItemGate, SetMilestone, SetWearableChoice,
} from '../../api/endpoints/me/prep-item-sets';
import type { GameIconName } from '../../ui/iconNames';

export const ADDED_TO_INVENTORY = 'Added to your Inventory';
export const WEARABLE_PENDING = 'Your wearable is on the way';
export const WEAR_IT = 'WEAR IT';

/** Authored sets send a milestone list; legacy sets send null. */
export function authoredMilestones(
  progress: { readonly milestones?: readonly SetMilestone[] | null } | null | undefined,
  detail?: { readonly milestones?: readonly SetMilestone[] | null } | null,
): readonly SetMilestone[] | null {
  const list = progress?.milestones ?? detail?.milestones ?? null;
  return Array.isArray(list) && list.length > 0 ? list : null;
}

const RARITY_NAME: Record<number, string> = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };
export const rarityName = (rarity: number): string => RARITY_NAME[rarity] ?? 'Common';

/** Legendary first, then the epics (in their set order). Empty when the set has neither. */
export function heroItems(items: readonly PrepItemSetItem[] | null | undefined): readonly PrepItemSetItem[] {
  const list = Array.isArray(items) ? items : [];
  const legendary = list.filter(item => item.rarity >= 5);
  const epics = list.filter(item => item.rarity === 4);
  return [...legendary, ...epics];
}

export interface ExchangeCostRow { readonly rarity: number; readonly label: string; readonly cost: number }

/** Per-rarity exchange costs, top rarity first. Reads progress.exchange_costs, then each item's own cost. */
export function exchangeCostRows(
  costs: Readonly<Record<string, number>> | null | undefined,
  items: readonly PrepItemSetItem[] | null | undefined,
): readonly ExchangeCostRow[] {
  const byRarity = new Map<number, number>();
  if (costs && typeof costs === 'object') {
    for (const [key, value] of Object.entries(costs)) {
      const rarity = Number(key);
      if (Number.isFinite(rarity) && Number.isFinite(value) && value > 0) byRarity.set(rarity, value);
    }
  }
  for (const item of Array.isArray(items) ? items : []) {
    if (!byRarity.has(item.rarity) && Number.isFinite(item.exchange_cost) && (item.exchange_cost as number) > 0) {
      byRarity.set(item.rarity, item.exchange_cost as number);
    }
  }
  return [...byRarity.entries()].sort((a, b) => b[0] - a[0]).map(([rarity, cost]) => ({ rarity, label: rarityName(rarity), cost }));
}

/** Cost for one item: its own, then its rarity's, then the set-wide cost. */
export function itemExchangeCost(item: PrepItemSetItem, costs: Readonly<Record<string, number>> | null | undefined, fallback: number): number {
  if (Number.isFinite(item.exchange_cost) && (item.exchange_cost as number) > 0) return item.exchange_cost as number;
  const byRarity = costs?.[String(item.rarity)];
  return Number.isFinite(byRarity) && (byRarity as number) > 0 ? (byRarity as number) : fallback;
}

/** Gate badge art. The kit has no weather or moon icon, so existing icons stand in. */
export function gateIcon(gate: SetItemGate | null | undefined): GameIconName | null {
  if (!gate) return null;
  if (gate.type === 'hours') return 'timer';
  if (gate.type === 'evening') return 'star';
  return 'sparkle';
}

export function gateLabel(gate: SetItemGate | null | undefined): string {
  if (!gate) return '';
  return gate.type === 'hours' ? 'Opening hours' : gate.type === 'evening' ? 'Evening only' : 'Weather';
}

/** The gate explainer, verbatim from the server, plus the exchange rule. */
export function gateExplainer(gate: SetItemGate | null | undefined): string {
  const text = typeof gate?.explainer === 'string' ? gate.explainer.trim() : '';
  return text;
}

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

function rewardLine(rewards: SetMilestone['rewards'] | undefined): string {
  const parts: string[] = [];
  if ((rewards?.energy ?? 0) > 0) parts.push(`${rewards?.energy} Energy`);
  if ((rewards?.tickets ?? 0) > 0) parts.push(`${rewards?.tickets} ${rewards?.tickets === 1 ? 'Ticket' : 'Tickets'}`);
  if ((rewards?.experience ?? 0) > 0) parts.push(`${rewards?.experience} XP`);
  if (rewards?.title) parts.push(`${rewards.title} title`);
  if (rewards?.wearable_name) parts.push(rewards.wearable_name);
  else if (rewards?.pick) parts.push('a wearable of your choice');
  if (rewards?.shelf_trim) parts.push(rewards.shelf_trim);
  return parts.join(', ');
}

/** The track in target order (8, 20, 30, 40). A claim opens a pick sheet when the reward is a wearable pick. */
export function milestoneTrack(milestones: readonly SetMilestone[] | null | undefined): readonly MilestoneView[] {
  const list = Array.isArray(milestones) ? milestones : [];
  return list.slice().sort((a, b) => a.target - b.target).map(milestone => {
    const choices: SetWearableChoice[] = Array.isArray(milestone.wearable_choices) ? milestone.wearable_choices : [];
    const target = Math.max(1, Number(milestone.target) || 1);
    const collected = Math.max(0, Number(milestone.collected) || 0);
    return {
      key: milestone.key,
      label: milestone.label || `${target} finds`,
      target,
      collected,
      progress: Math.min(1, collected / target),
      monthGoal: milestone.month_goal === true,
      status: milestone.status,
      canClaim: milestone.status === 'claimable',
      needsPick: milestone.rewards?.pick === true && choices.some(choice => !choice.owned),
      pending: milestone.status === 'pending',
      choices,
      rewardLine: rewardLine(milestone.rewards),
    };
  });
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
