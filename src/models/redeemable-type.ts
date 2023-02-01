import { CoinType } from './coin-type';
import { ItemType } from './item-type';
import { SecretTaskType } from './secret-task-type';
import { TaskType } from './task-type';

export interface RedeemableType {
  readonly type: string;
  readonly model: SecretTaskType | ItemType | TaskType | CoinType;
}
