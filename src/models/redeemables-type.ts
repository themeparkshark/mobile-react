import { ItemType } from './item-type';
import { TaskType } from './task-type';
import { CoinType } from './coin-type';

export interface RedeemablesType {
  readonly coins: CoinType[];
  readonly items: ItemType[];
  readonly secret_tasks: TaskType[];
  readonly tasks: TaskType[];
}
