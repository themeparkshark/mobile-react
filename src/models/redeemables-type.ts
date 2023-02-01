import { CoinType } from './coin-type';
import { ItemType } from './item-type';
import { TaskType } from './task-type';

export interface RedeemablesType {
  readonly coins: CoinType[];
  readonly items: ItemType[];
  readonly pins: ItemType[];
  readonly secret_tasks: TaskType[];
  readonly tasks: TaskType[];
}
