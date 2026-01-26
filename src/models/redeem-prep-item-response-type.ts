import { PlayerStatsType } from './player-stats-type';
import { PrepItemType } from './prep-item-type';

export interface RedeemPrepItemResponseType {
  readonly message: string;
  readonly data: {
    readonly prep_item: PrepItemType;
    readonly rewards: {
      readonly energy: number;
      readonly tickets: number;
      readonly experience: number;
    };
    readonly streak: {
      readonly current: number;
      readonly multiplier: number;
    };
    readonly player_stats: PlayerStatsType;
  };
}
