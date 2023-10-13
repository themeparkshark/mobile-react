import { ItemType } from './item-type';

export interface CoinCodeType {
  readonly id: number;
  readonly item: ItemType;
  readonly coins: number;
}
