import { CoinType } from './coin-type';
import { ItemType } from './item-type';
import { KeyType } from './key-type';
import { PumpkinType } from './pumpkin-type';
import { SecretTaskType } from './secret-task-type';
import { TaskType } from './task-type';
import { VaultType } from './vault-type';

export interface RedeemableType {
  readonly type: string;
  readonly model:
    | SecretTaskType
    | ItemType
    | TaskType
    | CoinType
    | KeyType
    | VaultType
    | PumpkinType;
}
