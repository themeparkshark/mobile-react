import { PlayerStatsType } from './player-stats-type';
import { PrepItemType } from './prep-item-type';

export interface RedeemPrepItemResponseType {
  readonly success: boolean;
  readonly data: {
    readonly rewards: {
      readonly energy: number;
      readonly tickets: number;
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
    readonly set_progress?: {
      readonly total: number;
      readonly collected: number;
      readonly percentage: number;
      readonly is_complete: boolean;
      readonly collected_ids: number[];
    };
    readonly item: {
      readonly id: number;
      readonly name: string;
      readonly rarity: number;
      readonly rarity_label: string;
    };
  };
}
