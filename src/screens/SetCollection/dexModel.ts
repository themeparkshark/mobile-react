/**
 * Collection book ("dex") view model. Pure, so it is unit tested in
 * tools/tests/hh3-dex.test.cjs.
 *
 * The book reads today's production endpoints (GET /me/prep-item-sets and
 * /me/prep-item-sets/{slug}) and, when the server has them, overlays the
 * Home Hunt v3 dex endpoints (GET /me/home-hunt/dex and /dex/{slug}, see
 * next-wave/home-hunt-v3/CONTRACT.md). Every v3 field is optional: a missing
 * or malformed field falls back to the legacy value, never throws.
 *
 * Rewards: each set has one "Finish the set" reward plus optional earlier
 * steps (the legacy starter / Trip Prep, or the authored 8 / 20 / 30 / 40
 * milestones). All of them become one DexReward shape with a claim route.
 */
import type {
  PrepItemSetDetailResponse, PrepItemSetItem, PrepItemSetListItem, SetMilestone, SetWearableChoice,
} from '../../api/endpoints/me/prep-item-sets';

export type DexSetStatus = 'active' | 'resting' | 'upcoming' | 'retired';
export type DexRewardStatus = 'locked' | 'claimable' | 'claimed' | 'pending';

/** How a reward is claimed. */
export type DexClaim =
  | { readonly kind: 'complete' }                       // POST /me/prep-item-sets/{slug}/claim
  | { readonly kind: 'starter' }                        // legacy POST .../claim-starter (with optional item_id)
  | { readonly kind: 'milestone'; readonly key: SetMilestone['key'] }; // POST .../milestones/{key}/claim

export interface DexReward {
  readonly id: string;
  readonly target: number;
  readonly status: DexRewardStatus;
  readonly energy: number;
  readonly tickets: number;
  readonly experience: number;
  /** Shark Coins (v3 sets add coins to the finish reward). */
  readonly coins: number;
  readonly title: string | null;
  readonly wearableName: string | null;
  /** "Finish the set: get 60 Energy, 3 Tickets and 400 XP" */
  readonly label: string;
  /** "60 Energy, 3 Tickets, 400 XP" without the lead-in. */
  readonly prize: string;
  readonly claim: DexClaim;
  /** A wearable pick is required before the claim is sent. */
  readonly needsPick: boolean;
  readonly choices: readonly SetWearableChoice[];
  /** The profile title tier for equipSetTitle. */
  readonly titleTier: 'starter' | 'complete';
}

export interface DexSet {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly color: string;
  readonly accent: string;
  readonly badgeUrl: string | null;
  readonly status: DexSetStatus;
  readonly spawningNow: boolean | null;
  readonly spawnHint: string | null;
  readonly found: number;
  readonly total: number;
  readonly caught: number;
  readonly spares: number;
  readonly isComplete: boolean;
  readonly focused: boolean;
  readonly startsAt: string | null;
  readonly sortOrder: number;
  /** The finish-the-set reward. */
  readonly reward: DexReward;
  /** Earlier rewards (starter, 8 / 20 / 30), in target order. */
  readonly steps: readonly DexReward[];
}

export interface DexItem {
  readonly id: number;
  readonly name: string;
  readonly flavor: string;
  readonly rarity: 1 | 2 | 3 | 4 | 5;
  readonly rarityLabel: string;
  readonly iconUrl: string | null;
  /** Legacy bundled art key (churro_01, flashlight_40...). */
  readonly variantSlug: string;
  readonly found: boolean;
  /** Caught on the map (not only swapped in). Null when unknown. */
  readonly foundInWorld: boolean | null;
  readonly caught: number;
  /** Extra copies of this item (shareable with a friend). */
  readonly spares: number;
  readonly spawnHint: string;
  readonly spawningNow: boolean | null;
  readonly exchangeCost: number;
  readonly canExchange: boolean;
  readonly isNew: boolean;
  /** Best Ride Photo grade for this item (rare catches), or null when it has none. */
  readonly photoGrade: PhotoGrade | null;
  /** A server-rendered Ride Photo, when the server sends one. */
  readonly photoUrl: string | null;
  /** Caught during Golden Hour (cosmetic gold card). */
  readonly goldenHour: boolean;
}

