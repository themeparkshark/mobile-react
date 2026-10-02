import { ItemType } from './item-type';

/** Shark Shop v2 (shop-v2/CONTRACT.md). Every field is optional-safe: old backends 404 the endpoint. */
export interface ShopSetProgress {
  readonly slug: string;
  readonly name: string;
  readonly title: string | null;
  readonly owned: number;
  readonly total: number;
  readonly reward_state: 'locked' | 'ready' | 'claimed';
}

export interface ShopSetSummary extends ShopSetProgress {
  readonly xp_reward: number;
  readonly color: string | null;
  readonly blurb: string | null;
  readonly season: string | null;
  readonly item_ids: number[];
  readonly owned_ids: number[];
}

export interface ShopItemMeta {
  readonly is_owned: boolean;
  readonly is_wishlisted: boolean;
  readonly last_chance: boolean;
  readonly returning: boolean;
  readonly season: string | null;
  readonly tags: string[];
  readonly set: ShopSetProgress | null;
}

export type ShopItem = ItemType & { readonly shop?: ShopItemMeta };

export type ShopSectionType = 'daily' | 'featured' | 'event';

export interface ShopSection {
  readonly key: string;
  readonly type: ShopSectionType;
  readonly event_key: string | null;
  readonly title: string;
  readonly subtitle: string | null;
  readonly color: string | null;
  /** When this shelf changes. */
  readonly ends_at: string;
  /** Events only: when the whole event ends. */
  readonly event_ends_at: string | null;
  readonly time_left_label: string | null;
  readonly last_chance: boolean;
  readonly hero_id: number | null;
  readonly set_slugs: string[];
  readonly items: ShopItem[];
}

export interface ShopToday {
  readonly store_id: number;
  readonly shop_day: string;
  readonly timezone: string;
  readonly resets_at: string;
  readonly server_time: string;
  readonly sections: ShopSection[];
  readonly sets: ShopSetSummary[];
  readonly wishlist_ids: number[];
  readonly equipped_title: string | null;
}

export interface ShopSetReward {
  readonly slug: string;
  readonly name: string;
  readonly title: string | null;
  readonly xp: number;
}
