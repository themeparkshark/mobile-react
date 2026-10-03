import { ExperienceLevelType } from './experience-level-type';
import { InventoryType } from './inventory-type';
import { MascotType } from './mascot-type';

export interface PlayerType {
  readonly avatar_url: string;
  readonly coins: number;
  readonly completed_tasks_count: number;
  readonly created_at: string;
  readonly current_park_id: number;
  readonly email: string;
  readonly enabled_music: boolean;
  readonly enabled_sound_effects: boolean;
  readonly experience: number;
  readonly experience_level: ExperienceLevelType;
  readonly friends_count: number;
  readonly has_friend_request_from: boolean;
  readonly has_pending_friend_requests: boolean;
  readonly id: number;
  readonly inventory: InventoryType;
  readonly is_friend: boolean;
  /** Social v2 (optional on older servers): friends | incoming | outgoing | blocked | none, from my side. */
  readonly friend_status?: 'friends' | 'incoming' | 'outgoing' | 'blocked' | 'none';
  /** Social v2: requests waiting on me (on /me only). */
  readonly pending_friend_requests_count?: number;
  /** "Let sharks find me" (on /me only; off by default). */
  readonly discoverable?: boolean;
  readonly is_subscribed: boolean;
  readonly keys: number;
  readonly last_read_notifications_at: string;
  readonly mascot: MascotType;
  readonly name: string;
  readonly park_coins: number;
  readonly park_coins_count: number;
  readonly ride_coins_collected?: number;
  readonly coin_upgrades?: number;
  /** Ride Masters standings (progression v2). */
  readonly ride_masters?: { readonly crowned: number; readonly boss_clears: number; readonly polish_stars: number; readonly coin_levels: number };
  readonly screen_name: string;
  /** The App Store review account: plays with a simulated location inside a park. */
  readonly is_app_reviewer?: boolean;
  readonly token: string;
  readonly total_experience: number;
  readonly username: string;
  readonly verified_at: string;
  readonly visited_parks_count: number;
  // V2 fields
  readonly tickets?: number;
  readonly energy?: number;
  /** Rescue Passes held (Supplies packs); the free daily pass is not counted here. */
  readonly rescue_passes?: number;
  readonly max_energy?: number;
  readonly current_streak?: number;
  readonly longest_streak?: number;
  readonly ride_parts?: number;
  readonly player_level?: number;
  readonly xp_to_next_level?: number;
  readonly current_xp?: number;
  readonly title?: string | null;
  readonly featured_ride_coin?: FeaturedRideCoinType | null;
  readonly active_cosmetics?: PlayerCosmeticType[];
}

export interface FeaturedRideCoinType {
  readonly id: number;
  readonly ride_name: string;
  readonly coin_url: string;
  readonly current_level: number;
  readonly max_level: number;
  readonly times_collected: number;
  readonly latest_edition?: {
    readonly name: string;
    readonly color: string;
    readonly project_title: string;
    readonly source: 'Ride challenge' | 'LinePlay';
  } | null;
}

/**
 * Player cosmetic customization
 */
export interface PlayerCosmeticType {
  readonly id: number;
  readonly type: 'shark_skin' | 'frame' | 'badge' | 'trail';
  readonly name: string;
  readonly icon_url: string;
  readonly is_equipped: boolean;
}