export type PhotoGrade = 'good' | 'great' | 'frame_it';

export const PHOTO_GRADE_LABEL: Readonly<Record<PhotoGrade, string>> = { good: 'Good', great: 'Great', frame_it: 'Frame It!' };

/** Accepts 'good' | 'great' | 'frame_it' and the spellings a server might send ('Frame It!', 'frame-it', 1..3). */
export function photoGradeOf(value: unknown): PhotoGrade | null {
  if (typeof value === 'number') return value >= 3 ? 'frame_it' : value === 2 ? 'great' : value === 1 ? 'good' : null;
  if (typeof value !== 'string') return null;
  const key = value.toLowerCase().replace(/[^a-z]/g, '');
  if (key === 'frameit' || key === 'perfect') return 'frame_it';
  if (key === 'great') return 'great';
  if (key === 'good') return 'good';
  return null;
}

/** Best grade, photo url and Golden Hour from any of the optional shapes (CONTRACT 3.2 best_photo: { quality, golden_hour }, or ride_photo: { grade, url }). */
export function ridePhotoOf(raw: Record<string, unknown> | null): { grade: PhotoGrade | null; url: string | null; goldenHour: boolean } {
  if (!raw) return { grade: null, url: null, goldenHour: false };
  const nested = record(raw.ride_photo) ?? record(raw.best_ride_photo) ?? record(raw.best_photo);
  const grade = photoGradeOf(nested?.quality) ?? photoGradeOf(raw.best_photo_grade) ?? photoGradeOf(raw.photo_grade)
    ?? photoGradeOf(nested?.grade) ?? photoGradeOf(nested?.best_grade);
  const url = str(nested?.url) ?? str(nested?.photo_url) ?? str(raw.best_photo_url) ?? str(raw.photo_url);
  return { grade, url: grade ? url : null, goldenHour: grade != null && nested?.golden_hour === true };
}

export interface DailyRare {
  readonly available: boolean;
  readonly onMap: boolean;
  readonly caughtToday: boolean;
  readonly resetsAt: string | null;
}

export interface DexBook {
  readonly sets: readonly DexSet[];
  /** Distinct finds and items across the live book (retired sets excluded). */
  readonly found: number;
  readonly total: number;
  readonly dailyRare: DailyRare | null;
}


const EM_DASH = new RegExp(String.fromCharCode(0x2014), 'g');
const RARITY_LABEL: Record<number, string> = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };
const RARITY_BY_KEY: Record<string, 1 | 2 | 3 | 4 | 5> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
const DEFAULT_COLOR = '#1d9bf0';
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_SPAWN_HINT = 'Pops up on the map near you, any time.';
/** A find this recent shows a NEW sticker. */
export const NEW_FOR_MS = 48 * 60 * 60 * 1000;

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const clean = value.replace(EM_DASH, ',').replace(/\s+/g, ' ').trim();
  return clean.length > 0 ? clean : null;
};
const color = (value: unknown, fallback: string): string => (typeof value === 'string' && HEX.test(value) ? value : fallback);
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function rarityOf(value: unknown): 1 | 2 | 3 | 4 | 5 {
  if (typeof value === 'string') return RARITY_BY_KEY[value.toLowerCase()] ?? 1;
  const n = Math.round(num(value, 1));
  return (n >= 1 && n <= 5 ? n : 1) as 1 | 2 | 3 | 4 | 5;
}
export const rarityLabel = (rarity: number): string => RARITY_LABEL[rarity] ?? 'Common';

