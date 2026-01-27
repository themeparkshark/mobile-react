/**
 * Ride Part - V2 currency for leveling up ride coins.
 * Earned by:
 * - Playing mini-games in-park
 * - Passive earning while in line
 * - Completing trivia with bonuses
 * - Set completion rewards
 */
export interface RidePartType {
  readonly id: number;
  readonly name: string;
  readonly icon_url: string;
  readonly rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  readonly description: string | null;
  readonly ride_id?: number; // Specific ride this part belongs to (null = universal)
}

/**
 * Player's ride part inventory entry
 */
export interface PlayerRidePartType {
  readonly ride_part_id: number;
  readonly ride_part: RidePartType;
  readonly quantity: number;
}

/**
 * Rarity configuration for display
 */
export const RIDE_PART_RARITY_CONFIG = {
  common: {
    label: 'Common',
    color: '#4CAF50',
    chance: 60,
    energyMultiplier: 1,
  },
  uncommon: {
    label: 'Uncommon',
    color: '#2196F3',
    chance: 25,
    energyMultiplier: 1.5,
  },
  rare: {
    label: 'Rare',
    color: '#9C27B0',
    chance: 10,
    energyMultiplier: 2,
  },
  epic: {
    label: 'Epic',
    color: '#FF9800',
    chance: 4,
    energyMultiplier: 3,
  },
  legendary: {
    label: 'Legendary',
    color: '#FFD700',
    chance: 1,
    energyMultiplier: 5,
  },
} as const;
