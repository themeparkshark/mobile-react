/**
 * The home guide's one next thing (fix pass w4, T007). At home the card always names one true thing this
 * player can do right now, built from what they really have: a coin ready to level up, a reward waiting,
 * a Daily 3 goal they can finish at home, a treat for the Ticket meter, a limited coin to plan before it
 * leaves, Ride Parts for a coin's next level, a practice game, or the next park day. One at a time (never a
 * list) and never "nothing to do": when one is done, the card moves on to the next.
 *
 * Pure (no React, no network), unit tested in tools/tests/fix-w4-home.test.cjs. A null input means "not
 * on for this player" (its switch is off, its rung is closed or its read has not answered), and is skipped.
 */
import { guideCardCopy, leavesLine, type GuideAction, type GuideCardCopy } from './guideCopy';
import { goalGo, homeSideGoal, type GoalGo, type RewardsRowKey } from '../retention/rewardsModel';

/** Home-only card buttons (the shared GuideAction covers the rest). */
export type HomeAction = GuideAction | 'rewards' | 'find' | 'practice' | 'closet' | 'friends' | 'coin_shelf' | 'coin' | 'limited';

/** Which picture the card wears for the step (existing art only). */
export type HomeArt = 'coin' | 'ticket' | 'chest' | 'level_chest' | 'weekly' | 'trail' | 'stamps' | 'events' | 'treat' | 'flame' | 'play';

export type HomeStepKey = 'level_up' | 'reward' | 'daily3' | 'treat' | 'limited' | 'parts' | 'plan' | 'practice' | 'park_day' | 'welcome_back';

export interface HomeCoinRef {
  readonly name: string;
  readonly coinUrl: string | null;
  readonly assetId: number | null;
  readonly parkId: number | null;
}

export interface HomeNextInput {
  /** A coin with the Ride Parts and Energy to level up now (after coin levels unlock). */
  readonly levelUp: HomeCoinRef | null;
  /** The first Rewards row with something ready to open or claim (the Rewards sheet's own order). */
  readonly readyReward: { readonly key: RewardsRowKey; readonly title: string; readonly line: string } | null;
  /** Today's Daily 3, once it is on for this player. */
  readonly daily3: {
    readonly goals: readonly { readonly kind: string; readonly park: boolean; readonly target: number; readonly progress: number;
      readonly done: boolean; readonly title: string; readonly hint: string }[];
    readonly done: number;
    readonly total: number;
  } | null;
  /** Treats on the home map now, and the meter (null: no meter read yet; capped: today's home Tickets are used up). */
  readonly treats: { readonly onMap: number; readonly toTicket: number | null; readonly capped: boolean };
  /** A limited coin in rotation at the next park, not on the shelf yet, with its last day. */
  readonly limited: (HomeCoinRef & { readonly leavesOn: string }) | null;
  /** How many limited coins are in rotation at the next park and not on the shelf (the card says a count, never one name). */
  readonly limitedCount?: number;
  /** The owned coin closest to its next level that still needs Ride Parts (they come from waiting in its line). */
  readonly parts: (HomeCoinRef & { readonly partsToGo: number; readonly levelName: string | null }) | null;
  /** Practice games are open for this player (from the first coin won or the 2nd home visit). */
  readonly practice: boolean;
  /** The next park day: its park, the Tickets ready, the player's own pick, and the home jar (arcade server only). */
  readonly park: { readonly parkName: string | null; readonly tickets: number; readonly plan: HomeCoinRef | null;
    readonly jar?: { readonly held: number; readonly cap: number; readonly full: boolean } | null };
  /** The player has won a coin: a veteran plans the park day before the treats. */
  readonly veteran?: boolean;
  /** Away 14 days or more: the welcome back card leads. */
  readonly welcomeBack: boolean;
}

