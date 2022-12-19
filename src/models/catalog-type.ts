import { ItemType } from './item-type';

export interface CatalogType {
  readonly id: number;
  readonly items: ItemType[];
  readonly name: string;
  readonly promotion_image_url: string;
}
