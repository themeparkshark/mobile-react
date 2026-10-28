/**
 * The Next Coin guide (core loop blueprint 4.1, October 2026): one card, one target.
 *
 * "What do I do?" gets one answer on every map screen: one coin, how far it
 * is, and a dotted path to it. This file is the shared contract behind that
 * card. It is owned by the guide-map lane; every other lane imports it and
 * never edits it.
 *
 * - pickNextCoin(input) is pure: the target order 1 to 11 of blueprint 4.1,
 *   with honest live status and a sticky target.
 * - guideState(input, target) is pure: which of the 13 card states shows.
 * - liveAnswers(memo, live, now) is pure: turns the server's live feed into
 *   open / closed / unknown per coin, where a known-closed ride stays closed
 *   until a fresh answer says it is open.
 * - guide is the one owner of the pointer. Every "go here" in the app calls
 *   guide.setTarget(taskId, source): the shelf's "Make this my next coin",
 *   the Coin Guide rows, Wait Times, Daily 3 GO, the Adventure Ticket, the win
 *   card's NEXT COIN and a tapped coin callout.
 *
 * No React and no network here, so it runs in plain node tests.
 */
import { nextFreeTicket, type FreeTicketsInput } from './freeTickets';

export type GuideState = 'arrive' | 'walk' | 'here' | 'line_story' | 'in_line' | 'claim'
  | 'free_try' | 'extra_try' | 'need_ticket' | 'level_up' | 'resting' | 'welcome_back' | 'home';

export type CoinKind = 'ride' | 'sight';

/** What the live feed says about one coin right now. Sights are always open. */
export type LiveAnswer = 'open' | 'closed' | 'unknown';

export interface GuidePoint {
  readonly latitude: number;
  readonly longitude: number;
}

/** One coin the guide may point at. Callers map their TaskType rows into this. */
export interface GuideCoin {
  readonly taskId: number;
  readonly parkId: number;
  readonly name: string;
  readonly kind: CoinKind;
  readonly latitude: number;
  readonly longitude: number;
  /** PLAY! range in meters. Defaults to IN_RANGE_DEFAULT_METERS. */
  readonly radiusMeters?: number;
  readonly owned: boolean;
  /** A ride with a real queue (not a show, street, transport or walk-through). Defaults to true for rides. */
  readonly queue?: boolean;
  /** A Star Ride (events) or a Rush ride (short wait right now). */
  readonly star?: boolean;
  readonly rush?: boolean;
  /** Owned and ready to level up (Parts and Energy in hand). */
  readonly levelUpReady?: boolean;
  /** A limited coin's last park-local day (YYYY-MM-DD), said in words, never a ticking clock. */
  readonly leavesOn?: string | null;
}

/** Why the target was picked (the first matching rule of blueprint 4.1). */
export type TargetReason =
  | 'line_story'      // 1. today's Adventure coin was just won: play its line story
  | 'in_range'        // 2. an open coin you do not own, in range right now
  | 'in_line'         // 3. the ride whose line you are standing in
  | 'chosen'          // 4. the coin you chose ("Make this my next coin", a callout, Wait Times)
  | 'adventure'       // 5. today's Adventure ride
  | 'star_rush'       // 6. a Star Ride or a Rush ride (after their unlock)
  | 'nearest_open'    // 7. the nearest open ride coin you do not own
  | 'nearest_unknown' // 8. the nearest ride coin with no live answer ("Check it's running")
  | 'nearest_sight'   // 9. the nearest sight coin you do not own
  | 'level_up'        // 10. a coin ready to level up
  | 'leaves_soon'     // 10. a limited coin that leaves soon
  | 'plan';           // home: the coin planned for the next park day

export interface GuideTarget {
  readonly taskId: number;
  readonly parkId: number;
  readonly name: string;
  readonly kind: CoinKind;
  readonly reason: TargetReason;
  /** Who set it: 'guide' when the picker chose it, else the setTarget source (e.g. 'shelf', 'callout'). */
  readonly source: string;
  /** Meters from the player, or null when either position is unknown (and at home). */
  readonly meters: number | null;
  readonly inRange: boolean;
  /** No live answer for this ride: the card adds "Check it's running". */
  readonly checkRunning: boolean;
  readonly leavesOn: string | null;
}

