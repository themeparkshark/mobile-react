import client from '../../client';

export interface StampRewards {
  energy: number;
  tickets: number;
  xp: number;
  coins: number;
  title: string | null;
}

export interface StampData {
  id: number;
  slug: string;
  name: string;
  category: string;
  goal: string;
  metric: string;
  target_value: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  image_key: string | null;
  emoji: string | null;
  is_hidden: boolean;
  sort_order: number;
  progress: number;
  target: number;
  progress_percentage: number;
  progress_text: string;
  is_earned: boolean;
  earned_at: string | null;
  reward_claimed: boolean;
  rewards: StampRewards;
}

export interface StampsResponse {
  stamps: Record<string, StampData[]>;
  newly_earned: number[];
  summary: {
    total: number;
    earned: number;
  };
}

export async function getStamps(): Promise<StampsResponse> {
  const { data } = await client.get<StampsResponse>('/me/stamps');
  return data;
}

export async function claimStampReward(stampId: number): Promise<{ success: boolean; rewards: StampRewards }> {
  const { data } = await client.post(`/me/stamps/${stampId}/claim`);
  return data;
}
