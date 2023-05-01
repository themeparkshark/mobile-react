import { ItemType } from './item-type';

export interface VaultType {
  readonly id: number;
  readonly item: ItemType;
  readonly latitude: string;
  readonly longitude: string;
}
