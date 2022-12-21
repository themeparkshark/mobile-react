import { ItemTypeType } from './item-type-type';

export interface ItemType {
  readonly id: number;
  readonly icon_url: string;
  readonly item_type: ItemTypeType;
  readonly paper_url: string;
  readonly pivot: {
    readonly latitude: number;
    readonly longitude: number;
    readonly section: string;
  };
}
