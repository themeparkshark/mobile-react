import { TaskType } from './task-type';
import { CoinType } from './coin-type';
import { ItemType } from './item-type';
import { SecretTaskType } from './secret-task-type';

export interface RedeemableType {
  readonly type: string;
  readonly model: SecretTaskType | ItemType | TaskType | CoinType;
}
