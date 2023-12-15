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
  readonly is_subscribed: boolean;
  readonly keys: number;
  readonly last_read_notifications_at: string;
  readonly mascot: MascotType;
  readonly name: string;
  readonly park_coins: number;
  readonly park_coins_count: number;
  readonly screen_name: string;
  readonly total_coins: number;
  readonly total_experience: number;
  readonly total_keys: number;
  readonly username: string;
  readonly verified_at: string;
  readonly visited_parks_count: number;
}
