import { ExperienceLevelType } from './experience-level-type';
import { InventoryType } from './inventory-type';
import { MascotType } from './mascot-type';

export interface UserType {
  readonly avatar_url: string;
  readonly coins: number;
  readonly created_at: string;
  readonly current_park_id: number;
  readonly email: string;
  readonly enabled_music: boolean;
  readonly enabled_sound_effects: boolean;
  readonly experience: number;
  readonly experience_level: ExperienceLevelType;
  readonly has_friend_request_from: boolean;
  readonly has_pending_friend_requests: boolean;
  readonly id: number;
  readonly inventory: InventoryType;
  readonly is_friend: boolean;
  readonly mascot: MascotType;
  readonly name: string;
  readonly park_coins: number;
  readonly screen_name: string;
  readonly total_coins: number;
  readonly total_experience: number;
  readonly username: string;
  readonly verified_at: string;
  readonly visited_parks_count: number;
}
