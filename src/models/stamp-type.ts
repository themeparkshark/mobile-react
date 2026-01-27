/**
 * Stamp - V2 Achievement System
 * 
 * Stamps are achievements players earn for various accomplishments.
 * Displayed in the Stamp Book - a visual achievement collection.
 */
export interface StampType {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly icon_url: string;
  readonly category: StampCategory;
  readonly rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  
  // Progress
  readonly is_earned: boolean;
  readonly earned_at?: string;
  readonly progress: number; // 0-100
  readonly progress_text?: string; // e.g., "3/10 rides completed"
  
  // Requirements (for display)
  readonly requirement_text: string;
  
  // Rewards for earning
  readonly rewards: StampRewardType;
  
  // Display
  readonly sort_order: number;
  readonly is_hidden: boolean; // Secret stamps
  readonly is_new: boolean; // Just earned
}

export type StampCategory = 
  | 'exploration'    // Walking/visiting places
  | 'collection'     // Completing sets
  | 'rides'          // Ride-related achievements
  | 'social'         // Friends, community
  | 'trivia'         // Trivia mastery
  | 'streaks'        // Consecutive days
  | 'leveling'       // Coin leveling
  | 'special'        // Limited time, events
  | 'secret';        // Hidden achievements

/**
 * Rewards for earning a stamp
 */
export interface StampRewardType {
  readonly energy: number;
  readonly tickets: number;
  readonly experience: number;
  readonly ride_parts: number;
  readonly title?: string; // Unlockable title
  readonly cosmetic_id?: number; // Unlockable cosmetic
}

/**
 * Stamp category configuration
 */
export const STAMP_CATEGORY_CONFIG = {
  exploration: {
    label: 'Explorer',
    color: '#4CAF50',
    icon: '🗺️',
    description: 'Discover new places and collect items',
  },
  collection: {
    label: 'Collector',
    color: '#FF9800',
    icon: '📦',
    description: 'Complete item sets and collections',
  },
  rides: {
    label: 'Thrill Seeker',
    color: '#2196F3',
    icon: '🎢',
    description: 'Conquer rides and challenges',
  },
  social: {
    label: 'Social Shark',
    color: '#E91E63',
    icon: '👥',
    description: 'Connect with other players',
  },
  trivia: {
    label: 'Trivia Master',
    color: '#9C27B0',
    icon: '🧠',
    description: 'Answer questions correctly',
  },
  streaks: {
    label: 'Dedicated',
    color: '#FF5722',
    icon: '🔥',
    description: 'Maintain daily streaks',
  },
  leveling: {
    label: 'Power Player',
    color: '#FFD700',
    icon: '⬆️',
    description: 'Level up your coins',
  },
  special: {
    label: 'Special',
    color: '#00BCD4',
    icon: '⭐',
    description: 'Limited time events',
  },
  secret: {
    label: 'Secret',
    color: '#607D8B',
    icon: '🔮',
    description: 'Hidden achievements',
  },
} as const;

/**
 * Rarity configuration for stamps
 */
export const STAMP_RARITY_CONFIG = {
  common: {
    label: 'Common',
    color: '#4CAF50',
    borderStyle: 'solid',
    shine: false,
  },
  uncommon: {
    label: 'Uncommon',
    color: '#2196F3',
    borderStyle: 'solid',
    shine: false,
  },
  rare: {
    label: 'Rare',
    color: '#9C27B0',
    borderStyle: 'double',
    shine: true,
  },
  epic: {
    label: 'Epic',
    color: '#FF9800',
    borderStyle: 'double',
    shine: true,
  },
  legendary: {
    label: 'Legendary',
    color: '#FFD700',
    borderStyle: 'double',
    shine: true,
  },
} as const;

/**
 * Example stamps for reference:
 * 
 * - First Steps: Collect your first prep item
 * - Set Collector: Complete your first set
 * - Trivia Whiz: Answer 10 trivia questions correctly
 * - Week Warrior: Maintain a 7-day streak
 * - Coin Connoisseur: Level a coin to max
 * - Park Hopper: Visit 5 different parks
 * - Early Bird: Collect items before 8am
 * - Night Owl: Collect items after 10pm
 * - Social Butterfly: Add 10 friends
 * - Line Champion: Wait 2 hours in a single line
 */
