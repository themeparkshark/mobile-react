import { PrepItemSetType } from '../../../../models/prep-item-set-type';
import client from '../../../client';
import { LocationType } from '../../../../models/location-type';
import deviceTimeZone from '../../../../helpers/deviceTimeZone';

/**
 * Get all prep item sets with player progress.
 */
export interface PrepItemSetsResponse {
  success: boolean;
  data: PrepItemSetListItem[];
}

export interface StarterMilestone {
  target: number;
  collected: number;
  is_unlocked: boolean;
  rewards_claimed: boolean;
  rewards: { energy: number; tickets: number; experience: number; title?: string };
  wearable_choices?: { id: number; name: string; item_type_id: number; icon_url: string | null; paper_url: string | null; owned: boolean }[];
  awarded_item_id?: number | null;
}

export type SetMilestoneKey = 'starter' | 'explorer' | 'complete' | 'master' | 'encore';
export type SetMilestoneStatus = 'locked' | 'claimable' | 'claimed' | 'pending';

export interface SetWearableChoice {
  id: number;
  name: string;
  item_type_id: number;
  icon_url: string | null;
  paper_url: string | null;
  owned: boolean;
}

/** Authored sets only. Legacy sets send milestones: null and keep the starter flow. */
export interface SetMilestone {
  key: SetMilestoneKey;
  label: string;
  target: number;
  collected: number;
  is_unlocked: boolean;
  status: SetMilestoneStatus;
  month_goal?: boolean;
  hunt_points?: number;
  rewards: {
    energy?: number;
    tickets?: number;
    experience?: number;
    title?: string;
    wearable_name?: string;
    shelf_trim?: string;
    pick?: boolean;
  };
  wearable_choices?: SetWearableChoice[];
}

/** Gate on an item: weather, evening or opening hours. The server writes the explainer. */
export interface SetItemGate {
  type: 'weather' | 'evening' | 'hours';
  explainer: string;
}

export interface PrepItemSetListItem {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon_url: string | null;
  theme: string;
  theme_config: {
    label: string;
    color: string;
  };
  rarity: string;
  is_focused: boolean;
  /** False for an earned book that is currently off the home map. */
  is_in_rotation?: boolean;
  availability?: 'current' | 'upcoming' | 'archived';
  starts_at?: string | null;
  ends_at?: string | null;
  time_gate: {
    start_hour: number | null;
    end_hour: number | null;
    description: string;
    is_spawning_now: boolean | null;
  } | null;
  weather_gate: string[] | null;
  total_items: number;
  collected_count: number;
  progress_percentage: number;
  is_complete: boolean;
  spare_count: number;
  recent_gift_count?: number;
  exchange_cost: number;
  /** Absent from the live list endpoint; getPrepItemSets fills it from the detail for finished sets. */
  rewards_claimed?: boolean;
  starter_milestone: StarterMilestone | null;
  milestones?: SetMilestone[] | null;
  completion_rewards: {
    energy: number;
    tickets: number;
    experience: number;
    title: string | null;
    badge_url: string | null;
  };
}

export default async function getPrepItemSets(location?: LocationType): Promise<PrepItemSetListItem[]> {
  const { data } = await client.get<PrepItemSetsResponse>('/me/prep-item-sets', {
    params: { ...(location ? { lat: location.latitude, lng: location.longitude } : {}), timezone: deviceTimeZone() },
  });
  return withClaimState(data.data, location);
}

/**
 * The live list endpoint leaves `rewards_claimed` out (only the set detail sends it, as progress.rewards_claimed),
 * so a finished, already-claimed set would read as claimable forever. For finished sets missing the field, ask the
 * detail once. A server that sends the field costs no extra call; a failed detail keeps the entry as it came.
 */
export async function withClaimState(sets: PrepItemSetListItem[], location?: LocationType): Promise<PrepItemSetListItem[]> {
  const unknown = sets.filter(set => set.is_complete && typeof set.rewards_claimed !== 'boolean');
  if (!unknown.length) return sets;
  const claimed = new Map<string, boolean>();
  await Promise.all(unknown.map(async set => {
    try {
      const detail = await getPrepItemSet(set.slug, location);
      if (typeof detail?.progress?.rewards_claimed === 'boolean') claimed.set(set.slug, detail.progress.rewards_claimed);
    } catch { /* keep the list entry as sent */ }
  }));
  return sets.map(set => (claimed.has(set.slug) ? { ...set, rewards_claimed: claimed.get(set.slug)! } : set));
}

/**
 * Get a single set with all items and collection status.
 */
