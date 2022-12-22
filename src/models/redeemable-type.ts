import { TaskType } from './task-type';
import { CoinType } from './coin-type';
import { ItemType } from './item-type';

export interface RedeemableType {
  readonly type: string;
  readonly model: ItemType | TaskType | CoinType;
}
