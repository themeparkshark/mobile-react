/**
 * Shark Shop v2 shelf logic (shop-v2/CONTRACT.md). Pure and import-free so
 * tools/tests can run it without React Native.
 */

interface SectionLike {
  readonly type: string;
  readonly ends_at: string;
  readonly event_ends_at?: string | null;
  readonly last_chance?: boolean;
  readonly color?: string | null;
}

interface SetLike {
  readonly slug: string;
  readonly name: string;
  readonly title: string | null;
  readonly owned: number;
  readonly total: number;
  readonly reward_state: string;
  readonly xp_reward?: number;
}

interface ItemLike {
  readonly id: number;
  readonly has_purchased?: boolean;
  readonly shop?: {
    readonly is_owned?: boolean;
    readonly last_chance?: boolean;
    readonly returning?: boolean;
    readonly set?: { readonly slug: string } | null;
  };
}

/** "5h 12m", "3d 4h", "12m", "under a minute". */
export function shortDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return 'under a minute';
}

/**
 * The live "why now" line for a section header, counted from real timestamps
 * so it never goes stale on screen.
 */
export function sectionTimeLabel(section: SectionLike, nowMs: number): string {
  if (section.type === 'event') {
    const end = Date.parse(section.event_ends_at ?? section.ends_at);
    const left = end - nowMs;
    if (left <= 0) return 'Ending now';
    const days = Math.ceil(left / 86_400_000);
    if (left < 86_400_000) return `Last day: ${shortDuration(left)} left`;
    if (section.last_chance) return `Last chance: ${days} days left`;
    return `${days} days left`;
  }
  const left = Date.parse(section.ends_at) - nowMs;
  if (left <= 0) return 'New items now';
  if (section.type === 'daily') return `Leaving in ${shortDuration(left)}`;
  return `New in ${shortDuration(left)}`;
}

/** Section accent: event colour from the calendar, gold Featured, sky Daily. */
export function sectionAccent(section: SectionLike): string {
  if (section.type === 'event' && section.color) return section.color;
  if (section.type === 'featured') return '#ffcf3b';
  return '#7cc6f5';
}

/** Readable ink on an accent colour (navy on light, white on dark). */
export function inkOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#ffffff';
  const n = parseInt(match[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#05346e' : '#ffffff';
}

export type TileTag = 'owned' | 'last_chance' | 'returning' | null;

/** One tag per tile, most useful first. */
export function tileTag(item: ItemLike): TileTag {
  if (item.shop?.is_owned ?? item.has_purchased) return 'owned';
  if (item.shop?.last_chance) return 'last_chance';
  if (item.shop?.returning) return 'returning';
  return null;
}

export const TILE_TAG_LABEL: Record<Exclude<TileTag, null>, string> = {
  owned: 'OWNED',
  last_chance: 'LAST CHANCE',
  returning: 'BACK AGAIN',
};

/** "Finish the look: get the Pirate Captain title and 120 XP". */
export function setRewardText(set: SetLike): string {
  const parts: string[] = [];
  if (set.title) parts.push(`the ${set.title} title`);
  if (set.xp_reward && set.xp_reward > 0) parts.push(`${set.xp_reward} XP`);
  return parts.length ? `Finish the look: get ${parts.join(' and ')}` : 'Finish the look';
}

/** "2 of 4", or "Complete!" once every piece is yours. */
export function setProgressText(set: SetLike): string {
  if (set.reward_state === 'claimed' || set.owned >= set.total) return 'Complete!';
  return `${set.owned} of ${set.total}`;
}

/** Pieces of a set on today's shelves that the player doesn't own yet. */
export function missingPiecesToday<T extends ItemLike>(slug: string, items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter(item => {
    if (item.shop?.set?.slug !== slug || seen.has(item.id)) return false;
    seen.add(item.id);
    return !(item.shop?.is_owned ?? item.has_purchased);
  });
}

/** The big tile for a section: the server's hero, else the first unowned item. */
export function heroItem<T extends ItemLike>(heroId: number | null | undefined, items: T[]): T | null {
  return items.find(item => item.id === heroId) ?? items.find(item => !(item.shop?.is_owned ?? item.has_purchased)) ?? items[0] ?? null;
}

/** Toggle an id in a wishlist (optimistic UI before the server answers). */
export function toggleWish(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}