export interface GuideAdventure {
  readonly taskId: number;
  readonly parkId: number;
  /** discover = win its coin; play = its line story; celebrate = celebrate the ride; complete = done. */
  readonly phase: 'discover' | 'play' | 'celebrate' | 'complete';
  /** The player picked another coin while the line story waited. */
  readonly lineStoryDeclined?: boolean;
}

export interface GuideInput {
  readonly mode: 'park' | 'home';
  /** The park the player is in (park mode), or the next park day's park (home mode). */
  readonly parkId: number | null;
  readonly location: GuidePoint | null;
  readonly coins: readonly GuideCoin[];
  /** Per coin task id. A missing entry means no live answer (unknown). Build it with liveAnswers. */
  readonly live?: Readonly<Record<number, LiveAnswer>>;
  /** The target the guide holds now. It stays until won, done, closed, too far, or replaced by a pick. */
  readonly current?: GuideTarget | null;
  /** When the player picked the held target (epoch ms), or null when the guide picked it. A fresh pick
   * holds even against a line dwell (the target never changes without a win, a closure or a pick). */
  readonly currentPickedAt?: number | null;
  /** A fresh player pick (guide.setTarget). It replaces the held target when it is a valid target. */
  readonly pickedTaskId?: number | null;
  readonly pickedSource?: string;
  /** The coin the player planned earlier (rule 4). Used only when there is no held target. */
  readonly chosenTaskId?: number | null;
  readonly adventure?: GuideAdventure | null;
  /** The ride whose line the player is standing in (90 s nearly still in a queue ride's zone). */
  readonly inLineTaskId?: number | null;
  /** Rung gates from the unlock ladder (src/services/reveal/revealLadder.ts). */
  readonly starRushUnlocked?: boolean;
  readonly coinLevelsUnlocked?: boolean;

  // Only guideState reads these.
  readonly now?: number;
  /** The first fresh in-park reading of this visit (epoch ms). */
  readonly arrivedAt?: number | null;
  /** Whole days since the player's last app open. 14 or more is a welcome back. */
  readonly daysAway?: number | null;
  readonly welcomeBackDone?: boolean;
  /** The player's Tickets and free ways. Omitted: the card does not show wallet states. */
  readonly wallet?: FreeTicketsInput | null;
}

