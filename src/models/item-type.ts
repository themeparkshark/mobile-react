import { CurrencyType } from './currency-type';
import { ItemTypeType } from './item-type-type';

export interface ItemType {
  readonly id: number;
  readonly name: string;
  readonly icon_url: string;
  readonly item_type: ItemTypeType;
  readonly cost: number;
  readonly has_purchased: boolean;
  readonly paper_url: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly section: string;
  readonly is_hidden: boolean;
  readonly is_clearance: boolean;
  readonly currency: CurrencyType;
  readonly is_coin_code_item: boolean;
  readonly is_member_item: boolean;
}
