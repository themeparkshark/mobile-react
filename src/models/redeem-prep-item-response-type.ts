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
    /** Hunt Points for this find. `line` is shown verbatim, including the neutral zero line. */
    readonly hunt_points?: { readonly points: number; readonly line?: string | null } | null;
    readonly hunt_week?: {
      readonly points: number;
      readonly rank: number | null;
      readonly rank_line: string | null;
      readonly week_key: string;
    } | null;
    readonly item: {
      readonly id: number;
      readonly name: string;
      readonly rarity: number;
      readonly rarity_label: string;
      // Home Hunt v3 (CONTRACT.md 3.3, optional)
      readonly icon_url?: string | null;
      readonly flavor?: string | null;
      readonly rarity_key?: string | null;
      readonly set_slug?: string | null;
      readonly set_name?: string | null;
      readonly set_color?: string | null;
      readonly set_badge_url?: string | null;
      readonly is_daily_rare?: boolean;
      readonly caught_count?: number;
    };
    /** Home Hunt v3: "4 of 14" for the catch badge. */
    readonly dex?: {
      readonly set_slug?: string | null;
      readonly found?: number;
      readonly total?: number;
      readonly reward_status?: 'locked' | 'claimable' | 'claimed' | 'pending' | string | null;
    } | null;
    /** App request (CONTRACT.md "App requests"): the graded Ride Photo the server accepted. */
    readonly photo?: {
      readonly quality?: 'good' | 'great' | 'frame_it' | string | null;
      readonly golden_hour?: boolean;
      readonly bonus_xp?: number;
      /** Ride Photo v2 (newer servers): the best grade before this catch, and whether this photo beat it. */
      readonly previous_best?: 'good' | 'great' | 'frame_it' | string | null;
      readonly new_best?: boolean;
    } | null;
  };
}
