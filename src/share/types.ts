/**
 * Share Studio: one card system for every flex moment (share-studio/CONTRACT.md).
 * Pure types, safe to import from logic and tests.
 */
import type { InventoryType } from '../models/inventory-type';

/** A bundled image (require) or a remote URL. */
export type FlexArt = number | string;

export type FlexFormat = 'story' | 'square';

/** 1 Common, 2 Uncommon, 3 Rare, 4 Epic, 5 Legendary. */
export type FlexRarity = 1 | 2 | 3 | 4 | 5;
export type RarityInput = number | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface FlexBase {
  /** 0..1 share of active players who own this (GET /me/flex/rarity). Shown only when <= 0.25. */
  readonly ownedPct?: number | null;
  /** Override the shark. Default: the signed-in player's live look. */
  readonly inventory?: InventoryType | null;
}

export interface FlexPayloads {
  readonly crowned: FlexBase & { readonly coinUrl: FlexArt; readonly tierName?: string; readonly timesCollected?: number };
  readonly find: FlexBase & {
    readonly itemName: string; readonly artUrl: FlexArt; readonly rarity: RarityInput; readonly setName?: string;
    readonly goldenHour?: boolean; readonly dailyRare?: boolean; readonly caughtCount?: number;
  };
  readonly ride_photo: FlexBase & {
    readonly itemName: string; readonly artUrl: FlexArt; readonly rarity: RarityInput;
    readonly grade: 'good' | 'great' | 'frame_it'; readonly goldenHour?: boolean; readonly photoUri?: string;
  };
  readonly set_complete: FlexBase & {
    readonly setName: string; readonly badgeUrl: FlexArt; readonly found: number; readonly total: number;
    readonly title?: string; readonly artUrls?: readonly FlexArt[]; readonly source?: 'home_hunt' | 'shop' | 'event';
  };
  readonly boss_win: FlexBase & {
    readonly bossName: string; readonly artUrl: FlexArt; readonly difficulty: 'normal' | 'hard' | 'shark';
    readonly title?: string; readonly bouts?: number; readonly mvp?: boolean;
  };
  readonly stamp: FlexBase & { readonly name: string; readonly artUrl: FlexArt; readonly rarity: RarityInput; readonly how?: string; readonly title?: string };
  readonly coin_level: FlexBase & { readonly coinUrl: FlexArt; readonly level: number; readonly tierName?: string; readonly tierIndex?: number; readonly timesCollected?: number };
  readonly standings: FlexBase & { readonly boardLabel: string; readonly tierLabel: string; readonly rank?: number; readonly percentile?: number; readonly points?: number };
  readonly fright_night: FlexBase & {
    readonly cardTitle: string; readonly headline: string; readonly nightNumber?: number; readonly haunts: number;
    readonly minutesInLine?: number; readonly badgeUrls?: readonly (FlexArt | null)[]; readonly statLines?: readonly string[];
  };
  readonly fright_badge: FlexBase & { readonly cardTitle: string; readonly hauntName: string; readonly badgeUrl: FlexArt | null; readonly pinUrl?: FlexArt | null; readonly runs?: number };
  readonly fright_lifetime: FlexBase & { readonly hauntsSurvived: number; readonly reSwims?: number; readonly nights?: number; readonly events?: number; readonly cardTitle?: string };
  readonly ride_coin: FlexBase & {
    readonly coinUrl: FlexArt; readonly isNew?: boolean; readonly edition?: { readonly name: string; readonly color?: string } | null;
    readonly limited?: boolean; readonly milestone?: { readonly percent: number; readonly collected: number; readonly available: number } | null;
  };
  readonly streak: FlexBase & { readonly days: number; readonly best?: number };
  readonly level_up: FlexBase & { readonly level: number; readonly unlockName?: string };
  readonly title: FlexBase & { readonly title: string; readonly how?: string };
  readonly park_day: FlexBase & {
    readonly coinsCaught: number; readonly newCoins?: number; readonly coinUrls: readonly FlexArt[];
    readonly extraStats?: readonly { readonly value: number; readonly label: string }[];
  };
}

export type FlexKind = keyof FlexPayloads;
export type FlexPayload<K extends FlexKind = FlexKind> = FlexPayloads[K];

/** Every kind, ranked by brag value (CONTRACT.md section 3). */
export const FLEX_KINDS: readonly FlexKind[] = [
  'crowned', 'find', 'ride_photo', 'set_complete', 'boss_win', 'stamp', 'coin_level', 'standings',
  'fright_night', 'fright_badge', 'fright_lifetime', 'ride_coin', 'streak', 'level_up', 'title', 'park_day',
];

export interface FlexOptions {
  /** Where the call came from, for analytics only (snake_case). */
  readonly surface: string;
  /** Format the sheet opens on. Default story. */
  readonly format?: FlexFormat;
}

/** A queued request, as the host sees it. */
export interface FlexRequest<K extends FlexKind = FlexKind> {
  readonly id: number;
  readonly mode: 'reveal' | 'sheet';
  readonly kind: K;
  readonly payload: FlexPayload<K>;
  readonly options: FlexOptions;
}

/** The category frames (one Alex-style frame family per category). */
export type FrameKey = 'royal' | 'collection' | 'photo' | 'boss' | 'passport' | 'coins' | 'standings' | 'fright' | 'streak' | 'progress';

/** Everything the card prints, worked out from the payload by flexCopy(). */
export interface FlexCopy {
  /** Gold ribbon headline, ALL CAPS, short. */
  readonly ribbon: string;
  /** "My ..." line above the name. */
  readonly kicker: string;
  /** The thing's name. */
  readonly title: string;
  /** Optional big number on the stat plate ("12/12", "LV 10", "#3"). */
  readonly big: string | null;
  /** The brag line. */
  readonly stat: string;
  /** Second, smaller brag line (or null). */
  readonly sub: string | null;
  /** Bottom call to action. */
  readonly cta: string;
  readonly frame: FrameKey;
  /** Rarity for the chip and gems, null when the kind has none. */
  readonly rarity: FlexRarity | null;
  /** Accessibility label for the whole card. */
  readonly a11y: string;
}
