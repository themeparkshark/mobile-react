import { PrepItemType } from './prep-item-type';

/**
 * Prep Item Set - Collection of themed items to collect.
 * Complete the set for bonus rewards!
 * 
 * Sets drive engagement through:
 * - Collection completionism ("gotta catch 'em all!")
 * - Scarcity (monthly rotating sets)
 * - Big completion rewards
 * - Progress visibility
 */
export interface PrepItemSetType {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly icon_url: string;
  readonly theme: PrepItemSetTheme;
  
  // Timing
  readonly active_from: string;
  readonly active_to: string;
  readonly is_active: boolean;
  readonly is_monthly: boolean;
  readonly is_seasonal: boolean;
  
  // Items in this set
  readonly items: PrepItemSetItemType[];
  readonly total_items: number;
  readonly collected_count: number;
  readonly is_complete: boolean;
  
  // Completion rewards
  readonly completion_rewards: PrepItemSetRewardType;
  
  // Display
  readonly rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  readonly sort_order: number;
}

/**
 * Individual item within a set, with collection status
 */
export interface PrepItemSetItemType {
  readonly id: number;
  readonly prep_item: PrepItemType;
  readonly is_collected: boolean;
  readonly collected_at: string | null;
  readonly quantity_collected: number;
  readonly required_quantity: number;
  
  // Spawn conditions
  readonly weather_required?: WeatherCondition[];
  readonly time_window?: TimeWindow;
  readonly spawn_rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  readonly hint?: string; // "Only appears at night!"
}

/**
 * Rewards for completing a set
 */
export interface PrepItemSetRewardType {
  readonly energy: number;
  readonly tickets: number;
  readonly experience: number;
  readonly park_tickets?: number;
  readonly exclusive_item?: PrepItemType; // Special item only from set completion
  readonly badge_url?: string; // Achievement badge
  readonly title?: string; // Player title unlock
}

/**
 * Set themes for visual styling
 */
export type PrepItemSetTheme = 
  | 'food'        // Churros, pretzels, popcorn
  | 'gear'        // Backpacks, cameras, hats
  | 'souvenirs'   // Pins, ears, plushies
  | 'seasonal'    // Holiday themed
  | 'park'        // Park-specific items
  | 'weather'     // Weather-gated items
  | 'night'       // Nighttime items
  | 'special';    // Limited edition

/**
 * Weather conditions for weather-gated items
 */
export type WeatherCondition = 
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'hot'      // >85°F
  | 'cold'     // <50°F
  | 'windy';

/**
 * Time windows for time-gated items
 */
export interface TimeWindow {
  readonly start_hour: number; // 0-23
  readonly end_hour: number;   // 0-23
  readonly days_of_week?: number[]; // 0=Sun, 6=Sat (empty = all days)
}

/**
 * Predefined time windows
 */
export const TIME_WINDOWS = {
  morning: { start_hour: 6, end_hour: 11 },
  afternoon: { start_hour: 11, end_hour: 17 },
  evening: { start_hour: 17, end_hour: 21 },
  night: { start_hour: 21, end_hour: 6 },
  weekend: { start_hour: 0, end_hour: 24, days_of_week: [0, 6] },
} as const;

/**
 * Theme configuration for display
 */
export const SET_THEME_CONFIG = {
  food: {
    label: '🍿 Food & Snacks',
    color: '#FF9800',
    bgGradient: ['#FF9800', '#F57C00'],
  },
  gear: {
    label: '🎒 Park Gear',
    color: '#2196F3',
    bgGradient: ['#2196F3', '#1976D2'],
  },
  souvenirs: {
    label: '🎁 Souvenirs',
    color: '#9C27B0',
    bgGradient: ['#9C27B0', '#7B1FA2'],
  },
  seasonal: {
    label: '🎄 Seasonal',
    color: '#4CAF50',
    bgGradient: ['#4CAF50', '#388E3C'],
  },
  park: {
    label: '🏰 Park Collection',
    color: '#E91E63',
    bgGradient: ['#E91E63', '#C2185B'],
  },
  weather: {
    label: '🌧️ Weather Items',
    color: '#00BCD4',
    bgGradient: ['#00BCD4', '#0097A7'],
  },
  night: {
    label: '🌙 Night Exclusive',
    color: '#3F51B5',
    bgGradient: ['#3F51B5', '#303F9F'],
  },
  special: {
    label: '⭐ Limited Edition',
    color: '#FFD700',
    bgGradient: ['#FFD700', '#FFA000'],
  },
} as const;

/**
 * Rarity colors for sets
 */
export const SET_RARITY_CONFIG = {
  common: { label: 'Common', color: '#4CAF50', glow: 'rgba(76, 175, 80, 0.3)' },
  uncommon: { label: 'Uncommon', color: '#2196F3', glow: 'rgba(33, 150, 243, 0.3)' },
  rare: { label: 'Rare', color: '#9C27B0', glow: 'rgba(156, 39, 176, 0.3)' },
  epic: { label: 'Epic', color: '#FF9800', glow: 'rgba(255, 152, 0, 0.3)' },
  legendary: { label: 'Legendary', color: '#FFD700', glow: 'rgba(255, 215, 0, 0.4)' },
} as const;
