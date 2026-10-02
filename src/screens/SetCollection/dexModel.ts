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

export interface DexBook {
  readonly sets: readonly DexSet[];
}

export interface DexPage {
  readonly set: DexSet;
  readonly items: readonly DexItem[];
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
  const dexSets = Array.isArray(record(dex)?.sets) ? (record(dex)!.sets as unknown[]) : [];
  const bySlug = new Map<string, unknown>();
  for (const entry of dexSets) {
    const slug = record(entry)?.slug;
    if (typeof slug === 'string') bySlug.set(slug, entry);
  }
  const sets = list.map((set, index) => overlayDexSet(fromLegacySet(set, index), bySlug.get(set.slug)));
  return { sets: orderSets(sets) };
}

const STATUS_ORDER: Record<DexSetStatus, number> = { active: 0, resting: 1, upcoming: 2, retired: 3 };

/** Live sets first (claimable rewards lead), then resting, upcoming, and old sets last. Retired sets with nothing found are hidden. */
export function orderSets(sets: readonly DexSet[]): DexSet[] {
  return sets
    .filter(set => set.status !== 'retired' || set.found > 0)
    .map((set, index) => ({ set, index }))
    .sort((a, b) => STATUS_ORDER[a.set.status] - STATUS_ORDER[b.set.status]
      || Number(hasClaimable(b.set)) - Number(hasClaimable(a.set))
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

/** The single next step worth showing: one to claim, else the next locked one. Null when none. */
export function nextStep(set: DexSet): DexReward | null {
  return set.steps.find(step => step.status === 'claimable')
    ?? set.steps.find(step => step.status === 'locked')
    ?? null;
}

/** A small status chip for the set: "On now", "Back after sunset", "Opens October 15", "Retired". */
export function setStatusLine(set: DexSet, now: Date = new Date()): string | null {
  if (set.status === 'retired') return 'Old set: your finds are saved';
  if (set.status === 'upcoming') {
    const start = set.startsAt ? new Date(set.startsAt) : null;
    if (start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) {
      return `Opens ${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    }
    return 'Coming soon';
  }
  if (set.spawningNow === true) return set.spawnHint ? `On now: ${set.spawnHint}` : 'On the map now';
  if (set.spawningNow === false) return set.spawnHint ? `Resting: ${set.spawnHint}` : 'Resting right now';
  return set.spawnHint;
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
      spawnHint: str(dex?.spawn_hint) ?? legacyHint(item, setHint),
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

/** Tile copy: caught count for a find, the rarity for a silhouette. */
export function tileCaption(item: DexItem): string {
  if (!item.found) return item.rarityLabel;
  return item.caught > 1 ? `x${item.caught}` : 'Caught';
}

/** The item card's catch line. */
export function caughtLine(item: DexItem): string {
  if (!item.found) return 'Not caught yet';
  if (item.foundInWorld === false) return 'Swapped in. Catch one on the map too!';
  return item.caught === 1 ? 'Caught 1 time' : `Caught ${item.caught} times`;
}

/** Exchange button copy for a missing item. */
export function exchangeLine(item: DexItem, spares: number): string {
  if (item.found) return '';
  if (spares >= item.exchangeCost) return `Swap ${item.exchangeCost} spares for it`;
  const need = item.exchangeCost - spares;
  return `${need} more ${need === 1 ? 'spare' : 'spares'} to swap for it`;
}

/** Spare copies in a set, in kid words. */
export function sparesLine(spares: number): string {
  return spares === 1 ? '1 spare' : `${spares} spares`;
}