/** Default PLAY! range when a coin has no radius. */
export const IN_RANGE_DEFAULT_METERS = 50;
/** The card never points at anything farther than this. */
export const MAX_TARGET_METERS = 1500;
/** The arrival state lasts this long after the first fresh in-park reading. */
export const ARRIVE_MS = 30_000;
/** A first open after this many days away is a welcome back. */
export const WELCOME_BACK_DAYS = 14;
/** A live answer older than this is no answer (the feed is late). */
export const LIVE_FRESH_MS = 180_000;
/** A known-closed ride stays closed this long with no fresh open answer (then a new park day starts). */
export const CLOSED_HOLD_MS = 12 * 60 * 60 * 1000;
/** A coin the player picked holds against a line dwell for this long (then standing in a line wins). */
export const PICK_HOLD_MS = 10 * 60 * 1000;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function validPoint(point: GuidePoint | null | undefined): point is GuidePoint {
  return !!point && finite(point.latitude) && finite(point.longitude) &&
    Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

/** Ground distance in meters (equirectangular; plenty for a theme park). */
export function guideMeters(a: GuidePoint, b: GuidePoint): number {
  const k = Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.hypot((b.latitude - a.latitude) * 111_320, (b.longitude - a.longitude) * 111_320 * k);
}

function metersTo(coin: GuideCoin, location: GuidePoint | null): number | null {
  if (!validPoint(location) || !validPoint(coin)) return null;
  return guideMeters(location, coin);
}

function liveOf(input: GuideInput, coin: GuideCoin): LiveAnswer {
  if (coin.kind === 'sight') return 'open';
  return input.live?.[coin.taskId] ?? 'unknown';
}

function inRange(coin: GuideCoin, meters: number | null): boolean {
  if (meters === null) return false;
  const radius = finite(coin.radiusMeters) && coin.radiusMeters > 0 ? coin.radiusMeters : IN_RANGE_DEFAULT_METERS;
  return meters <= radius;
}

function targetFor(input: GuideInput, coin: GuideCoin, reason: TargetReason, source = 'guide'): GuideTarget {
  const meters = input.mode === 'home' ? null : metersTo(coin, input.location);
  return {
    taskId: coin.taskId,
    parkId: coin.parkId,
    name: coin.name,
    kind: coin.kind,
    reason,
    source,
    meters,
    inRange: input.mode === 'park' && inRange(coin, meters),
    checkRunning: coin.kind === 'ride' && liveOf(input, coin) === 'unknown',
    leavesOn: coin.leavesOn ?? null,
  };
}

/** Coins in this park only (never another park, the esplanade rule). */
function parkCoins(input: GuideInput): GuideCoin[] {
  if (input.parkId == null) return [];
  return input.coins.filter(coin => coin && coin.parkId === input.parkId && finite(coin.taskId));
}

/** Within MAX_TARGET_METERS, or distance unknown. */
function withinReach(input: GuideInput, coin: GuideCoin): boolean {
  const meters = metersTo(coin, input.location);
  return meters === null || meters <= MAX_TARGET_METERS;
}

/** A coin the guide may send the player to win: in this park, not owned, not known closed, in reach. */
function winnable(input: GuideInput, coin: GuideCoin): boolean {
  return !coin.owned && liveOf(input, coin) !== 'closed' && withinReach(input, coin);
}

function adventureLineStory(input: GuideInput): boolean {
  const adventure = input.adventure;
  return !!adventure && adventure.parkId === input.parkId && adventure.phase === 'play' && !adventure.lineStoryDeclined;
}

/** The in-line ride, when it is a real queue ride in this park that is not known closed. Owned is fine: the wait powers it. */
function inLineCoin(input: GuideInput, coins: readonly GuideCoin[]): GuideCoin | null {
  if (input.inLineTaskId == null) return null;
  const coin = coins.find(c => c.taskId === input.inLineTaskId);
  if (!coin || coin.kind !== 'ride' || coin.queue === false) return null;
  return liveOf(input, coin) === 'closed' ? null : coin;
}

/** Nearest first; unknown distances after known ones; then by name for a stable answer. */
function nearest(input: GuideInput, coins: readonly GuideCoin[]): GuideCoin | null {
  let best: GuideCoin | null = null;
  let bestMeters: number | null = null;
  for (const coin of coins) {
    const meters = metersTo(coin, input.location);
    if (!best) { best = coin; bestMeters = meters; continue; }
    const closer = meters !== null && (bestMeters === null || meters < bestMeters);
    const tie = meters === bestMeters && coin.name.localeCompare(best.name) < 0;
    if (closer || tie) { best = coin; bestMeters = meters; }
  }
  return best;
}

/** Whether the held target still stands (blueprint 4.1: it does not flip-flop). */
function heldStillValid(input: GuideInput, coins: readonly GuideCoin[], held: GuideTarget): GuideCoin | null {
  const coin = coins.find(c => c.taskId === held.taskId);
  if (!coin) return null;                                   // another park, or gone
  if (liveOf(input, coin) === 'closed') return null;        // it closed
  if (!withinReach(input, coin)) return null;               // walked far away
  if (!coin.owned) return coin;                             // still to win
  if (held.reason === 'level_up') return input.coinLevelsUnlocked && coin.levelUpReady ? coin : null;
  if (held.reason === 'line_story') {
    return adventureLineStory(input) && input.adventure?.taskId === coin.taskId ? coin : null;
  }
  if (input.inLineTaskId === coin.taskId) return coin;      // standing in its line powers it
  return null;                                              // won
}

/**
 * Pick the guide's one target, or null for the resting / closed message.
 * Pure. See blueprint 4.1 for the order; the first match wins.
 */
export function pickNextCoin(input: GuideInput): GuideTarget | null {
  if (!input || !Array.isArray(input.coins)) return null;
  const coins = parkCoins(input);

  // Home: never a park goal, never the Adventure. Only the coin planned for the next park day.
  if (input.mode === 'home') {
    const planId = input.pickedTaskId ?? input.chosenTaskId ?? input.current?.taskId ?? null;
    const plan = planId == null ? null : coins.find(c => c.taskId === planId && !c.owned);
    return plan ? targetFor(input, plan, 'plan', input.pickedTaskId === plan.taskId ? input.pickedSource ?? 'pick' : 'guide') : null;
  }

  // A fresh pick replaces the held target when it is a valid target in this park.
  if (input.pickedTaskId != null) {
    const picked = coins.find(c => c.taskId === input.pickedTaskId);
    if (picked && liveOf(input, picked) !== 'closed' && withinReach(input, picked)) {
      if (!picked.owned) return targetFor(input, picked, 'chosen', input.pickedSource ?? 'pick');
      if (input.coinLevelsUnlocked && picked.levelUpReady) return targetFor(input, picked, 'level_up', input.pickedSource ?? 'pick');
    }
  }

  // Standing in a ride's line turns the guide to that ride (the in-line state), unless the player just
  // picked another coin (a fresh pick holds: the target never changes without a win, a closure or a pick).
  const line = inLineCoin(input, coins);
  const now = finite(input.now) ? input.now : Date.now();
  const freshPick = !!input.current && input.current.source !== 'guide' && finite(input.currentPickedAt) &&
    now - input.currentPickedAt >= 0 && now - input.currentPickedAt < PICK_HOLD_MS && !!heldStillValid(input, coins, input.current);
  if (line && input.current?.taskId !== line.taskId && !freshPick) return targetFor(input, line, 'in_line');

  // The held target stays until won, done, closed, too far, or replaced.
  if (input.current) {
    const held = heldStillValid(input, coins, input.current);
    if (held) return targetFor(input, held, input.current.reason, input.current.source);
  }

  // 1. Right after winning today's Adventure coin: that ride, for its line story.
  if (adventureLineStory(input)) {
    const ride = coins.find(c => c.taskId === input.adventure!.taskId);
    if (ride && liveOf(input, ride) !== 'closed' && withinReach(input, ride)) return targetFor(input, ride, 'line_story');
  }

  // 2. An open coin you do not own, in range right now.
  const here = coins.filter(c => winnable(input, c) && inRange(c, metersTo(c, input.location)));
  const hereCoin = nearest(input, here);
  if (hereCoin) return targetFor(input, hereCoin, 'in_range');

  // 3. The ride whose line you are standing in.
  if (line) return targetFor(input, line, 'in_line');

  // 4. The coin you chose, if it is open and in this park.
  if (input.chosenTaskId != null) {
    const chosen = coins.find(c => c.taskId === input.chosenTaskId);
    if (chosen && winnable(input, chosen)) return targetFor(input, chosen, 'chosen');
  }

  // 5. Today's Adventure ride, if it is open.
  const adventure = input.adventure;
  if (adventure && adventure.parkId === input.parkId && adventure.phase === 'discover') {
    const ride = coins.find(c => c.taskId === adventure.taskId);
    if (ride && winnable(input, ride)) return targetFor(input, ride, 'adventure');
  }

  // 6. A Star Ride or a Rush ride, only after their unlock.
  if (input.starRushUnlocked) {
    const special = nearest(input, coins.filter(c => c.kind === 'ride' && (c.star || c.rush) && winnable(input, c)));
    if (special) return targetFor(input, special, 'star_rush');
  }

  // 7. The nearest ride coin known to be open.
  const open = nearest(input, coins.filter(c => c.kind === 'ride' && winnable(input, c) && liveOf(input, c) === 'open'));
  if (open) return targetFor(input, open, 'nearest_open');

  // 8. The nearest ride coin with no live answer (after every known-open ride): "Check it's running".
  const unknown = nearest(input, coins.filter(c => c.kind === 'ride' && winnable(input, c) && liveOf(input, c) === 'unknown'));
  if (unknown) return targetFor(input, unknown, 'nearest_unknown');

  // 9. The nearest sight coin you do not own (sights are always open).
  const sight = nearest(input, coins.filter(c => c.kind === 'sight' && winnable(input, c)));
  if (sight) return targetFor(input, sight, 'nearest_sight');

  // 10. A coin ready to level up (a coin-card job, not a walk), or a limited coin that leaves soon.
  if (input.coinLevelsUnlocked) {
    const level = nearest(input, coins.filter(c => c.owned && c.levelUpReady && liveOf(input, c) !== 'closed'));
    if (level) return targetFor(input, level, 'level_up');
  }
  const leaving = coins
    .filter(c => !c.owned && !!c.leavesOn && liveOf(input, c) !== 'closed' && withinReach(input, c))
    .sort((a, b) => String(a.leavesOn).localeCompare(String(b.leavesOn)) || a.name.localeCompare(b.name))[0];
  if (leaving) return targetFor(input, leaving, 'leaves_soon');

  // 11. Nothing to win right now: the resting or closed message.
  return null;
}

/** Which card state shows for this target (the 4.1 state table). Pure. */
export function guideState(input: GuideInput, target: GuideTarget | null): GuideState {
  const welcomeBack = finite(input.daysAway) && input.daysAway >= WELCOME_BACK_DAYS && !input.welcomeBackDone;
  if (input.mode === 'home') return welcomeBack ? 'welcome_back' : 'home';
  if (welcomeBack) return 'welcome_back';
  if (!target) return 'resting';
  const now = finite(input.now) ? input.now : Date.now();
  if (finite(input.arrivedAt) && now - input.arrivedAt >= 0 && now - input.arrivedAt < ARRIVE_MS) return 'arrive';
  if (input.inLineTaskId != null && input.inLineTaskId === target.taskId) return 'in_line';
  if (target.reason === 'line_story') return 'line_story';
  if (target.reason === 'level_up') return 'level_up';
  if (input.wallet) {
    const step = nextFreeTicket(input.wallet);
    if (step?.kind === 'claim') return 'claim';
    if (step?.kind === 'line_ticket' || step?.kind === 'treats') return 'need_ticket';
    if (step?.kind === 'free_try') return target.inRange ? 'free_try' : 'walk';
    if (step?.kind === 'extra_try') return target.inRange ? 'extra_try' : 'walk';
  }
  return target.inRange ? 'here' : 'walk';
}

// ---------------------------------------------------------------------------
// Live status, honestly.

export interface LiveMemo {
  readonly answer: 'open' | 'closed';
  /** When the feed last gave this answer (epoch ms). */
  readonly at: number;
}

/** The parts of the server's /parks/{id}/live payload the guide reads. */
export interface GuideLiveFeed {
  readonly rides: readonly { readonly task_id: number; readonly status: string }[];
  readonly fetched_at: string | null;
}

const CLOSED_STATUSES = new Set(['CLOSED', 'DOWN', 'REFURBISHMENT']);

/**
 * Turn the live feed into one answer per coin.
 * - A fresh feed (under 3 minutes old) updates the memo: OPERATING is open,
 *   CLOSED, DOWN and REFURBISHMENT are closed. Duplicate rows for one coin are
 *   ignored (no guessing).
 * - A known-closed ride stays closed until a fresh answer says it is open. It
 *   never un-closes because the answer got old (the walks saw that after 180 s).
 *   After 12 hours with no answer it becomes unknown again (a new park day).
 * - An open answer counts only while fresh; after that the ride has no live
 *   answer and stays eligible after the known-open rides.
 * Pure: returns the answers and the next memo to keep.
 */
export function liveAnswers(previous: Readonly<Record<number, LiveMemo>> | null | undefined,
  live: GuideLiveFeed | null | undefined, now: number):
  { answers: Record<number, LiveAnswer>; memo: Record<number, LiveMemo> } {
  const memo: Record<number, LiveMemo> = { ...(previous ?? {}) };
  const fetchedAt = live?.fetched_at ? Date.parse(live.fetched_at) : NaN;
  const age = now - fetchedAt;
  if (live && Array.isArray(live.rides) && Number.isFinite(fetchedAt) && age >= -30_000 && age <= LIVE_FRESH_MS) {
    const rows = new Map<number, number>();
    for (const ride of live.rides) if (ride && finite(ride.task_id)) rows.set(ride.task_id, (rows.get(ride.task_id) ?? 0) + 1);
    for (const ride of live.rides) {
      if (!ride || !finite(ride.task_id) || rows.get(ride.task_id) !== 1) continue;
      const status = String(ride.status ?? '').toUpperCase();
      if (status === 'OPERATING') memo[ride.task_id] = { answer: 'open', at: fetchedAt };
      else if (CLOSED_STATUSES.has(status)) memo[ride.task_id] = { answer: 'closed', at: fetchedAt };
    }
  }
  const answers: Record<number, LiveAnswer> = {};
  for (const [key, entry] of Object.entries(memo)) {
    const id = Number(key);
    const since = now - entry.at;
    if (entry.answer === 'closed' && since <= CLOSED_HOLD_MS) answers[id] = 'closed';
    else if (entry.answer === 'open' && since <= LIVE_FRESH_MS) answers[id] = 'open';
    else if (entry.answer === 'closed') delete memo[id];
  }
  return { answers, memo };
}

// ---------------------------------------------------------------------------
// The guide store: the one owner of the pointer.

type Listener = () => void;

let held: GuideTarget | null = null;
let heldPickedAt: number | null = null;
let pick: { taskId: number; source: string; at: number } | null = null;
let plan: number | null = null;
let declinedLineStory: number | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(listener => {
  try { listener(); } catch { /* one bad listener never stops the rest */ }
});

const sameTarget = (a: GuideTarget | null, b: GuideTarget | null) =>
  a === b || (!!a && !!b && a.taskId === b.taskId && a.reason === b.reason && a.source === b.source &&
    a.meters === b.meters && a.inRange === b.inRange && a.checkRunning === b.checkRunning && a.parkId === b.parkId);

export const guide = {
  /**
   * Point the guide at a coin. The only way any screen moves the pointer.
   * The pick applies on the next resolve (the map resolves on every location,
   * live or data change); a closed, owned or other-park pick is ignored there,
   * and the coin is kept as the player's plan (rule 4).
   */
  setTarget(taskId: number, source: string): void {
    if (!finite(taskId)) return;
    if (held?.reason === 'line_story' && held.taskId !== taskId) declinedLineStory = held.taskId;
    pick = { taskId, source: source || 'pick', at: Date.now() };
    plan = taskId;
    emit();
  },
  /** The target the guide holds now, or null (resting, closed, or not resolved yet). */
  current(): GuideTarget | null {
    return held;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /**
   * Run the picker with the held target, the pending pick, the plan and the
   * declined line story, store the result and notify on change. The map calls
   * this; other lanes only call setTarget, current and subscribe.
   */
  resolve(input: Omit<GuideInput, 'current' | 'pickedTaskId' | 'pickedSource'>): GuideTarget | null {
    const adventure = input.adventure && declinedLineStory === input.adventure.taskId
      ? { ...input.adventure, lineStoryDeclined: true } : input.adventure;
    const fresh = pick;
    const next = pickNextCoin({
      ...input,
      adventure,
      current: held,
      currentPickedAt: heldPickedAt,
      pickedTaskId: fresh?.taskId ?? null,
      pickedSource: fresh?.source,
      chosenTaskId: input.chosenTaskId ?? plan,
    });
    pick = null;
    // Remember when the player picked the held coin (a fresh pick holds against a line dwell).
    if (!next || next.source === 'guide') heldPickedAt = null;
    else if (fresh && next.taskId === fresh.taskId) heldPickedAt = fresh.at;
    else if (held?.taskId !== next.taskId) heldPickedAt = null;
    if (!sameTarget(held, next)) {
      held = next;
      emit();
    }
    return held;
  },
  /**
   * "Pick another coin" on the Line story card: the guide moves on from today's Adventure ride
   * (its line story stays playable from its sheet) and picks the next coin on the next resolve.
   */
  skipLineStory(): void {
    if (held?.reason !== 'line_story') return;
    declinedLineStory = held.taskId;
    held = null;
    emit();
  },
  /** The player's planned coin (rule 4), if any. */
  plan(): number | null {
    return plan;
  },
  /** Forget the plan once its coin is won or the player signs out. */
  clearPlan(): void {
    if (plan === null) return;
    plan = null;
    emit();
  },
  /** Sign-out and tests: forget everything. */
  reset(): void {
    held = null; heldPickedAt = null; pick = null; plan = null; declinedLineStory = null;
    emit();
  },
};
