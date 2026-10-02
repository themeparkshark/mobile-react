/**
 * Stamp Book v2 view model: pure functions, no React. The screen renders what
 * these return; tools/tests/stamp-book.test.cjs pins the rules.
 *
 * Server fields added by stamps v2 (`section`, `icon_url`, `how_to`,
 * top-level `sections`) are optional: an older server still renders, grouped
 * by a client-side fallback and drawn with bundled art.
 */
import type { StampData, StampRewards, StampSectionInfo, StampsResponse } from '../../api/endpoints/me/stamps';

export type Rarity = StampData['rarity'];

export interface BookStamp {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly howTo: string;
  readonly section: string;
  readonly rarity: Rarity;
  readonly earned: boolean;
  readonly earnedAt: string | null;
  readonly secret: boolean;
  readonly progress: number;
  readonly target: number;
  readonly percent: number;
  readonly rewardClaimed: boolean;
  readonly rewards: StampRewards;
  readonly iconUrl: string | null;
  readonly imageKey: string | null;
  readonly sortOrder: number;
}

export interface BookSection {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly blurb: string;
  readonly stamps: readonly BookStamp[];
  readonly earned: number;
  readonly total: number;
}

/** Book order and look when the server sends no `sections` (older backend). */
export const FALLBACK_SECTIONS: readonly StampSectionInfo[] = [
  { key: 'parks', label: 'Park Passport', color: '#2F6BFF', blurb: 'Check in at parks and finish ride passports.' },
  { key: 'hunt', label: 'Treasure Hunt', color: '#FF8A3D', blurb: 'Catch finds on the map and finish sets.' },
  { key: 'rides', label: 'Ride Coins', color: '#F5B700', blurb: 'Collect, upgrade and play for ride coins.' },
  { key: 'friends', label: 'Friends', color: '#16B39A', blurb: 'Play with friends.' },
  { key: 'streaks', label: 'Streaks', color: '#F4511E', blurb: 'Come back day after day.' },
  { key: 'milestones', label: 'Milestones', color: '#29B6F6', blurb: 'Level up and save up.' },
  { key: 'special', label: 'Special', color: '#B8C7DC', blurb: 'Rare moments and secrets.' },
];

/** Same rules as the server's StampBook::section, for an older backend. */
export function sectionForMetric(metric: string, hidden: boolean): string {
  if (hidden) return 'special';
  if (/^(visited_|park_shelf:|ride_passport_)/.test(metric) || metric === 'parks_visited') return 'parks';
  if (['prep_items_collected', 'sets_completed', 'wild_legendary_variants'].includes(metric)) return 'hunt';
  if (/^(park_coins_|ride_coins_|ride_boss|verified_lineplay|trivia_|line_bonus)/.test(metric)) return 'rides';
  if (metric === 'friends_count') return 'friends';
  if (['longest_streak', 'current_streak', 'login_streak_7'].includes(metric)) return 'streaks';
  if (['total_experience', 'experience_level', 'coins_earned', 'coins_held', 'tickets_earned', 'energy_earned'].includes(metric)) {
    return 'milestones';
  }
  return 'special';
}

const RARITY_RANK: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };

export function rarityRank(rarity: Rarity): number {
  return RARITY_RANK[rarity] ?? 1;
}

/** Rare and up get the foil shine and the reveal sound. */
export function hasShine(stamp: Pick<BookStamp, 'rarity' | 'earned'>): boolean {
  return stamp.earned && rarityRank(stamp.rarity) >= 3;
}

export function toBookStamp(s: StampData): BookStamp {
  const target = Math.max(1, Number(s.target ?? s.target_value) || 1);
  const progress = Math.max(0, Number(s.progress) || 0);
  const secret = !!s.is_hidden && !s.is_earned;
  return {
    id: s.id,
    slug: s.slug,
    name: secret ? 'Secret stamp' : s.name,
    howTo: secret ? 'Keep playing to discover this one.' : (s.how_to ?? s.goal ?? '').trim(),
    section: s.section ?? sectionForMetric(s.metric ?? '', !!s.is_hidden),
    rarity: s.rarity,
    earned: !!s.is_earned,
    earnedAt: s.earned_at ?? null,
    secret,
    progress: s.is_earned ? Math.max(progress, target) : progress,
    target,
    percent: s.is_earned ? 100 : Math.min(100, Math.max(0, Math.round((progress / target) * 100))),
    rewardClaimed: !!s.reward_claimed,
    rewards: s.rewards,
    iconUrl: s.icon_url ?? null,
    imageKey: s.image_key ?? null,
    sortOrder: s.sort_order ?? 0,
  };
}

