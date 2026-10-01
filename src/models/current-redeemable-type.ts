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
  /** Which pass would pay: the free daily one, or a held Rescue Pass from Supplies. */
  readonly rescue_pass_source?: 'daily' | 'held' | 'held_retry' | null;
  /** Rescue Passes the player holds. */
  readonly rescue_passes?: number;
  readonly model:
    | SecretTaskType
    | ItemType
    | TaskType
    | CoinType
    | KeyType
    | VaultType
    | RedeemableType;
}
