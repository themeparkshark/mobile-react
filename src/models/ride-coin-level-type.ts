import { RidePartType } from './ride-part-type';

/**
 * Ride Coin with leveling mechanics - V2 feature.
 * 
 * Players spend Energy + Ride Parts to level up their ride coins.
 * Each level unlocks:
 * - Cosmetic upgrades (coin appearance)
 * - Cosmetic tier upgrades (Silver, Gold, Prismatic, Legendary)
 * - Boss challenges at max level
 */
export interface RideCoinLevelType {
  readonly id: number;
  readonly ride_id: number;
  readonly ride_name: string;
  readonly coin_url: string;
  readonly current_level: number;
  readonly max_level: number;
  readonly times_collected: number;
  
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
}

/**
 * Perk that can be unlocked by leveling a ride coin
 */
export interface RideCoinPerkType {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly icon_url: string;
  readonly type: 'cosmetic' | 'bonus_parts' | 'energy_discount' | 'boss_access';
  readonly value: number;
}

/**
 * Level thresholds and requirements
 */
export const RIDE_COIN_LEVEL_CONFIG = {
  1: {
    energyCost: 0,
    partsCost: 0,
    perks: ['Basic appearance'],
    frameStyle: 'bronze',
  },
  2: {
    energyCost: 10,
    partsCost: 5,
    perks: ['Silver coin appearance'],
    frameStyle: 'bronze_enhanced',
  },
  3: {
    energyCost: 25,
    partsCost: 15,
    perks: ['Gold coin appearance'],
    frameStyle: 'silver',
  },
  4: {
    energyCost: 50,
    partsCost: 30,
    perks: ['Prismatic coin appearance'],
    frameStyle: 'silver_enhanced',
  },
  5: {
    energyCost: 100,
    partsCost: 75,
    perks: ['Legendary coin appearance'],
    frameStyle: 'gold',
  },
} as const;

/**
 * Player level requirements for ride coins
 */
export const RIDE_COIN_XP_GATES = {
  easy: 1,     // Level 1+ can collect
  medium: 5,   // Level 5+ required
  hard: 10,    // Level 10+ required
  expert: 20,  // Level 20+ required
  legendary: 50, // Level 50+ required (boss coins)
} as const;