export interface HomeStep {
  readonly key: HomeStepKey;
  readonly copy: GuideCardCopy;
  readonly action: HomeAction | null;
  readonly art: HomeArt;
  /** The coin the step is about (its art on the card, and where its button goes). */
  readonly coin: HomeCoinRef | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const tickets = (n: number) => plural(Math.max(0, n), 'Ticket', 'Tickets');

/** The Rewards row's picture on the card (the same art the Rewards sheet draws for it). */
const REWARD_ART: Record<RewardsRowKey, HomeArt> = {
  daily_chest: 'chest', daily3: 'chest', level_chest: 'level_chest', weekly_box: 'weekly', trail: 'trail', stamps: 'stamps', events: 'events',
};

/** Where a Daily 3 goal's GO goes from the home card (never a park). */
const GOAL_ACTION: Record<Exclude<GoalGo, null>, HomeAction | null> = {
  chest: 'rewards', closet: 'closet', friends: 'friends', shelf: 'coin_shelf', snack: 'find', ride: null,
};

function card(kicker: string, title: string, line: string | null, button: { label: string; action: HomeAction } | null): GuideCardCopy {
  const a11y = [kicker, title, line, button ? `Button: ${button.label}` : null].filter(Boolean).map(String)
    .reduce((all, part) => (all ? `${all}${/[.!?]$/.test(all) ? '' : '.'} ${part}` : part), '');
  return { kicker, title, line, button: button as GuideCardCopy['button'], secondary: null, dots: null, pointsAtPlay: false, a11y };
}

/** The meter in words: "2 more treats = 1 Ticket". */
export function treatMeterLine(toTicket: number | null): string | null {
  if (toTicket == null || !Number.isFinite(toTicket)) return null;
  const n = Math.max(1, Math.min(3, Math.round(toTicket)));
  return `${plural(n, 'more treat', 'more treats')} = 1 Ticket`;
}

/** The first Daily 3 goal a player at home can work on now, with its button, or null. */
export function homeDaily3Goal(d: HomeNextInput['daily3'], treatsOnMap: number):
  { readonly title: string; readonly line: string; readonly action: HomeAction } | null {
  if (!d) return null;
  for (const sent of d.goals) {
    if (sent.done) continue;
    const goal = homeSideGoal(sent, false);
    if (goal.parkOnly) continue;
    const go = goalGo(goal, false);
    // "Pick your next coin" is done on the next park day's shelf picker (PLAN), the place that counts it.
    const action = goal.kind === 'plan' ? 'plan' : go ? GOAL_ACTION[go] : null;
    if (!action) continue;
    // A treat goal with no treat on the map yet would be a dead FIND: the next goal leads instead.
    if (action === 'find' && treatsOnMap <= 0) continue;
    const left = Math.max(0, goal.target - goal.progress);
    const count = goal.target > 1 && left > 0 ? `${goal.progress} of ${goal.target}` : null;
    return { title: goal.title, line: [`${d.done} of ${d.total} done`, count ? `This one: ${count}` : null].filter(Boolean).join(' · '), action };
  }
  return null;
}

/** The one next thing at home. Pure: same input, same card. */
export function homeNextStep(i: HomeNextInput): HomeStep {
  const park = i.park.parkName;
  const meter = i.treats.capped ? null : treatMeterLine(i.treats.toTicket);
  // "12 Tickets in your jar" on the arcade server (home Tickets wait in a jar of 20), else the Tickets ready.
  const jar = i.park.jar && Number.isFinite(i.park.jar.held) ? i.park.jar : null;
  const parkDayTitle = () => jar ? `${tickets(jar.held)} in your jar${jar.full ? ' (full!)' : ''}`
    : park ? `${park}: ${tickets(i.park.tickets)} ready` : `${tickets(i.park.tickets)} ready`;
  // The planned coin, else the Tickets, picture the park day cards.
  const planArt = (coin: HomeCoinRef | null): { art: HomeArt; coin: HomeCoinRef | null } =>
    coin?.coinUrl ? { art: 'coin', coin } : { art: 'ticket', coin };

  if (i.welcomeBack) {
    const copy = guideCardCopy('welcome_back', null, { parkName: park, ridesResting: false, allOwned: false, tickets: i.park.tickets,
      freeStep: null, queueTicketsOn: false, adventureDots: null });
    return { key: 'welcome_back', copy, action: copy.button?.action ?? 'plan', ...planArt(i.park.plan) };
  }

  // 1. A coin that can level up now: the biggest thing tonight.
  if (i.levelUp) {
    return { key: 'level_up', action: 'level_up', art: i.levelUp.coinUrl ? 'coin' : 'ticket', coin: i.levelUp,
      copy: card('READY TO LEVEL UP', `Level up ${i.levelUp.name}!`, 'Ride Parts and Energy ready', { label: 'LEVEL UP', action: 'level_up' }) };
  }

  // 2. Something waiting to open or claim (a chest, a Trail Box, stamp prizes): one tap opens Rewards on it.
  if (i.readyReward) {
    const r = i.readyReward;
    return { key: 'reward', action: 'rewards', art: REWARD_ART[r.key] ?? 'chest', coin: null,
      copy: card('READY FOR YOU', r.title, r.line, { label: 'OPEN', action: 'rewards' }) };
  }

  // 3. A Daily 3 goal that can be done right here at home.
  const goal = homeDaily3Goal(i.daily3, i.treats.onMap);
  if (goal) {
    return { key: 'daily3', action: goal.action, art: 'flame', coin: null,
      copy: card('DAILY 3', goal.title, goal.line, { label: 'GO', action: goal.action }) };
  }

  // 4. Limited coins at the next park: a count, never one coin's name (Dustin, Nov 20: no coin is more important than
  // another). SEE opens that park's Limited tab, where every one shows the same way.
  const planned = i.park.plan;
  const limitedCount = Math.max(0, Math.floor(i.limitedCount ?? (i.limited ? 1 : 0)));
  const leaves = i.limited ? leavesLine(i.limited.leavesOn) : null;
  if (i.limited && leaves && limitedCount > 0 && planned?.assetId !== i.limited.assetId) {
    const where = park ? ` at ${park}` : '';
    return { key: 'limited', action: 'limited', art: 'ticket', coin: { ...i.limited, name: '', coinUrl: null, assetId: null },
      copy: card('LIMITED COINS', `${plural(limitedCount, 'limited coin', 'limited coins')}${where}`,
        'Here for a short time. Pick any one you like', { label: 'SEE', action: 'limited' }) };
  }

  // 5. No coin planned yet: pick one (PLAN opens the picker on the shelf). Treats never run out at home, so a player
  // with coins plans the park day before the treats; a brand new player's first goal is the treats and their meter.
  const planStep = (): HomeStep => ({ key: 'plan', action: 'plan', art: 'ticket', coin: null,
    copy: card('NEXT PARK DAY', parkDayTitle(), 'Pick any coin on your shelf', { label: 'PLAN', action: 'plan' }) });
  if (!planned && i.veteran) return planStep();

  // 6. A treat on the map while the Ticket meter still fills today.
  if (i.treats.onMap > 0 && meter) {
    return { key: 'treat', action: 'find', art: 'treat', coin: null,
      copy: card('TONIGHT', 'Find a treat near you', meter, { label: 'FIND', action: 'find' }) };
  }
  if (!planned) return planStep();

  // 7. Ride Parts grow coins: any ride's line does it, so the card names no coin (Dustin, Nov 20).
  if (i.parts && i.parts.partsToGo > 0) {
    return { key: 'parts', action: 'coin_shelf', art: 'ticket', coin: null,
      copy: card('GET RIDE PARTS', 'Grow your coins', 'Wait in any ride\'s line to grow its coin', { label: 'SHELF', action: 'coin_shelf' }) };
  }

  // 8. Something to play sitting still, with the park day it warms up for.
  if (i.practice) {
    return { key: 'practice', action: 'practice', art: 'play', coin: null,
      copy: card('PLAY ANYWHERE', 'Play a practice game', park ? `Just for fun. ${tickets(i.park.tickets)} ready for ${park}` : 'Just for fun',
        { label: 'PLAY', action: 'practice' }) };
  }

  // 9. The next park day: the jar (or the Tickets ready), the treat meter, and the player's own pick.
  return { key: 'park_day', action: 'plan', ...planArt(planned),
    copy: card('NEXT PARK DAY', parkDayTitle(), [meter, `Your pick: ${planned.name}`].filter(Boolean).join('. '),
      { label: 'PLAN', action: 'plan' }) };
}

/** The arcade server's home jar on the player answer ({held, cap, full}), or null on today's server. */
export function homeJarOf(player: unknown): { readonly held: number; readonly cap: number; readonly full: boolean } | null {
  const jar = (player as { home_jar?: { held?: unknown; cap?: unknown; full?: unknown } } | null)?.home_jar;
  if (!jar || typeof jar.held !== 'number' || !Number.isFinite(jar.held)) return null;
  const cap = typeof jar.cap === 'number' && Number.isFinite(jar.cap) ? jar.cap : 20;
  return { held: Math.max(0, Math.floor(jar.held)), cap, full: jar.full === true || jar.held >= cap };
}

/** How many limited coins are in rotation here with a last day and not on the player's shelf. */
export function homeLimitedCount<T extends { readonly asset_id?: number;
  readonly limited?: { readonly active: boolean; readonly ends_on?: string | null } | null }>(tasks: readonly T[], ownedAssetIds: ReadonlySet<number>): number {
  return tasks.filter(t => t.limited?.active && /^\d{4}-\d{2}-\d{2}$/.test(String(t.limited.ends_on ?? ''))
    && !(t.asset_id != null && ownedAssetIds.has(Number(t.asset_id)))).length;
}

/**
 * A limited coin in rotation (its last day feeds the card's "here for a short time"): not on the player's shelf,
 * soonest to leave first (then by name). The card never shows its name. Null when there is none.
 */
export function homeLimitedCoin<T extends { readonly name: string; readonly asset_id?: number; readonly coin_url?: string | null;
  readonly limited?: { readonly active: boolean; readonly ends_on?: string | null } | null }>(
  tasks: readonly T[], ownedAssetIds: ReadonlySet<number>, parkId: number | null): (HomeCoinRef & { readonly leavesOn: string }) | null {
  const open = tasks.filter(t => t.limited?.active && /^\d{4}-\d{2}-\d{2}$/.test(String(t.limited.ends_on ?? ''))
    && !(t.asset_id != null && ownedAssetIds.has(Number(t.asset_id))));
  if (!open.length) return null;
  const first = [...open].sort((a, b) => String(a.limited?.ends_on).localeCompare(String(b.limited?.ends_on)) || a.name.localeCompare(b.name))[0];
  return { name: first.name, coinUrl: first.coin_url || null, assetId: first.asset_id != null ? Number(first.asset_id) : null,
    parkId, leavesOn: String(first.limited?.ends_on) };
}

/**
 * The owned coin closest to its next level that still needs Ride Parts (fewest Parts to go, then by name).
 * Null when every coin is maxed or ready to level up now (the level-up step names that one).
 */
export function homePartsCoin<T extends { readonly ride_name: string; readonly id: number; readonly coin_url?: string | null;
  readonly park_id?: number | null; readonly is_unlocked: boolean; readonly current_level: number; readonly max_level: number;
  readonly available_parts?: number; readonly parts_to_next_level: number; readonly next_tier_name?: string | null }>(
  coins: readonly T[]): (HomeCoinRef & { readonly partsToGo: number; readonly levelName: string | null }) | null {
  const open = coins.map(c => ({ c, toGo: c.parts_to_next_level - (c.available_parts ?? 0) }))
    .filter(({ c, toGo }) => c.park_id != null && c.is_unlocked && c.current_level < c.max_level && toGo > 0);
  if (!open.length) return null;
  const best = open.sort((a, b) => a.toGo - b.toGo || String(a.c.ride_name).localeCompare(String(b.c.ride_name)))[0];
  return { name: best.c.ride_name, coinUrl: best.c.coin_url || null, assetId: best.c.id, parkId: best.c.park_id ?? null,
    partsToGo: best.toGo, levelName: best.c.next_tier_name || null };
}
