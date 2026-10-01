import type { CoinBossBlock, PerkTrackRow } from '../components/coin/progressionModel';
import { RidePartType } from './ride-part-type';

/**
 * Ride Coin with leveling mechanics - V2 feature.
 * 
 * Players spend Energy + Ride Parts to level up their ride coins.
 * Each level unlocks:
 * - Cosmetic upgrades (coin appearance)
 * - Cosmetic tier upgrades (Silver, Gold, Prismatic, Legendary)
 * - A featured showcase coin at max level
 */
export interface RideCoinLevelType {
  readonly id: number;
  readonly ride_id: number;
  readonly ride_name: string;
  readonly coin_url: string;
  readonly current_level: number;
  readonly max_level: number;
  readonly times_collected: number;
  readonly editions?: ReadonlyArray<{
    readonly id: number;
    readonly name: string;
    readonly color: string;
    readonly project_title: string;
    readonly source: 'Ride challenge' | 'LinePlay';
    readonly earned_at: string;
  }>;
  readonly is_featured?: boolean;
  readonly available_parts?: number;
  
  // Level requirements
  readonly energy_to_next_level: number;
  readonly parts_to_next_level: number;
  readonly required_parts: RidePartType[]; // Specific parts needed
  
  // XP gating
  readonly player_level_required: number;
  readonly is_unlocked: boolean;
  
  // Perks at current level
  readonly current_perks: RideCoinPerkType[];
  readonly next_level_perks: RideCoinPerkType[];
  
  // Appearance
  readonly current_frame_url?: string;
  readonly next_frame_url?: string;

  // Progression v2 (S2): present only when the server runs the Level 10 curve
  // for this build. The app shows what the server sends and never computes perks.
  readonly tier?: string;
  readonly next_tier?: string | null;
  readonly perk_track?: readonly PerkTrackRow[];
  readonly parts_banked?: number;
  readonly xp_to_next_level?: number;
  readonly crowned?: boolean;
  readonly polish?: { readonly stars: number; readonly next_cost: number | null };
  readonly boss?: CoinBossBlock | null;
}

/**
 * Perk that can be unlocked by leveling a ride coin
 */
export interface RideCoinPerkType {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly icon_url: string;
  readonly type: 'cosmetic' | 'bonus_parts' | 'energy_discount' | 'boss_access' | 'gym_points';
  readonly value: number;
}
