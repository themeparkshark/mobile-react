import { CoinType } from './coin-type';
import { ItemType } from './item-type';
import { KeyType } from './key-type';
import { RedeemableType } from './redeemable-type';
import { SecretTaskType } from './secret-task-type';
import { TaskType } from './task-type';
import { VaultType } from './vault-type';

export interface CurrentRedeemableType {
  readonly type: string;
  readonly rescue_pass_available?: boolean;
  readonly rescue_pass_used_today?: boolean;
  readonly model:
    | SecretTaskType
    | ItemType
    | TaskType
    | CoinType
    | KeyType
    | VaultType
    | RedeemableType;
}
