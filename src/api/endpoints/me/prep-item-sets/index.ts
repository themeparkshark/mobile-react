import { PrepItemSetType } from '../../../../models/prep-item-set-type';
import client from '../../../client';

/**
 * Get all prep item sets with player progress.
 */
export interface PrepItemSetsResponse {
  success: boolean;
  data: PrepItemSetListItem[];
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
  time_gate: {
    start_hour: number;
    end_hour: number;
    description: string;
    is_spawning_now: boolean;
  } | null;
  weather_gate: string[] | null;
  total_items: number;
  collected_count: number;
  progress_percentage: number;
  is_complete: boolean;
  completion_rewards: {
    energy: number;
    tickets: number;
    experience: number;
    title: string | null;
    badge_url: string | null;
  };
}

export default async function getPrepItemSets(): Promise<PrepItemSetListItem[]> {
  const { data } = await client.get<PrepItemSetsResponse>('/me/prep-item-sets');
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
      theme_config: { label: string; color: string };
      time_gate: {
        start_hour: number;
        end_hour: number;
        description: string;
        is_spawning_now: boolean;
      } | null;
    };
    progress: {
      total: number;
      collected: number;
      percentage: number;
      is_complete: boolean;
      collected_ids: number[];
    };
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
  quantity_collected: number;
  first_collected_at: string | null;
  last_collected_at: string | null;
}

export async function getPrepItemSet(slug: string): Promise<PrepItemSetDetailResponse['data']> {
  const { data } = await client.get<PrepItemSetDetailResponse>(`/me/prep-item-sets/${slug}`);
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
