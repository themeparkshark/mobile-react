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
  readonly thumbUrl: string | null;
  readonly lockedUrl: string | null;
  readonly lockedThumbUrl: string | null;
  readonly imageKey: string | null;
  readonly sortOrder: number;
  readonly metric: string;
  readonly shortName: string;
  readonly retired: boolean;
  readonly claimable: boolean;
  /** The empty corner of the art (server hint), where the postmark goes. */
  readonly freeCorner: Corner;
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

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
  if (metric === 'night_show') return 'special';
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
  const name = secret ? 'Secret stamp' : s.name;
  return {
    id: s.id,
    slug: s.slug,
    name,
    shortName: secret ? 'Secret' : (s.short_name ?? name).trim(),
    metric: s.metric ?? '',
    retired: !!s.retired,
    freeCorner: (['tl', 'tr', 'bl', 'br'] as const).find(c => c === s.art_free_corner) ?? 'tr',
    claimable: !!s.is_earned && !s.reward_claimed && hasRewards(s.rewards),
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
    thumbUrl: s.icon_thumb_url ?? s.icon_url ?? null,
    lockedUrl: s.locked_icon_url ?? null,
    lockedThumbUrl: s.locked_thumb_url ?? s.locked_icon_url ?? null,
    imageKey: s.image_key ?? null,
    sortOrder: s.sort_order ?? 0,
  };
}

/** Rewards waiting first, then earned (newest first), then closest to done, then catalog order. */
export function compareStamps(a: BookStamp, b: BookStamp): number {
  if (a.claimable !== b.claimable) return a.claimable ? -1 : 1;
  if (a.earned !== b.earned) return a.earned ? -1 : 1;
  if (a.earned && b.earned) return (b.earnedAt ?? '').localeCompare(a.earnedAt ?? '') || a.sortOrder - b.sortOrder;
  if (a.secret !== b.secret) return a.secret ? 1 : -1;
  return b.percent - a.percent || a.sortOrder - b.sortOrder || a.id - b.id;
}

/** Fields that change what a tile shows. Same key: reuse the old object so memoized tiles skip. */
function stampKey(s: BookStamp): string {
  return [s.progress, s.earned, s.earnedAt, s.rewardClaimed, s.iconUrl, s.thumbUrl, s.lockedThumbUrl, s.shortName, s.howTo, s.retired, s.freeCorner].join('|');
}

/**
 * Builds the book. Pass the previous book's stamps (`reuse`) and any unchanged
 * stamp keeps its object identity, so a refetch or a claim re-renders only the
 * tiles that changed.
 */
export function buildBook(response: Pick<StampsResponse, 'stamps' | 'sections'>, reuse?: ReadonlyMap<number, BookStamp>): BookSection[] {
  const all = Object.values(response.stamps ?? {}).flat().map(raw => {
    const next = toBookStamp(raw);
    const prev = reuse?.get(next.id);
    return prev && stampKey(prev) === stampKey(next) ? prev : next;
  });
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
    toClaim: stamps.filter(s => s.claimable).length,
  };
}

export function stampIndex(sections: readonly BookSection[]): Map<number, BookStamp> {
  return new Map(sections.flatMap(s => s.stamps).map(s => [s.id, s]));
}

/** Every stamp with rewards waiting, in book order: the claim chain. */
export function claimQueue(sections: readonly BookSection[]): BookStamp[] {
  return sections.flatMap(s => s.stamps).filter(s => s.claimable);
}

/** The locked stamp closest to done (not secret, not retired): the hero "Next stamp". */
export function nextUp(sections: readonly BookSection[], only?: string): BookStamp | null {
  if (only && only !== 'all') sections = sections.filter(sc => sc.key === only);
  const open = sections.flatMap(s => s.stamps).filter(s => !s.earned && !s.secret && !s.retired && s.progress > 0);
  open.sort((a, b) => b.percent - a.percent || (a.target - a.progress) - (b.target - b.progress) || a.sortOrder - b.sortOrder);
  return open[0] ?? null;
}

/** 80% or more and not yet earned. */
export function almostThere(s: Pick<BookStamp, 'earned' | 'secret' | 'percent'>): boolean {
  return !s.earned && !s.secret && s.percent >= 80;
}

/** The ghost (locked) art is only shown with a real color bleed once past 75%. */
export function bleedFraction(s: Pick<BookStamp, 'earned' | 'percent'>): number {
  if (s.earned || s.percent < 75) return 0;
  // Capped well below "owned": an 85%-done stamp shows 55% colour, never more than 65%.
  return Math.min(BLEED_CAP, (s.percent - 75) / 25 * 0.4 + 0.25);
}

export const BLEED_CAP = 0.65;

// ── Zero-reading: what to do, as a picture ─────────────────────────────

export type Pictogram = 'pin' | 'streak' | 'map' | 'member' | 'coins' | 'xp' | 'chest' | 'coin' | 'queue' | 'trophy' | 'ride' | 'star';

