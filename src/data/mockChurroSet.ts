/**
 * Mock data for the Churro Collection set.
 * Used for previewing the UI when backend isn't available.
 */

import { PrepItemSetItem, PrepItemSetListItem } from '../api/endpoints/me/prep-item-sets';

// Map rarity names to numbers
const RARITY_MAP: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

// All 40 churros from the generated config
const CHURRO_ITEMS: PrepItemSetItem[] = [
  // COMMON (20)
  { id: 1, name: 'Classic Cinnamon', variant_slug: 'churro_01', description: 'Simple and delicious!', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 3, first_collected_at: '2026-01-20', last_collected_at: '2026-01-27' },
  { id: 2, name: 'Sugar Dusted', variant_slug: 'churro_02', description: 'The everyday favorite.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 2, first_collected_at: '2026-01-21', last_collected_at: '2026-01-26' },
  { id: 3, name: 'Honey Glazed', variant_slug: 'churro_03', description: 'A classic churro with that familiar taste.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-22', last_collected_at: '2026-01-22' },
  { id: 4, name: 'Brown Sugar', variant_slug: 'churro_04', description: 'A warm, cozy classic.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 5, name: 'Maple Swirl', variant_slug: 'churro_05', description: 'Sweet maple goodness.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-25', last_collected_at: '2026-01-25' },
  { id: 6, name: 'Vanilla Bean', variant_slug: 'churro_06', description: 'Smooth vanilla flavor.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 7, name: 'Caramel Drizzle', variant_slug: 'churro_07', description: 'Drizzled with golden caramel.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 2, first_collected_at: '2026-01-23', last_collected_at: '2026-01-26' },
  { id: 8, name: 'Dulce de Leche', variant_slug: 'churro_08', description: 'Latin American sweet cream.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 9, name: 'Butterscotch', variant_slug: 'churro_09', description: 'Rich and buttery.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-24', last_collected_at: '2026-01-24' },
  { id: 10, name: 'Toasted Coconut', variant_slug: 'churro_10', description: 'Tropical vibes.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 11, name: 'Churro Original', variant_slug: 'churro_11', description: 'The OG churro.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 4, first_collected_at: '2026-01-19', last_collected_at: '2026-01-27' },
  { id: 12, name: 'Cinnamon Toast', variant_slug: 'churro_12', description: 'Like your favorite cereal.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 13, name: 'Golden Crisp', variant_slug: 'churro_13', description: 'Perfectly golden and crispy.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-26', last_collected_at: '2026-01-26' },
  { id: 14, name: 'Sweet Cream', variant_slug: 'churro_14', description: 'Delicate and creamy.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 15, name: 'Salted Caramel', variant_slug: 'churro_15', description: 'Sweet meets salty.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 2, first_collected_at: '2026-01-22', last_collected_at: '2026-01-25' },
  { id: 16, name: 'Toffee Crunch', variant_slug: 'churro_16', description: 'Crunchy toffee bits.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 17, name: 'Praline', variant_slug: 'churro_17', description: 'Nutty and sweet.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-27', last_collected_at: '2026-01-27' },
  { id: 18, name: 'Snickerdoodle', variant_slug: 'churro_18', description: 'Cookie-inspired churro!', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 19, name: 'Biscoff', variant_slug: 'churro_19', description: 'Speculoos spice magic.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-26', last_collected_at: '2026-01-26' },
  { id: 20, name: 'Cookie Butter', variant_slug: 'churro_20', description: 'Smooth and decadent.', icon_url: null, rarity: 1, rarity_name: 'common', rarity_label: 'Common', rarity_color: '#4CAF50', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },

  // UNCOMMON (12)
  { id: 21, name: 'Chocolate Dipped', variant_slug: 'churro_21', description: 'A special twist on the classic!', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: true, quantity_collected: 2, first_collected_at: '2026-01-24', last_collected_at: '2026-01-26' },
  { id: 22, name: 'Strawberry Frosted', variant_slug: 'churro_22', description: 'Pink and delicious!', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-25', last_collected_at: '2026-01-25' },
  { id: 23, name: 'Blueberry Bliss', variant_slug: 'churro_23', description: 'Berry good choice!', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 24, name: 'Matcha Green Tea', variant_slug: 'churro_24', description: 'Zen in churro form.', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-27', last_collected_at: '2026-01-27' },
  { id: 25, name: 'Ube Purple Yam', variant_slug: 'churro_25', description: 'Filipino-inspired beauty!', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 26, name: 'Red Velvet', variant_slug: 'churro_26', description: 'Elegant and rich.', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-26', last_collected_at: '2026-01-26' },
  { id: 27, name: 'Orange Creamsicle', variant_slug: 'churro_27', description: 'Summer in a churro!', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 28, name: 'Lemon Zest', variant_slug: 'churro_28', description: 'Bright and zingy!', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 29, name: 'Mint Chocolate', variant_slug: 'churro_29', description: 'Cool and refreshing.', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-25', last_collected_at: '2026-01-25' },
  { id: 30, name: 'Cookies & Cream', variant_slug: 'churro_30', description: 'Fan favorite flavor!', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 31, name: 'Pumpkin Spice', variant_slug: 'churro_31', description: 'Fall vibes year-round.', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 32, name: 'Birthday Cake', variant_slug: 'churro_32', description: 'Every day is a celebration!', icon_url: null, rarity: 2, rarity_name: 'uncommon', rarity_label: 'Uncommon', rarity_color: '#2196F3', rewards: { energy: 10, experience: 25, ticket_chance: 0.15, ticket_amount: 1 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-27', last_collected_at: '2026-01-27' },

  // RARE (6)
  { id: 33, name: 'Cotton Candy', variant_slug: 'churro_33', description: "A rare find! Lucky you!", icon_url: null, rarity: 3, rarity_name: 'rare', rarity_label: 'Rare', rarity_color: '#9C27B0', rewards: { energy: 20, experience: 50, ticket_chance: 0.30, ticket_amount: 2 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-26', last_collected_at: '2026-01-26' },
  { id: 34, name: 'Tropical Mango', variant_slug: 'churro_34', description: "These don't come around often!", icon_url: null, rarity: 3, rarity_name: 'rare', rarity_label: 'Rare', rarity_color: '#9C27B0', rewards: { energy: 20, experience: 50, ticket_chance: 0.30, ticket_amount: 2 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 35, name: 'Galaxy Swirl', variant_slug: 'churro_35', description: 'Out of this world!', icon_url: null, rarity: 3, rarity_name: 'rare', rarity_label: 'Rare', rarity_color: '#9C27B0', rewards: { energy: 20, experience: 50, ticket_chance: 0.30, ticket_amount: 2 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 36, name: 'Electric Blue', variant_slug: 'churro_36', description: 'Collectors go wild for this one!', icon_url: null, rarity: 3, rarity_name: 'rare', rarity_label: 'Rare', rarity_color: '#9C27B0', rewards: { energy: 20, experience: 50, ticket_chance: 0.30, ticket_amount: 2 }, is_collected: true, quantity_collected: 1, first_collected_at: '2026-01-27', last_collected_at: '2026-01-27' },
  { id: 37, name: 'Watermelon Wave', variant_slug: 'churro_37', description: 'Summer in every bite!', icon_url: null, rarity: 3, rarity_name: 'rare', rarity_label: 'Rare', rarity_color: '#9C27B0', rewards: { energy: 20, experience: 50, ticket_chance: 0.30, ticket_amount: 2 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 38, name: 'Sunset Orange', variant_slug: 'churro_38', description: 'Beautiful and rare!', icon_url: null, rarity: 3, rarity_name: 'rare', rarity_label: 'Rare', rarity_color: '#9C27B0', rewards: { energy: 20, experience: 50, ticket_chance: 0.30, ticket_amount: 2 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },

  // LEGENDARY (2)
  { id: 39, name: 'Golden Churro', variant_slug: 'churro_39', description: '🌟 LEGENDARY! An extremely rare churro!', icon_url: null, rarity: 5, rarity_name: 'legendary', rarity_label: 'Legendary', rarity_color: '#FFD700', rewards: { energy: 50, experience: 100, ticket_chance: 1.0, ticket_amount: 5 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
  { id: 40, name: 'Rainbow Galaxy', variant_slug: 'churro_40', description: '✨ The rarest of them all!', icon_url: null, rarity: 5, rarity_name: 'legendary', rarity_label: 'Legendary', rarity_color: '#FFD700', rewards: { energy: 50, experience: 100, ticket_chance: 1.0, ticket_amount: 5 }, is_collected: false, quantity_collected: 0, first_collected_at: null, last_collected_at: null },
];

// Calculate progress
const collectedCount = CHURRO_ITEMS.filter(i => i.is_collected).length;
const totalItems = CHURRO_ITEMS.length;
const progressPercentage = Math.round((collectedCount / totalItems) * 100);

// Mock set list item
export const MOCK_CHURRO_SET_LIST: PrepItemSetListItem = {
  id: 1,
  slug: 'churro_collection',
  name: 'Churro Collection',
  description: 'Collect all 40 delicious churro variants! Find them during the day while exploring.',
  icon_url: null,
  theme: 'food',
  theme_config: {
    label: '🍿 Food & Snacks',
    color: '#FF9800',
  },
  rarity: 'common',
  time_gate: {
    start_hour: 6,
    end_hour: 21,
    description: 'Available 6 AM - 9 PM',
    is_spawning_now: true, // It's daytime
  },
  weather_gate: null,
  total_items: totalItems,
  collected_count: collectedCount,
  progress_percentage: progressPercentage,
  is_complete: false,
  completion_rewards: {
    energy: 500,
    tickets: 50,
    experience: 1000,
    title: 'Churro Connoisseur',
    badge_url: null,
  },
};

// Group items by rarity
const groupByRarity = () => {
  return {
    legendary: CHURRO_ITEMS.filter(i => i.rarity === 5),
    epic: CHURRO_ITEMS.filter(i => i.rarity === 4),
    rare: CHURRO_ITEMS.filter(i => i.rarity === 3),
    uncommon: CHURRO_ITEMS.filter(i => i.rarity === 2),
    common: CHURRO_ITEMS.filter(i => i.rarity === 1),
  };
};

// Mock set detail
export const MOCK_CHURRO_SET_DETAIL = {
  set: {
    id: 1,
    slug: 'churro_collection',
    name: 'Churro Collection',
    description: 'Collect all 40 delicious churro variants! Find them during the day while exploring.',
    icon_url: null,
    theme: 'food',
    theme_config: {
      label: '🍿 Food & Snacks',
      color: '#FF9800',
    },
    time_gate: {
      start_hour: 6,
      end_hour: 21,
      description: 'Available 6 AM - 9 PM',
      is_spawning_now: true,
    },
  },
  progress: {
    total: totalItems,
    collected: collectedCount,
    percentage: progressPercentage,
    is_complete: false,
    collected_ids: CHURRO_ITEMS.filter(i => i.is_collected).map(i => i.id),
  },
  items: CHURRO_ITEMS,
  items_by_rarity: groupByRarity(),
  completion_rewards: {
    energy: 500,
    tickets: 50,
    experience: 1000,
    title: 'Churro Connoisseur',
    badge_url: null,
  },
};

export default {
  sets: [MOCK_CHURRO_SET_LIST],
  detail: MOCK_CHURRO_SET_DETAIL,
};
