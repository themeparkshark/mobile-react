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
  /** VIP-only gear: shows a lock for non-members instead of failing at checkout. */
  readonly is_member_item?: boolean;
  /** Wearable rarity 1-5 (dressing-room.md 4). Missing on old backends: Common. */
  readonly rarity?: number;
  /** Body only: tee, hoodie or costume. */
  readonly subcategory?: string | null;
  /** shop, vip, coin_code, event, set, level... */
  readonly source?: string;
  /** Reviewed name override; shown instead of name when set. */
  readonly display_name?: string | null;
  /** Owned rows: false while the item is NEW in the wardrobe. */
  readonly seen?: boolean;
  /** Owned rows: whether this item has ever been worn. */
  readonly first_worn?: boolean;
  readonly acquired_at?: string | null;
}
