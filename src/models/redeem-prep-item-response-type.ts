import { PlayerStatsType } from './player-stats-type';
import { PrepItemType } from './prep-item-type';
import type { StarterMilestone } from '../api/endpoints/me/prep-item-sets';

export interface RedeemPrepItemResponseType {
  readonly success: boolean;
  readonly data: {
    readonly rewards: {
      readonly energy: number;
      readonly tickets: number;
      readonly coins: number;
      readonly experience: number;
    };
    readonly streak: {
      readonly current: number;
      readonly multiplier: number;
    };
    readonly new_totals?: {
      readonly energy: number;
      readonly tickets: number;
      readonly experience: number;
    };
    readonly is_new_variant?: boolean;
    readonly replayed?: boolean;
    readonly project_update?: {
      readonly project_id: number;
      readonly title: string;
      readonly points_awarded: number;
      readonly total_points: number;
      readonly goal_points: number;
    } | null;
    readonly set_progress?: {
      readonly total: number;
      readonly collected: number;
      readonly percentage: number;
      readonly is_complete: boolean;
      readonly collected_ids: number[];
      readonly spare_count?: number;
      readonly exchange_cost?: number;
      readonly rewards_claimed?: boolean;
      readonly starter_milestone?: StarterMilestone | null;
    };
    readonly item: {
      readonly id: number;
      readonly name: string;
      readonly rarity: number;
      readonly rarity_label: string;
    };
  };
}
