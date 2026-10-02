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

/** One piece of a set, with art so try-on can wear pieces that are not on today's shelves. */
export interface ShopSetPiece {
  readonly id: number;
  readonly name: string;
  readonly item_type_id: number;
  readonly rarity: number;
  readonly icon_url: string | null;
  readonly paper_url: string | null;
  readonly no_eye_url: string | null;
  /** 256 px WebP tile art; fall back to icon_url. */
  readonly icon_thumb_url?: string | null;
  readonly owned: boolean;
  /** On today's shelves (absent on ready_sets). */
  readonly in_shop?: boolean;
}

export interface ShopSetSummary extends ShopSetProgress {
  readonly xp_reward: number;
  readonly color: string | null;
  readonly blurb: string | null;
  readonly season: string | null;
  readonly item_ids: number[];
  readonly owned_ids: number[];
  readonly pieces?: ShopSetPiece[];
}

export interface ShopItemMeta {
  readonly is_owned: boolean;
  readonly is_wishlisted: boolean;
  readonly last_chance: boolean;
  readonly returning: boolean;
  /** On today's shelves but not yesterday's. */
  readonly is_new?: boolean;
  readonly season: string | null;
  readonly tags: string[];
  readonly set: (ShopSetProgress & { readonly color?: string | null }) | null;
}

export type ShopItem = ItemType & {
  readonly shop?: ShopItemMeta;
  /** 256 px WebP tile art (shop:thumbnails); tiles fall back to the full art. */
  readonly icon_thumb_url?: string | null;
  readonly paper_thumb_url?: string | null;
  readonly no_eye_url?: string | null;
};

/** "Next: Bone Zone" tease: a name, a start date and a few piece shapes to black out. */
export interface ShopTease {
  readonly title?: string;
  readonly set_name?: string | null;
  readonly starts_on: string;
  readonly silhouettes: string[];
}

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
  /** Events: last day on sale (YYYY-MM-DD), for "Ends Nov 1". */
  readonly event_last_day?: string | null;
  /** Events: this shelf runs to the end of the event (no new drop coming). */
  readonly final_shelf?: boolean;
  /** Events with named waves (Halloween weeks). */
  readonly wave?: { readonly key: string; readonly title: string; readonly ends_on: string; readonly finale: boolean } | null;
  readonly next_wave?: ShopTease | null;
  /** Events: illustrated key art served by the backend. */
  readonly art_url?: string | null;
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
  /** Sets finished outside the shop (gifts, codes, Home Hunt) waiting for their title. */
  readonly ready_sets?: ShopSetSummary[];
  /** Today is still building: this is the last built day; check back at resets_at (2 minutes). */
  readonly fallback?: boolean;
  /** Next week's featured set (the hero's "Next week" tease). */
  readonly next_featured?: ShopTease | null;
  /** null until the player answers the first-heart ask. */
  readonly wishlist_alerts?: boolean | null;
}

export interface ShopSetReward {
  readonly slug: string;
  readonly name: string;
  readonly title: string | null;
  readonly xp: number;
  readonly item_ids?: number[];
}
