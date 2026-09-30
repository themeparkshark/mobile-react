import SetCollectionScreen from './SetCollectionScreen';
import { Image as NativeImage } from 'react-native';
import { MOCK_CHURRO_SET_DETAIL, MOCK_CHURRO_SET_LIST } from '../data/mockChurroSet';
import type { PrepItemSetDetailResponse, PrepItemSetItem, PrepItemSetListItem } from '../api/endpoints/me/prep-item-sets';

const designs = ['Scout', 'Starfinder', 'Moonbeam', 'Wave Rider',
  'Compass', 'Shark Fin', 'Movie Magic', 'Royal Glow'];
const hues = ['Aqua', 'Coral', 'Violet', 'Lime', 'Gold'];
const rarityNames = ['', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
const rarityColors = ['', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#FFD700'];
const nightItems: PrepItemSetItem[] = Array.from({ length: 40 }, (_, index) => {
  const number = index + 1;
  const rarity = number === 40 ? 5 : number >= 37 ? 4 : number >= 31 ? 3 : number >= 21 ? 2 : 1;
  const owned = number <= 9 || number === 26 || number === 34;
  return {
    id: 100 + number, variant_slug: `flashlight_${String(number).padStart(2, '0')}`,
    name: `${hues[index % 5]} ${designs[Math.floor(index / 5)]} Light`,
    description: 'A flashlight for your shark’s after-sunset collection.',
    icon_url: null, rarity, rarity_name: rarityNames[rarity],
    rarity_label: rarityNames[rarity][0].toUpperCase() + rarityNames[rarity].slice(1),
    rarity_color: rarityColors[rarity],
    rewards: { energy: rarity >= 4 ? 25 : rarity >= 2 ? 10 : 5,
      experience: rarity >= 4 ? 60 : rarity >= 2 ? 25 : 10,
      ticket_chance: rarity >= 4 ? 0.4 : rarity >= 2 ? 0.15 : 0.05,
      ticket_amount: rarity >= 4 ? 2 : 1 },
    is_collected: owned, found_in_world: owned,
    quantity_collected: owned ? 1 : 0,
    first_collected_at: owned ? '2026-09-24' : null,
    last_collected_at: owned ? '2026-09-24' : null,
  };
});
const nightCollected = nightItems.filter(item => item.is_collected).length;
const nightGate = { start_hour: null, end_hour: null,
  description: 'After sunset at your location', is_spawning_now: true };
const nightReward = { energy: 200, tickets: 30, experience: 1000,
  title: 'Night Navigator', badge_url: null };
const nightStarter = { target: 8, collected: 8, is_unlocked: true,
  rewards_claimed: false, rewards: { energy: 15, tickets: 2, experience: 30 } };
const nightSet: PrepItemSetListItem = {
  id: 2, slug: 'night_lights', name: 'Night Lights',
  description: 'Your shark lights the way after sunset. Find every color and design on an evening walk.',
  icon_url: null, theme: 'night',
  is_focused: false,
  theme_config: { label: 'Night Exclusive', color: '#3F51B5' },
  rarity: 'rare', time_gate: nightGate, weather_gate: null,
  total_items: 40, collected_count: nightCollected,
  progress_percentage: Math.round(nightCollected / 40 * 100), is_complete: false,
  spare_count: 3, exchange_cost: 4, rewards_claimed: false,
  starter_milestone: nightStarter, completion_rewards: nightReward,
};
const nightDetail: PrepItemSetDetailResponse['data'] = {
  set: { id: nightSet.id, slug: nightSet.slug, name: nightSet.name,
    description: nightSet.description, icon_url: null, theme: 'night',
    is_focused: false,
    theme_config: nightSet.theme_config, time_gate: nightGate },
  progress: { total: 40, collected: nightCollected,
    percentage: nightSet.progress_percentage, is_complete: false,
    collected_ids: nightItems.filter(item => item.is_collected).map(item => item.id),
    spare_count: 3, exchange_cost: 4, rewards_claimed: false,
    starter_milestone: nightStarter },
  discovery: { found_in_world: nightCollected, legendary_found_in_world: 0, legendary_total: 1 },
  items: nightItems,
  items_by_rarity: {
    legendary: nightItems.filter(item => item.rarity === 5),
    epic: nightItems.filter(item => item.rarity === 4),
    rare: nightItems.filter(item => item.rarity === 3),
    uncommon: nightItems.filter(item => item.rarity === 2),
    common: nightItems.filter(item => item.rarity === 1),
  },
  completion_rewards: nightReward,
};

const umbrellaDesigns = ['Bubble', 'Star', 'Cloud', 'Wave', 'Compass',
  'Shark Fin', 'Castle', 'Rainbow'];
const rainItems: PrepItemSetItem[] = nightItems.map((item, index) => {
  const number = index + 1;
  const owned = number <= 8 || number === 27;
  return {
    ...item, id: 200 + number,
    variant_slug: `umbrella_${String(number).padStart(2, '0')}`,
    name: `${hues[index % 5]} ${umbrellaDesigns[Math.floor(index / 5)]} Umbrella`,
    description: 'An umbrella for your shark’s rainy-day parade.',
    is_collected: owned, found_in_world: owned,
    quantity_collected: owned ? 1 : 0,
    first_collected_at: owned ? '2026-09-24' : null,
    last_collected_at: owned ? '2026-09-24' : null,
  };
});
const rainCollected = rainItems.filter(item => item.is_collected).length;
const rainGate = { start_hour: null, end_hour: null,
  description: 'While it is raining near you', is_spawning_now: true };
const rainReward = { energy: 200, tickets: 30, experience: 1000,
  title: 'Rain Parade Captain', badge_url: null };
const rainStarter = { ...nightStarter };
const rainSet: PrepItemSetListItem = {
  ...nightSet, id: 3, slug: 'rain_parade', name: 'Rain Parade',
  description: 'Rain turns your neighborhood into a parade. Find every umbrella before the clouds clear.',
  theme: 'weather', theme_config: { label: 'Weather Items', color: '#00BCD4' },
  time_gate: rainGate, weather_gate: ['rain'],
  collected_count: rainCollected, progress_percentage: Math.round(rainCollected / 40 * 100),
  starter_milestone: rainStarter, completion_rewards: rainReward,
};
const rainDetail: PrepItemSetDetailResponse['data'] = {
  set: { id: rainSet.id, slug: rainSet.slug, name: rainSet.name,
    description: rainSet.description, icon_url: null, theme: 'weather',
    is_focused: false,
    theme_config: rainSet.theme_config, time_gate: rainGate },
  progress: { ...nightDetail.progress, collected: rainCollected,
    percentage: rainSet.progress_percentage,
    collected_ids: rainItems.filter(item => item.is_collected).map(item => item.id),
    starter_milestone: rainStarter },
  discovery: { found_in_world: rainCollected, legendary_found_in_world: 0, legendary_total: 1 },
  items: rainItems,
  items_by_rarity: {
    legendary: rainItems.filter(item => item.rarity === 5),
    epic: rainItems.filter(item => item.rarity === 4),
    rare: rainItems.filter(item => item.rarity === 3),
    uncommon: rainItems.filter(item => item.rarity === 2),
    common: rainItems.filter(item => item.rarity === 1),
  },
  completion_rewards: rainReward,
};

const cameraDesigns = ['Scout', 'Star Shot', 'Sunset', 'Wave Rider',
  'Castle', 'Shark Fin', 'Fireworks', 'Golden Ticket'];
const cameraItems: PrepItemSetItem[] = nightItems.map((item, index) => ({
  ...item,
  id: 300 + index + 1,
  variant_slug: `camera_${String(index + 1).padStart(2, '0')}`,
  name: `${hues[index % 5]} ${cameraDesigns[Math.floor(index / 5)]} Camera`,
  description: 'A park-day photo kit camera for your shark.',
}));
const cameraSet: PrepItemSetListItem = {
  ...nightSet, id: 4, slug: 'camera_crew', name: 'Camera Crew',
  description: 'Build your shark a park-day photo kit. Collect every lens and look before the next adventure.',
  theme: 'gear', theme_config: { label: 'Park Gear', color: '#2196F3' },
  time_gate: null, availability: 'current', is_in_rotation: true,
  completion_rewards: { energy: 250, tickets: 30, experience: 1200,
    title: 'Camera Crew Captain', badge_url: null },
};
const cameraDetail: PrepItemSetDetailResponse['data'] = {
  ...nightDetail,
  set: { ...nightDetail.set, id: 4, slug: 'camera_crew', name: cameraSet.name,
    description: cameraSet.description, theme: 'gear',
    theme_config: cameraSet.theme_config, time_gate: null, is_in_rotation: true },
  items: cameraItems,
  items_by_rarity: {
    legendary: cameraItems.filter(item => item.rarity === 5),
    epic: cameraItems.filter(item => item.rarity === 4),
    rare: cameraItems.filter(item => item.rarity === 3),
    uncommon: cameraItems.filter(item => item.rarity === 2),
    common: cameraItems.filter(item => item.rarity === 1),
  },
  completion_rewards: cameraSet.completion_rewards,
};

/** Development-only layout review. These samples never request or change player data. */
export default function SetCollectionPreviewScreen() {
  if (process.env.EXPO_PUBLIC_FITTING_ROOM_PREVIEW === '1') {
    const previewIcon = NativeImage.resolveAssetSource(
      require('../../assets/images/prep-items/churros/churro_39.png')).uri;
    const starter_milestone = {
      target: 8, collected: 8, is_unlocked: true, rewards_claimed: false,
      rewards: { energy: 15, tickets: 2, experience: 30, title: 'Churro Collection Scout' },
      wearable_choices: [{ id: -1, name: 'Golden Churro Pin · layout sample',
        item_type_id: 8, icon_url: previewIcon, paper_url: null, owned: false }],
      awarded_item_id: null,
    };
    return <SetCollectionScreen
      previewSets={[{ ...MOCK_CHURRO_SET_LIST, starter_milestone }]}
      previewDetails={{ churro_collection: {
        ...MOCK_CHURRO_SET_DETAIL,
        progress: { ...MOCK_CHURRO_SET_DETAIL.progress,
          spare_count: 3, exchange_cost: 4, rewards_claimed: false,
          starter_milestone },
        discovery: { found_in_world: 19, legendary_found_in_world: 0,
          legendary_total: 2 },
      } }} />;
  }
  if (process.env.EXPO_PUBLIC_CAMERA_CREW_PREVIEW === '1') {
    return <SetCollectionScreen previewSets={[cameraSet]}
      previewDetails={{ camera_crew: cameraDetail }} />;
  }
  if (process.env.EXPO_PUBLIC_ARCHIVE_COLLECTION_PREVIEW === '1') {
    return <SetCollectionScreen
      previewSets={[MOCK_CHURRO_SET_LIST,
        { ...nightSet, id: 4, slug: 'camera_crew', name: 'Camera Crew',
          description: 'Build your shark a park-day photo kit. Collect every lens and look before the next adventure.',
          theme: 'gear', theme_config: { label: 'Park Gear', color: '#2196F3' },
          time_gate: null, availability: 'upcoming', is_in_rotation: false,
          collected_count: 0, progress_percentage: 0,
          starts_at: new Date(Date.now() + 7 * 86400000).toISOString() },
        { ...rainSet, availability: 'archived', is_in_rotation: false }]}
      previewDetails={{
        churro_collection: { ...MOCK_CHURRO_SET_DETAIL,
          progress: { ...MOCK_CHURRO_SET_DETAIL.progress, spare_count: 3,
            exchange_cost: 4, rewards_claimed: false,
            starter_milestone: MOCK_CHURRO_SET_LIST.starter_milestone },
          discovery: { found_in_world: 19, legendary_found_in_world: 0, legendary_total: 2 } },
        rain_parade: { ...rainDetail,
          set: { ...rainDetail.set, is_in_rotation: false } },
      }} />;
  }
  if (process.env.EXPO_PUBLIC_RAIN_PARADE_PREVIEW === '1') {
    return <SetCollectionScreen previewSets={[rainSet]}
      previewDetails={{ rain_parade: rainDetail }} />;
  }
  if (process.env.EXPO_PUBLIC_NIGHT_LIGHTS_PREVIEW === '1') {
    return <SetCollectionScreen previewSets={[nightSet]}
      previewDetails={{ night_lights: nightDetail }} />;
  }
  const detail: PrepItemSetDetailResponse['data'] = {
    ...MOCK_CHURRO_SET_DETAIL,
    progress: {
      ...MOCK_CHURRO_SET_DETAIL.progress,
      spare_count: 3,
      exchange_cost: 4,
      rewards_claimed: false,
      starter_milestone: MOCK_CHURRO_SET_LIST.starter_milestone,
    },
    discovery: { found_in_world: 19, legendary_found_in_world: 0, legendary_total: 2 },
  };
  return <SetCollectionScreen previewSets={[MOCK_CHURRO_SET_LIST]}
    previewDetails={{ churro_collection: detail }} />;
}
