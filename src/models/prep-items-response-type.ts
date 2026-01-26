import { PlayerStatsType } from './player-stats-type';
import { PrepItemType } from './prep-item-type';

export interface PrepItemsResponseType {
  readonly data: PrepItemType[];
  readonly player_stats: PlayerStatsType;
}
