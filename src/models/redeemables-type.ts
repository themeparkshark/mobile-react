import { CoinType } from './coin-type';
import { ItemType } from './item-type';
import { KeyType } from './key-type';
import { TaskType } from './task-type';
import { VaultType } from './vault-type';

export interface RedeemablesType {
  readonly coins: CoinType[];
  readonly items: ItemType[];
  readonly keys: KeyType[];
  readonly pins: ItemType[];
  readonly secret_tasks: TaskType[];
  readonly tasks: TaskType[];
  readonly vaults: VaultType[];
}