/** Earned first (newest first), then closest to done, then catalog order. */
export function compareStamps(a: BookStamp, b: BookStamp): number {
  if (a.earned !== b.earned) return a.earned ? -1 : 1;
  if (a.earned && b.earned) return (b.earnedAt ?? '').localeCompare(a.earnedAt ?? '') || a.sortOrder - b.sortOrder;
  if (a.secret !== b.secret) return a.secret ? 1 : -1;
  return b.percent - a.percent || a.sortOrder - b.sortOrder || a.id - b.id;
}

export function buildBook(response: Pick<StampsResponse, 'stamps' | 'sections'>): BookSection[] {
  const all = Object.values(response.stamps ?? {}).flat().map(toBookStamp);
  const infos = response.sections?.length ? response.sections : FALLBACK_SECTIONS;
  const known = new Set(infos.map(info => info.key));
  return infos
    .map(info => {
      const stamps = all.filter(s => s.section === info.key || (info.key === 'special' && !known.has(s.section)))
        .sort(compareStamps);
      return {
        key: info.key,
        label: info.label,
        color: info.color,
        blurb: info.blurb,
        stamps,
        earned: stamps.filter(s => s.earned).length,
        total: stamps.filter(s => !s.secret || s.earned).length,
      };
    })
    .filter(section => section.stamps.length > 0);
}

export function bookTotals(sections: readonly BookSection[]): { earned: number; total: number; toClaim: number } {
  const stamps = sections.flatMap(s => s.stamps);
  return {
    earned: stamps.filter(s => s.earned).length,
    total: stamps.filter(s => !s.secret || s.earned).length,
    toClaim: stamps.filter(s => s.earned && !s.rewardClaimed && hasRewards(s.rewards)).length,
  };
}

export function hasRewards(r: StampRewards | null | undefined): boolean {
  return !!r && (r.energy > 0 || r.tickets > 0 || r.xp > 0 || r.coins > 0 || !!r.title);
}

/** Reward chips, in display order. */
export function rewardChips(r: StampRewards): { kind: 'energy' | 'tickets' | 'xp' | 'coins' | 'title'; label: string }[] {
  const chips: { kind: 'energy' | 'tickets' | 'xp' | 'coins' | 'title'; label: string }[] = [];
  if (r.energy > 0) chips.push({ kind: 'energy', label: `+${r.energy} Energy` });
  if (r.tickets > 0) chips.push({ kind: 'tickets', label: `+${r.tickets} Ticket${r.tickets === 1 ? '' : 's'}` });
  if (r.xp > 0) chips.push({ kind: 'xp', label: `+${r.xp.toLocaleString('en-US')} XP` });
  if (r.coins > 0) chips.push({ kind: 'coins', label: `+${r.coins.toLocaleString('en-US')} Coins` });
  if (r.title) chips.push({ kind: 'title', label: `"${r.title}" title` });
  return chips;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 2, 2026" in the player's local time. Never a relative date. */
export function earnedDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** "3 / 10" for a count, "40%" for a percent-based passport. */
export function progressLabel(stamp: Pick<BookStamp, 'progress' | 'target'>): string {
  if (stamp.target === 100 && stamp.progress <= 100) return `${Math.min(100, stamp.progress)}%`;
  const fmt = (n: number) => n.toLocaleString('en-US');
  return `${fmt(Math.min(stamp.progress, stamp.target))} / ${fmt(stamp.target)}`;
}

/** Ring geometry for a 0..1 fraction (SVG stroke-dasharray). */
export function ring(fraction: number, radius: number): { circumference: number; offset: number } {
  const circumference = 2 * Math.PI * radius;
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return { circumference, offset: circumference * (1 - f) };
}
