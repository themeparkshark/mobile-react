/**
 * Dev-only collection book preview (EXPO_PUBLIC_SET_COLLECTION_PREVIEW=1).
 * Builds today's legacy payloads plus the optional v3 dex overlay from the
 * Home Hunt v3 catalog, so one preview covers both servers. Item and badge
 * art load from EXPO_PUBLIC_DEX_PREVIEW_ART (a file:// or http base for the
 * art folder); without it, bundled churro art stands in.
 */
import type { PrepItemSetDetailResponse, PrepItemSetItem, PrepItemSetListItem, StarterMilestone } from '../api/endpoints/me/prep-item-sets';
import { MOCK_DEX_SETS, type MockDexSet } from '../data/mockDexCatalog';
import SetCollectionScreen from './SetCollectionScreen';

const ART = process.env.EXPO_PUBLIC_DEX_PREVIEW_ART ?? '';
const RARITY = ['', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
const HINTS: Record<string, string> = {
  always: 'Pops up near you, any time.',
  time: 'After sunset near you.',
  days: 'Weekends near you.',
  seasonal: 'October only.',
};
const DAY = 24 * 60 * 60 * 1000;

interface Scenario {
  readonly found: number;
  readonly claimed?: boolean;
  readonly starter?: 'claimable' | 'locked' | 'claimed' | null;
  readonly status?: 'active' | 'resting' | 'upcoming' | 'retired';
  readonly spawning?: boolean | null;
  readonly focused?: boolean;
}

// One story per set: mid-hunt, finished and ready to claim, starter ready, resting at night, coming soon.
const SCENARIOS: Record<string, Scenario> = {
  snack_stand: { found: 8, starter: 'claimed', focused: true },
  churro_cart: { found: 9, starter: 'claimed' },
  sweet_treats: { found: 5, starter: 'claimable' },
  souvenirs: { found: 2, starter: 'locked' },
  ride_day_gear: { found: 12, claimed: true, starter: 'claimed' },
  night_glow: { found: 3, starter: 'locked', status: 'resting', spawning: false },
  parade_day: { found: 0, starter: 'locked' },
  spooky_snacks: { found: 0, status: 'upcoming' },
};

function owned(index: number, count: number, total: number): boolean {
  // Spread the finds so silhouettes mix in, Legendary last.
  const order = Array.from({ length: total }, (_, i) => i).sort((a, b) => ((a * 7) % total) - ((b * 7) % total));
  return order.slice(0, count).includes(index);
}

function build(set: MockDexSet, setIndex: number) {
  const scene = SCENARIOS[set.slug] ?? { found: 0 };
  const total = set.items.length;
  const items: PrepItemSetItem[] = set.items.map((item, index) => {
    const have = scene.found >= total || owned(index, scene.found, total);
    const copies = have ? 1 + ((index * 5 + setIndex) % 4) : 0;
    return {
      id: setIndex * 100 + index + 1, name: item.name, variant_slug: '', description: item.flavor,
      icon_url: ART ? `${ART}/items/${item.slug}.png` : null,
      rarity: item.rarity, rarity_name: RARITY[item.rarity], rarity_label: RARITY[item.rarity],
      rarity_color: '#1d9bf0', rewards: { energy: 5, experience: 10, ticket_chance: 0.05, ticket_amount: 1 },
      is_collected: have, found_in_world: have ? index !== 2 : false, quantity_collected: copies,
      first_collected_at: have ? new Date(Date.now() - (index === 0 ? 2 * 60 * 60 * 1000 : 6 * DAY)).toISOString() : null,
      last_collected_at: null,
    };
  });
  if (!ART) items.forEach((item, index) => { (item as { variant_slug: string }).variant_slug = `churro_${String((index % 40) + 1).padStart(2, '0')}`; });
  const found = items.filter(item => item.is_collected).length;
  const complete = found >= total;
  const starter: StarterMilestone | null = scene.starter ? {
    target: 5, collected: Math.min(5, found), is_unlocked: scene.starter !== 'locked', rewards_claimed: scene.starter === 'claimed',
    rewards: { energy: 15, tickets: 1, experience: 30 },
  } : null;
  const rewards = { energy: set.reward.energy, tickets: set.reward.tickets, experience: set.reward.xp, title: set.reward.title, badge_url: null };
  const status = scene.status ?? 'active';
  const timeGate = scene.spawning === false ? { start_hour: null, end_hour: null, description: 'After sunset', is_spawning_now: false } : null;
  const list: PrepItemSetListItem = {
    id: setIndex + 1, slug: set.slug, name: set.name, description: '', icon_url: null, theme: 'food',
    theme_config: { label: set.name, color: set.color }, rarity: 'common', is_focused: scene.focused === true,
    availability: status === 'upcoming' ? 'upcoming' : status === 'retired' ? 'archived' : 'current',
    starts_at: status === 'upcoming' ? '2026-10-15T07:00:00Z' : null,
    time_gate: timeGate, weather_gate: null, total_items: total, collected_count: found,
    progress_percentage: Math.round((found / total) * 100), is_complete: complete, spare_count: 6, exchange_cost: 4,
    rewards_claimed: scene.claimed === true, starter_milestone: starter, completion_rewards: rewards,
  };
  const detail: PrepItemSetDetailResponse['data'] = {
    set: { id: list.id, slug: set.slug, name: set.name, description: '', icon_url: null, theme: 'food',
      is_focused: list.is_focused, theme_config: list.theme_config, time_gate: timeGate },
    progress: { total, collected: found, percentage: list.progress_percentage, is_complete: complete,
      collected_ids: items.filter(item => item.is_collected).map(item => item.id), spare_count: 6, exchange_cost: 4,
      exchange_costs: { 1: 4, 2: 4, 3: 4, 4: 8, 5: 12 }, rewards_claimed: list.rewards_claimed, starter_milestone: starter },
    items,
    items_by_rarity: { legendary: [], epic: [], rare: [], uncommon: [], common: [] },
    completion_rewards: rewards,
  };
  const grades = ['good', 'great', 'frame_it'];
  const dexSet = {
    // Set badges are still being drawn: the set's top item stands in.
    slug: set.slug, color: set.color, badge_url: ART ? `${ART}/items/${set.items[set.items.length - 1].slug}.png` : null,
    status, spawning_now: scene.spawning ?? (status === 'active' ? true : null), spawn_hint: HINTS[set.spawn] ?? null,
    reward: { coins: set.reward.coins },
  };
  const dexItems = items.map((item, index) => ({
    id: item.id,
    spawn_hint: HINTS[set.spawn] ?? null,
    // Uncommon-or-better finds carry their best Ride Photo (CONTRACT 3.2); one is a Golden Hour catch.
    best_photo: item.is_collected && item.rarity >= 2
      ? { quality: grades[index % 3], golden_hour: index === 5, frame: grades[index % 3] === 'frame_it' ? 'gold' : 'plain' } : null,
  }));
  return { list, detail, dexSet, dexItems };
}

const BUILT = MOCK_DEX_SETS.map(build);

export default function SetCollectionPreviewScreen() {
  return (
    <SetCollectionScreen
      previewSets={BUILT.map(entry => entry.list)}
      previewDetails={Object.fromEntries(BUILT.map(entry => [entry.list.slug, entry.detail]))}
      previewDex={{ sets: BUILT.map(entry => entry.dexSet) }}
      previewDexDetails={Object.fromEntries(BUILT.map(entry => [entry.list.slug, { items: entry.dexItems }]))}
    />
  );
}