/** "60 Energy, 3 Tickets, 400 XP and the Snack Boss title" */
export function prizeLine(parts: {
  energy?: number; tickets?: number; experience?: number; coins?: number; title?: string | null; wearableName?: string | null; pick?: boolean;
}): string {
  const list: string[] = [];
  if (num(parts.energy) > 0) list.push(`${parts.energy} Energy`);
  if (num(parts.tickets) > 0) list.push(`${parts.tickets} ${parts.tickets === 1 ? 'Ticket' : 'Tickets'}`);
  if (num(parts.experience) > 0) list.push(`${parts.experience} XP`);
  if (num(parts.coins) > 0) list.push(`${parts.coins} coins`);
  if (parts.wearableName) list.push(parts.wearableName);
  else if (parts.pick) list.push('a shark item you pick');
  if (parts.title) list.push(`the ${parts.title} title`);
  if (list.length === 0) return 'a surprise';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function finishLabel(prize: string): string {
  return `Finish the set: get ${prize}`;
}

export function stepLabel(target: number, prize: string): string {
  return `Find ${target}: get ${prize}`;
}

function legacyStatus(set: Pick<PrepItemSetListItem, 'is_complete' | 'rewards_claimed'>): DexRewardStatus {
  if (set.rewards_claimed) return 'claimed';
  return set.is_complete ? 'claimable' : 'locked';
}

function fromMilestone(milestone: SetMilestone, total: number, isFinal: boolean): DexReward {
  const choices = Array.isArray(milestone.wearable_choices) ? milestone.wearable_choices : [];
  const rewards = milestone.rewards ?? {};
  const target = Math.max(1, num(milestone.target, total));
  const prize = prizeLine({
    energy: rewards.energy, tickets: rewards.tickets, experience: rewards.experience, title: rewards.title ?? null,
    wearableName: rewards.wearable_name ?? null, pick: rewards.pick === true,
  });
  return {
    id: milestone.key,
    target,
    status: milestone.status ?? 'locked',
    energy: num(rewards.energy), tickets: num(rewards.tickets), experience: num(rewards.experience), coins: num((rewards as Record<string, unknown>).coins),
    title: str(rewards.title), wearableName: str(rewards.wearable_name),
    prize,
    label: isFinal ? finishLabel(prize) : stepLabel(target, prize),
    claim: { kind: 'milestone', key: milestone.key },
    needsPick: rewards.pick === true && choices.some(choice => !choice.owned),
    choices,
    titleTier: milestone.key === 'starter' ? 'starter' : 'complete',
  };
}

type LegacySetLike = Pick<PrepItemSetListItem, 'is_complete' | 'rewards_claimed' | 'starter_milestone' | 'completion_rewards' | 'milestones'>
  & { total_items: number };

/** Final reward plus earlier steps from a legacy list entry or detail. */
export function legacyRewards(set: LegacySetLike): { reward: DexReward; steps: DexReward[] } {
  const total = Math.max(1, num(set.total_items, 1));
  const milestones = Array.isArray(set.milestones) && set.milestones.length > 0 ? set.milestones.slice() : null;
  if (milestones) {
    milestones.sort((a, b) => num(a.target) - num(b.target));
    // The finish-the-set reward is the first milestone that needs every item, else the biggest one.
    const needsAll = milestones.findIndex(entry => num(entry.target) >= total);
    const finalAt = needsAll >= 0 ? needsAll : milestones.length - 1;
    const reward = fromMilestone(milestones[finalAt], total, true);
    const steps = milestones.filter((_, index) => index !== finalAt).map(entry => fromMilestone(entry, total, false));
    return { reward, steps };
  }
  const rewards = set.completion_rewards ?? { energy: 0, tickets: 0, experience: 0, title: null, badge_url: null };
  const prize = prizeLine({ energy: rewards.energy, tickets: rewards.tickets, experience: rewards.experience,
    coins: num((rewards as Record<string, unknown>).coins), title: rewards.title });
  const reward: DexReward = {
    id: 'complete', target: total, status: legacyStatus(set),
    energy: num(rewards.energy), tickets: num(rewards.tickets), experience: num(rewards.experience),
    coins: num((rewards as Record<string, unknown>).coins),
    title: str(rewards.title), wearableName: null, prize, label: finishLabel(prize),
    claim: { kind: 'complete' }, needsPick: false, choices: [], titleTier: 'complete',
  };
  const steps: DexReward[] = [];
  const starter = set.starter_milestone;
  if (starter) {
    const choices = Array.isArray(starter.wearable_choices) ? starter.wearable_choices : [];
    const pick = choices.some(choice => !choice.owned);
    const awarded = choices.find(choice => choice.id === starter.awarded_item_id)?.name ?? null;
    const starterPrize = prizeLine({
      energy: starter.rewards?.energy, tickets: starter.rewards?.tickets, experience: starter.rewards?.experience,
      title: starter.rewards?.title ?? null, wearableName: awarded, pick,
    });
    steps.push({
      id: 'starter', target: Math.max(1, num(starter.target, 8)),
      status: starter.rewards_claimed ? 'claimed' : starter.is_unlocked ? 'claimable' : 'locked',
      energy: num(starter.rewards?.energy), tickets: num(starter.rewards?.tickets), experience: num(starter.rewards?.experience), coins: 0,
      title: str(starter.rewards?.title), wearableName: awarded, prize: starterPrize,
      label: stepLabel(Math.max(1, num(starter.target, 8)), starterPrize),
      claim: { kind: 'starter' }, needsPick: !starter.rewards_claimed && pick, choices, titleTier: 'starter',
    });
  }
  return { reward, steps };
}

function legacyStatusOf(set: Pick<PrepItemSetListItem, 'availability' | 'is_in_rotation'> & { status?: unknown; is_retired?: unknown }): DexSetStatus {
  const explicit = typeof set.status === 'string' ? set.status : null;
  if (explicit === 'active' || explicit === 'resting' || explicit === 'upcoming' || explicit === 'retired') return explicit;
  if (set.is_retired === true) return 'retired';
  if (set.availability === 'upcoming') return 'upcoming';
  if (set.availability === 'archived' || (set.availability == null && set.is_in_rotation === false)) return 'retired';
  return 'active';
}

/** A set from GET /me/prep-item-sets (with any v3 fields it already carries). */
export function fromLegacySet(set: PrepItemSetListItem, index = 0): DexSet {
  const extra = set as unknown as Record<string, unknown>;
  const { reward, steps } = legacyRewards(set);
  const total = Math.max(0, num(set.total_items));
  const found = Math.max(0, Math.min(total || Infinity, num(set.collected_count)));
  return {
    slug: set.slug,
    name: str(set.name) ?? 'Collection',
    description: str(set.description) ?? '',
    color: color(extra.color, color(set.theme_config?.color, DEFAULT_COLOR)),
    accent: color(extra.accent_color, '#e9f6ff'),
    badgeUrl: str(extra.badge_url) ?? str(set.icon_url),
    status: legacyStatusOf(set as PrepItemSetListItem & { status?: unknown; is_retired?: unknown }),
    spawningNow: set.time_gate ? set.time_gate.is_spawning_now : null,
    spawnHint: str(set.time_gate?.description),
    found, total,
    caught: found,
    spares: Math.max(0, num(set.spare_count)),
    isComplete: set.is_complete === true || (total > 0 && found >= total),
    focused: set.is_focused === true,
    startsAt: str(set.starts_at),
    sortOrder: num(extra.sort_order, index + 1),
    reward, steps,
  };
}

const MILESTONE_KEYS = ['starter', 'explorer', 'complete', 'master', 'encore'];

/** The claim route named by a v3 claim_path, or null to keep the legacy route. */
export function claimFromPath(path: unknown): DexClaim | null {
  if (typeof path !== 'string') return null;
  const match = /^\/me\/prep-item-sets\/[a-z0-9_-]+\/(claim|claim-starter|milestones\/([a-z]+)\/claim)$/.exec(path);
  if (!match) return null;
  if (match[2]) return MILESTONE_KEYS.includes(match[2]) ? { kind: 'milestone', key: match[2] as SetMilestone['key'] } : null;
  return match[1] === 'claim-starter' ? { kind: 'starter' } : { kind: 'complete' };
}

/** Overlay one v3 dex set (GET /me/home-hunt/dex sets[]) onto the legacy set. Unknown fields keep the legacy value. */
export function overlayDexSet(base: DexSet, raw: unknown): DexSet {
  const dex = record(raw);
  if (!dex) return base;
  const progress = record(dex.progress);
  const rewardRaw = record(dex.reward);
  const statusRaw = typeof dex.status === 'string' ? dex.status : null;
  const status = statusRaw === 'active' || statusRaw === 'resting' || statusRaw === 'upcoming' || statusRaw === 'retired'
    ? statusRaw : base.status;
  const rewardStatus = typeof rewardRaw?.status === 'string' && ['locked', 'claimable', 'claimed', 'pending'].includes(rewardRaw.status)
    ? rewardRaw.status as DexRewardStatus : base.reward.status;
  // Keep the legacy reward shape (claim route, picks); refresh status and the server's own label.
  const serverLabel = str(rewardRaw?.label);
  const merged = {
    energy: num(rewardRaw?.energy, base.reward.energy), tickets: num(rewardRaw?.tickets, base.reward.tickets),
    experience: num(rewardRaw?.experience, base.reward.experience), coins: num(rewardRaw?.coins, base.reward.coins),
    title: rewardRaw && 'title' in rewardRaw ? str(rewardRaw.title) : base.reward.title,
  };
  const prize = prizeLine({ ...merged, wearableName: base.reward.wearableName, pick: base.reward.needsPick });
  const reward: DexReward = {
    ...base.reward, ...merged, status: rewardStatus, prize, label: serverLabel ?? finishLabel(prize),
    claim: claimFromPath(rewardRaw?.claim_path) ?? base.reward.claim,
  };
  const starterRaw = record(dex.starter);
  const steps = base.steps.map(step => {
    if (step.id !== 'starter' || !starterRaw) return step;
    const starterStatus = typeof starterRaw.status === 'string' && ['locked', 'claimable', 'claimed', 'pending'].includes(starterRaw.status)
      ? starterRaw.status as DexRewardStatus : step.status;
    return { ...step, status: starterStatus, label: str(starterRaw.label) ?? step.label,
      claim: claimFromPath(starterRaw.claim_path) ?? step.claim };
  });
  return {
    ...base,
    name: str(dex.name) ?? base.name,
    description: str(dex.description) ?? base.description,
    color: color(dex.color, base.color),
    accent: color(dex.accent_color, base.accent),
    badgeUrl: str(dex.badge_url) ?? base.badgeUrl,
    status,
    spawningNow: typeof dex.spawning_now === 'boolean' ? dex.spawning_now : base.spawningNow,
    spawnHint: str(dex.spawn_hint) ?? base.spawnHint,
    found: progress ? Math.max(0, num(progress.found, base.found)) : base.found,
    total: progress ? Math.max(0, num(progress.total, base.total)) : base.total,
    caught: progress ? Math.max(0, num(progress.caught, base.caught)) : base.caught,
    spares: progress ? Math.max(0, num(progress.spares, base.spares)) : base.spares,
    isComplete: progress && typeof progress.is_complete === 'boolean' ? progress.is_complete : base.isComplete,
    sortOrder: num(dex.sort_order, base.sortOrder),
    reward,
    steps,
  };
}

/** Merge the legacy list with an optional v3 dex payload, keyed by slug. */
export function buildBook(legacy: readonly PrepItemSetListItem[] | null | undefined, dex?: unknown): DexBook {
  const list = Array.isArray(legacy) ? legacy : [];
  const payload = record(dex);
  const dexSets = Array.isArray(payload?.sets) ? (payload!.sets as unknown[]) : [];
  const bySlug = new Map<string, unknown>();
  for (const entry of dexSets) {
    const slug = record(entry)?.slug;
    if (typeof slug === 'string') bySlug.set(slug, entry);
  }
  const sets = separateColors(orderSets(list.map((set, index) => overlayDexSet(fromLegacySet(set, index), bySlug.get(set.slug)))));
  const live = sets.filter(set => set.status !== 'retired');
  const rare = record(payload?.daily_rare);
  return {
    sets,
    found: live.reduce((sum, set) => sum + set.found, 0),
    total: live.reduce((sum, set) => sum + set.total, 0),
    dailyRare: rare ? {
      available: rare.available === true, onMap: rare.on_map === true, caughtToday: rare.caught_today === true,
      resetsAt: str(rare.resets_at),
    } : null,
  };
}

function hueOf(hex: string): number | null {
  const match = HEX.exec(hex) ? hex.slice(1) : null;
  if (!match) return null;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(match.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  if (max - min < 0.08) return null; // grey: no hue clash
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

/** True when two set colors would read as the same family side by side (hues within 28 degrees). */
export function similarColor(a: string, b: string): boolean {
  const ha = hueOf(a); const hb = hueOf(b);
  if (ha == null || hb == null) return false;
  const diff = Math.abs(ha - hb);
  return Math.min(diff, 360 - diff) < 28;
}

/** Keep the order, but never put two same-family colors next to each other inside one status group when a swap fixes it. */
export function separateColors(sets: readonly DexSet[]): DexSet[] {
  const out = sets.slice();
  for (let i = 1; i < out.length; i += 1) {
    if (!similarColor(out[i - 1].color, out[i].color)) continue;
    const swap = out.findIndex((set, j) => j > i && set.status === out[i].status
      && !similarColor(out[i - 1].color, set.color) && (j + 1 >= out.length || !similarColor(out[i].color, out[j + 1]?.color ?? '')));
    if (swap > i) [out[i], out[swap]] = [out[swap], out[i]];
  }
  return out;
}

const STATUS_ORDER: Record<DexSetStatus, number> = { active: 0, resting: 1, upcoming: 2, retired: 3 };

/** Live sets first (stable order, so cards never jump after a claim), then resting, upcoming, and old sets last. Retired sets with nothing found are hidden. */
export function orderSets(sets: readonly DexSet[]): DexSet[] {
  return sets
    .filter(set => set.status !== 'retired' || set.found > 0)
    .map((set, index) => ({ set, index }))
    .sort((a, b) => STATUS_ORDER[a.set.status] - STATUS_ORDER[b.set.status]
      || a.set.sortOrder - b.set.sortOrder || a.index - b.index)
    .map(entry => entry.set);
}

export function hasClaimable(set: DexSet): boolean {
  return set.reward.status === 'claimable' || set.steps.some(step => step.status === 'claimable');
}

/** Which set the book opens on: the linked slug, a set with a reward to claim, the focused set, then the first live set. */
export function initialSlug(sets: readonly DexSet[], linked?: string | null): string | null {
  if (linked && sets.some(set => set.slug === linked)) return linked;
  return sets.find(hasClaimable)?.slug
    ?? sets.find(set => set.focused)?.slug
    ?? sets.find(set => set.status === 'active' && !set.isComplete)?.slug
    ?? sets[0]?.slug ?? null;
}

export function progressFraction(set: Pick<DexSet, 'found' | 'total'>): number {
  return set.total > 0 ? Math.max(0, Math.min(1, set.found / set.total)) : 0;
}



/** The set card pill, only when it says something: the special timing ("Sunset to 9 PM", "Oct 1 to Nov 2") with a live dot when it is on, "After sunset", "Opens Oct 15", "Saved". Null for an always-on set. */
export function tabStatus(set: DexSet, now: Date = new Date()): { readonly text: string; readonly live: boolean } | null {
  if (set.status === 'retired') return { text: 'Saved', live: false };
  if (set.status === 'upcoming') {
    const start = set.startsAt ? new Date(set.startsAt) : null;
    const text = start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime()
      ? `Opens ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Soon';
    return { text, live: false };
  }
  if (set.spawningNow === false || set.status === 'resting') return { text: set.spawnHint ?? 'Resting', live: false };
  if (set.spawnHint) return { text: set.spawnHint, live: true };
  return null;
}

/** An icon for a spawn hint: night and evening get the star, clock windows the timer, weather the sparkle, anytime the map. */
export function spawnIcon(hint: string | null | undefined): 'star' | 'timer' | 'sparkle' | 'map' {
  const text = (hint ?? '').toLowerCase();
  if (/sunset|night|evening|dark|moon/.test(text)) return 'star';
  if (/rain|hot|cold|snow|wind|weather|sunny/.test(text)) return 'sparkle';
  if (/\d|am\b|pm\b|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep/.test(text)) return 'timer';
  return 'map';
}

const GENERIC_HINT = /^(anytime,? anywhere\.?|pops up on the map near you, any time\.?)$/i;

/**
 * A Rare-or-better find with no special window still needs a reason to hunt:
 * say how rare it is (the CONTRACT 3.4 tier odds) instead of "Anytime, anywhere".
 */
export function rarityHint(hint: string, rarity: number): string {
  if (!GENERIC_HINT.test(hint.trim())) return hint;
  if (rarity >= 5) return 'Super rare! Watch for the daily rare';
  if (rarity === 4) return 'Very rare: about 1 in 25 finds';
  if (rarity === 3) return 'Rare: about 1 in 8 finds';
  return hint;
}

function legacyHint(item: PrepItemSetItem, setHint: string | null): string {
  const gate = str(item.gate?.explainer);
  if (gate) return gate;
  const anyHint = str((item as unknown as Record<string, unknown>).hint);
  if (anyHint) return anyHint;
  return setHint ?? DEFAULT_SPAWN_HINT;
}

/** Items from the legacy detail, in set order, with the v3 item fields overlaid by id when present. */
export function buildItems(
  detail: Pick<PrepItemSetDetailResponse['data'], 'items' | 'progress'> & { set?: { time_gate?: { description?: string } | null } },
  dexItems?: unknown,
  now: number = Date.now(),
): DexItem[] {
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const progress = detail?.progress;
  const spares = Math.max(0, num(progress?.spare_count));
  const costs = record(progress?.exchange_costs) ?? {};
  const fallbackCost = Math.max(1, num(progress?.exchange_cost, 4));
  const setHint = str(detail?.set?.time_gate?.description);
  const overlay = new Map<number, Record<string, unknown>>();
  if (Array.isArray(dexItems)) {
    for (const entry of dexItems) {
      const raw = record(entry);
      if (raw && typeof raw.id === 'number') overlay.set(raw.id, raw);
    }
  }
  return items.map(item => {
    const dex = overlay.get(item.id) ?? null;
    const rarity = rarityOf(dex?.rarity ?? item.rarity);
    const found = typeof dex?.is_found === 'boolean' ? dex.is_found : item.is_collected === true;
    const copies = Math.max(0, num(dex?.copies, num(item.quantity_collected)));
    const caught = Math.max(found ? 1 : 0, num(dex?.caught_count, copies));
    const itemCost = num(dex?.exchange_cost, num(item.exchange_cost, num(costs[String(rarity)], fallbackCost)));
    const cost = itemCost > 0 ? itemCost : fallbackCost;
    const firstFound = str(dex?.first_found_at) ?? str(item.first_collected_at);
    const firstMs = firstFound ? Date.parse(firstFound) : Number.NaN;
    const dexPhoto = ridePhotoOf(dex);
    const photo = !found ? { grade: null, url: null, goldenHour: false }
      : dexPhoto.grade ? dexPhoto : ridePhotoOf(item as unknown as Record<string, unknown>);
    return {
      id: item.id,
      name: str(dex?.name) ?? str(item.name) ?? 'Mystery find',
      flavor: str(dex?.flavor) ?? str(item.description) ?? '',
      rarity,
      rarityLabel: rarityLabel(rarity),
      iconUrl: str(dex?.icon_url) ?? str(item.icon_url),
      variantSlug: typeof item.variant_slug === 'string' ? item.variant_slug : '',
      found,
      foundInWorld: typeof dex?.found_in_world === 'boolean' ? dex.found_in_world
        : typeof item.found_in_world === 'boolean' ? item.found_in_world : null,
      caught,
      spares: Math.max(0, num(dex?.spares, copies - 1)),
      spawnHint: rarityHint(str(dex?.spawn_hint) ?? legacyHint(item, setHint), rarity),
      spawningNow: typeof dex?.spawning_now === 'boolean' ? dex.spawning_now : null,
      exchangeCost: cost,
      canExchange: typeof dex?.can_exchange === 'boolean' ? dex.can_exchange : !found && spares >= cost,
      isNew: found && Number.isFinite(firstMs) && now - firstMs >= 0 && now - firstMs < NEW_FOR_MS,
      photoGrade: photo.grade,
      photoUrl: photo.url,
      goldenHour: photo.goldenHour,
    };
  });
}


/** The item card's catch line. */
export function caughtLine(item: DexItem): string {
  if (!item.found) return 'Not caught yet';
  if (item.foundInWorld === false) return 'Swapped in. Catch one on the map too!';
  return item.caught === 1 ? 'Caught 1 time' : `Caught ${item.caught} times`;
}



/** Spare progress toward swapping in one missing item. */
export function swapProgress(item: Pick<DexItem, 'found' | 'exchangeCost' | 'canExchange'>, spares: number): {
  readonly have: number; readonly need: number; readonly ready: boolean;
} {
  const need = Math.max(1, item.exchangeCost);
  const have = Math.max(0, Math.min(need, spares));
  return { have, need, ready: !item.found && (item.canExchange || spares >= need) };
}

/** Reuse the previous object when an item did not change, so memoized tiles skip the re-render. */
export function mergeStable<T extends { readonly id: number }>(previous: readonly T[] | null | undefined, next: readonly T[]): T[] {
  if (!previous || previous.length === 0) return next.slice();
  const old = new Map(previous.map(item => [item.id, item]));
  return next.map(item => {
    const before = old.get(item.id);
    if (!before) return item;
    const keys = Object.keys(item) as (keyof T)[];
    return keys.every(key => before[key] === item[key]) && Object.keys(before).length === keys.length ? before : item;
  });
}

/** A set needs a fast refresh only while its window can open or close (a timed set). Others refresh on focus or every 5 minutes. */
export function refreshEveryMs(set: Pick<DexSet, 'spawnHint' | 'spawningNow' | 'status'> | null | undefined): number {
  if (!set) return 5 * 60_000;
  return set.status !== 'retired' && set.spawnHint && set.spawningNow !== null ? 60_000 : 5 * 60_000;
}

export interface TrackNode {
  readonly reward: DexReward;
  /** 0..1 position on the set track. */
  readonly at: number;
  readonly final: boolean;
}

/** Reward nodes on one track: each earlier step at its target, the finish reward at the end. */
export function rewardTrack(set: Pick<DexSet, 'total' | 'reward' | 'steps'>): TrackNode[] {
  const total = Math.max(1, set.total);
  const steps = set.steps.filter(step => step.target < total)
    .map(step => ({ reward: step, at: Math.max(0.08, Math.min(0.92, step.target / total)), final: false }));
  return [...steps.sort((a, b) => a.at - b.at), { reward: set.reward, at: 1, final: true }];
}

/** Prize chips for a reward: the icons the banner, track and reveal all use. */
export function prizeChips(reward: Pick<DexReward, 'energy' | 'tickets' | 'experience' | 'coins' | 'wearableName' | 'title'>): {
  readonly icon: 'energy' | 'ticket' | 'xp' | 'coins' | 'shark' | 'crown'; readonly value: string; readonly label: string;
}[] {
  const list: { icon: 'energy' | 'ticket' | 'xp' | 'coins' | 'shark' | 'crown'; value: string; label: string }[] = [];
  if (reward.energy > 0) list.push({ icon: 'energy', value: `+${reward.energy}`, label: `${reward.energy} Energy` });
  if (reward.tickets > 0) list.push({ icon: 'ticket', value: `+${reward.tickets}`, label: `${reward.tickets} ${reward.tickets === 1 ? 'Ticket' : 'Tickets'}` });
  if (reward.experience > 0) list.push({ icon: 'xp', value: `+${reward.experience}`, label: `${reward.experience} XP` });
  if (reward.coins > 0) list.push({ icon: 'coins', value: `+${reward.coins}`, label: `${reward.coins} coins` });
  if (reward.wearableName) list.push({ icon: 'shark', value: reward.wearableName, label: reward.wearableName });
  if (reward.title) list.push({ icon: 'crown', value: reward.title, label: `the ${reward.title} title` });
  return list;
}

/** The spare meter goal: the cheapest swap among missing items (or the set cost), and how far along the player is. */
export function swapGoal(items: readonly Pick<DexItem, 'found' | 'exchangeCost'>[], spares: number, fallback = 4): {
  readonly cost: number; readonly have: number; readonly extra: number; readonly ready: boolean; readonly anyMissing: boolean;
} {
  const missing = items.filter(item => !item.found);
  const cost = Math.max(1, missing.length ? Math.min(...missing.map(item => item.exchangeCost || fallback)) : fallback);
  const have = Math.max(0, Math.min(cost, spares));
  return { cost, have, extra: Math.max(0, spares - cost), ready: missing.length > 0 && spares >= cost, anyMissing: missing.length > 0 };
}