export interface Requirement {
  readonly icon: Pictogram;
  /** The count to show beside the icon ("x25"), null for a single action. */
  readonly count: number | null;
  /** Plural unit for "3 more days!". */
  readonly unit: [string, string];
  /** Where the Go! button takes the player, null when there is nowhere to go. */
  readonly go: GoTarget | null;
  /** Streak-style stamps show one pip per step when the target is small. */
  readonly pips: boolean;
}

/**
 * Screens a Go! button may open. Every one opens with no params (tested in
 * stamp-book.test.cjs): `Park` needs a park id and must never be a target.
 */
export const GO_TARGETS = ['Explore', 'CoinShelf', 'Friends', 'SetCollection'] as const;
export type GoTarget = typeof GO_TARGETS[number];

export function requirement(s: Pick<BookStamp, 'metric' | 'target'>): Requirement {
  const m = s.metric;
  const n = s.target;
  const r = (icon: Pictogram, unit: [string, string], go: GoTarget | null, count: number | null = n, pips = false): Requirement =>
    ({ icon, count: count !== null && count > 1 ? count : null, unit, go, pips });
  if (m === 'prep_items_collected') return r('pin', ['find', 'finds'], 'Explore');
  if (m === 'wild_legendary_variants') return r('star', ['legendary find', 'legendary finds'], 'Explore');
  if (m === 'sets_completed') return r('chest', ['set', 'sets'], 'SetCollection');
  if (['longest_streak', 'current_streak', 'login_streak_7'].includes(m)) return r('streak', ['day', 'days'], 'Explore', n, n <= 14);
  if (m === 'parks_visited') return r('map', ['park', 'parks'], 'Explore');
  if (/^visited_/.test(m)) return r('map', ['visit', 'visits'], 'Explore', null);
  if (/^(park_shelf:|ride_passport_)/.test(m)) return r('ride', ['percent', 'percent'], 'CoinShelf', null);
  if (m === 'friends_count') return r('member', ['friend', 'friends'], 'Friends');
  if (/^(park_coins_|ride_coins_)/.test(m)) return r('coin', ['coin', 'coins'], 'CoinShelf');
  if (m === 'verified_lineplay_sessions') return r('queue', ['line', 'lines'], 'Explore', null);
  if (/^(trivia_|ride_boss)/.test(m)) return r('trophy', ['win', 'wins'], 'CoinShelf');
  if (m === 'night_show') return r('map', ['night', 'nights'], 'Explore', null);
  if (m === 'total_experience' || m === 'experience_level') return r('xp', ['XP', 'XP'], 'Explore');
  if (m === 'coins_earned' || m === 'coins_held') return r('coins', ['coin', 'coins'], 'Explore');
  return r('star', ['step', 'steps'], null, null);
}

/** A positive "how close" line for a locked card: "3 more days!", "11 more finds!". */
export function remainingLine(s: Pick<BookStamp, 'metric' | 'target' | 'progress' | 'earned' | 'secret'>): string {
  if (s.earned) return 'Stamped!';
  if (s.secret) return 'A secret. Keep playing!';
  const req = requirement(s);
  const left = Math.max(0, s.target - s.progress);
  if (req.unit[0] === 'percent') return left > 0 ? `${left}% to go!` : 'Almost there!';
  if (s.target <= 1 || left <= 0) return s.progress > 0 ? 'Almost there!' : "Let's go!";
  const fmt = left.toLocaleString('en-US');
  return `${fmt} more ${left === 1 ? req.unit[0] : req.unit[1]}!`;
}

/** VoiceOver line for a tile: state, progress and what to do. */
export function tileLabel(s: BookStamp): string {
  if (s.earned) return `${s.name}. Earned${s.claimable ? '. Rewards ready to claim' : ''}.`;
  if (s.secret) return 'Secret stamp. Keep playing to discover it.';
  const req = requirement(s);
  const prog = req.unit[0] === 'percent' ? `${Math.min(100, s.progress)} percent` : `${Math.min(s.progress, s.target)} of ${s.target}`;
  return `${s.name}. Locked. ${prog}. ${s.howTo}`;
}

export function hasRewards(r: StampRewards | null | undefined): boolean {
  return !!r && (r.energy > 0 || r.tickets > 0 || r.xp > 0 || r.coins > 0 || !!r.title);
}

/** Reward chips, in display order. */
/** Spoken reward list for the Claim button. */
export function rewardSpeech(r: StampRewards): string {
  return rewardChips(r).map(c => c.label.replace('+', 'plus ')).join(', ');
}

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

/** Passport postmark parts in the player's local time: { month: 'SEP', day: '30', year: '2026' }. */
export function postmark(iso: string | null): { month: string; day: string; year: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { month: MONTHS[date.getMonth()].toUpperCase(), day: String(date.getDate()), year: String(date.getFullYear()) };
}