export interface PrepItemSetDetailResponse {
  success: boolean;
  data: {
    set: {
      id: number;
      slug: string;
      name: string;
      description: string;
      icon_url: string | null;
      theme: string;
      is_focused: boolean;
      is_in_rotation?: boolean;
      theme_config: { label: string; color: string };
      time_gate: {
        start_hour: number | null;
        end_hour: number | null;
        description: string;
        is_spawning_now: boolean | null;
      } | null;
    };
    progress: {
      total: number;
      collected: number;
      percentage: number;
      is_complete: boolean;
      collected_ids: number[];
      spare_count: number;
      exchange_cost: number;
      /** Authored sets: cost by rarity number, for example { 1: 4, 4: 8, 5: 12 }. */
      exchange_costs?: Record<string, number> | null;
      rewards_claimed: boolean;
      starter_milestone: StarterMilestone | null;
      milestones?: SetMilestone[] | null;
    };
    milestones?: SetMilestone[] | null;
    discovery?: {
      found_in_world: number;
      legendary_found_in_world: number;
      legendary_total: number;
    };
    recent_gifts?: {
      id: number;
      prep_item_id: number;
      item_name: string;
      variant_slug: string | null;
      sender_name: string;
      created_at: string;
    }[];
    items: PrepItemSetItem[];
    items_by_rarity: {
      legendary: PrepItemSetItem[];
      epic: PrepItemSetItem[];
      rare: PrepItemSetItem[];
      uncommon: PrepItemSetItem[];
      common: PrepItemSetItem[];
    };
    completion_rewards: {
      energy: number;
      tickets: number;
      experience: number;
      title: string | null;
      badge_url: string | null;
    };
  };
}

export interface PrepItemSetItem {
  id: number;
  name: string;
  variant_slug: string;
  description: string;
  icon_url: string | null;
  rarity: number;
  rarity_name: string;
  rarity_label: string;
  rarity_color: string;
  rewards: {
    energy: number;
    experience: number;
    ticket_chance: number;
    ticket_amount: number;
  };
  is_collected: boolean;
  found_in_world?: boolean;
  quantity_collected: number;
  first_collected_at: string | null;
  last_collected_at: string | null;
  gate?: SetItemGate | null;
  /** Exchange cost for this item's rarity (authored sets). */
  exchange_cost?: number | null;
}

export async function getPrepItemSet(slug: string, location?: LocationType): Promise<PrepItemSetDetailResponse['data']> {
  const { data } = await client.get<PrepItemSetDetailResponse>(`/me/prep-item-sets/${slug}`, {
    params: { ...(location ? { lat: location.latitude, lng: location.longitude } : {}), timezone: deviceTimeZone() },
  });
  return data.data;
}

/**
 * Claim completion rewards for a finished set.
 */
export interface ClaimRewardsResponse {
  success: boolean;
  data: {
    rewards_granted: {
      energy: number;
      tickets: number;
      experience: number;
      title: string | null;
      badge_url: string | null;
    };
    new_totals: {
      energy: number;
      tickets: number;
      experience: number;
    };
  };
}

export async function claimSetRewards(slug: string): Promise<ClaimRewardsResponse['data']> {
  const { data } = await client.post<ClaimRewardsResponse>(`/me/prep-item-sets/${slug}/claim`);
  return data.data;
}

export async function claimStarterRewards(slug: string, itemId?: number): Promise<void> {
  await client.post(`/me/prep-item-sets/${slug}/claim-starter`, itemId ? { item_id: itemId } : {});
}

export async function equipSetTitle(slug: string, equipped: boolean, tier: 'starter' | 'complete' = 'complete'): Promise<void> {
  await client.put(`/me/prep-item-sets/${slug}/title`, { equipped, tier });
}

export async function exchangeSetDuplicates(slug: string, prepItemId: number): Promise<void> {
  await client.post(`/me/prep-item-sets/${slug}/exchange`, { prep_item_id: prepItemId });
}

export async function focusPrepItemSet(slug: string): Promise<void> {
  await client.put(`/me/prep-item-sets/${slug}/focus`);
}

export async function clearPrepItemSetFocus(): Promise<void> {
  await client.delete('/me/prep-item-sets/focus');
}

export interface MilestoneClaimResult {
  rewards_granted: {
    energy?: number;
    tickets?: number;
    experience?: number;
    coins?: number;
    title?: string | null;
    item?: { id: number; name: string; item_type_id: number; paper_url?: string | null } | null;
    pending_wearable?: string | null;
    ticket_note?: string | null;
  };
  new_totals?: { energy: number; tickets: number; experience: number };
  milestone?: SetMilestone;
}

export async function claimSetMilestone(slug: string, key: SetMilestoneKey, itemId?: number): Promise<MilestoneClaimResult> {
  const { data } = await client.post<{ success: boolean; data: MilestoneClaimResult }>(
    `/me/prep-item-sets/${slug}/milestones/${key}/claim`, itemId ? { item_id: itemId } : {});
  return data.data;
}
