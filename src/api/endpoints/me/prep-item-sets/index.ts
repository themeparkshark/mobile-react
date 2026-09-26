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
  rewards_claimed: boolean;
  starter_milestone: StarterMilestone | null;
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
  return data.data;
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
      rewards_claimed: boolean;
      starter_milestone: StarterMilestone | null;
    };
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
