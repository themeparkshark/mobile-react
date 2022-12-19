import { ItemType } from './item-type';
import { SkinItemType } from './skin-item-type';

export interface InventoryType {
  readonly background_item: ItemType;
  readonly body_item: ItemType;
  readonly face_item: ItemType;
  readonly hand_item: ItemType;
  readonly head_item: ItemType;
  readonly id: number;
  readonly neck_item: ItemType;
  readonly pin_item: ItemType;
  readonly skin_item: SkinItemType;
}
