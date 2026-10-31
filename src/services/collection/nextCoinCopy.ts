/**
 * Words for the park header's goal card. Only a reviewed ride coin
 * (server coin_kind 'ride') is called a ride; a food stand, show or
 * landmark coin is just "your next coin", so the header never sends
 * someone to "the ride" at Panda Express.
 */
export type NextCoinKind = string | null | undefined;

export function isRideCoin(kind: NextCoinKind): boolean {
  return kind === 'ride';
}

export function nextCoinEyebrow(kind: NextCoinKind): string {
  return isRideCoin(kind) ? 'YOUR NEXT RIDE COIN' : 'YOUR NEXT COIN';
}

export function ticketsReadyHint(kind: NextCoinKind): string {
  return isRideCoin(kind) ? 'Tickets ready. Head to the ride.' : 'Tickets ready. Head there to play.';
}

/** The coin kind for a goal task, looked up in the park's own task lists. */
export function goalCoinKind(taskId: number | null | undefined,
  ...lists: ReadonlyArray<ReadonlyArray<{ id: number; coin_kind?: string | null }>>): string | null {
  if (!taskId) return null;
  for (const list of lists) {
    const hit = list.find(task => task.id === taskId);
    if (hit) return hit.coin_kind ?? null;
  }
  return null;
}

/**
 * The map guide's target, when it points at a coin in this park: the shelf's
 * NEXT COIN card then names the same coin the map card does (one next thing).
 * A coin you already own is never the NEXT COIN (pass `owned`): the shelf skips it.
 */
export function guideShelfPick<T extends { readonly id: number }>(
  target: { readonly taskId: number; readonly parkId: number } | null | undefined,
  parkId: number, atPark: boolean, rows: readonly T[], owned?: ReadonlySet<number>): T | null {
  if (!target || !atPark || target.parkId !== parkId) return null;
  const row = rows.find(item => item.id === target.taskId) ?? null;
  return row && owned?.has(row.id) ? null : row;
}

/** The guide reasons that mean "right here, right now": they win over a saved level-up goal. */
const HERE_NOW = new Set(['in_line', 'in_range', 'line_story']);

export interface ShelfGuideInput<T extends { readonly id: number }> {
  /** guide.current(): the map's resolved target, or null before the map resolves or while it rests. */
  readonly target: { readonly taskId: number; readonly parkId: number; readonly reason?: string | null } | null | undefined;
  /** guide.plan(): the last coin any GO, GET RIDE PARTS or coin pick pointed at. */
  readonly plan: number | null | undefined;
  /** levelUpGoal.get(): the owned coin GET RIDE PARTS pointed at (valid only while it is still the plan). */
  readonly levelUpGoal: number | null | undefined;
  readonly parkId: number;
  readonly atPark: boolean;
  readonly rows: readonly T[];
  /** Coin ids the player owns at this park. */
  readonly owned: ReadonlySet<number>;
}

export interface ShelfGuidePick<T> {
  readonly row: T;
  /** True: an owned coin you are leveling up (LEVEL UP GOAL, the parts picture, GO to its line). */
  readonly levelUp: boolean;
  /** Why it shows: the guide's reason, 'plan', or 'coin_parts' for a GET RIDE PARTS goal. */
  readonly reason: string;
}

/**
 * The shelf's one next thing at this park, from the one guide pointer:
 * - GET RIDE PARTS on an owned coin (it is still the plan): LEVEL UP GOAL for that coin,
 *   unless the guide holds a coin right here right now (in range, in its line, the line story).
 * - the map's target: a coin you do not own, or an owned coin the guide says is ready to level up.
 * - the plan (GO, a coin pick) before the map resolves: only while you do not own that coin.
 * A coin you already own never shows as NEXT COIN: GO on Tiki Room, win it, and the shelf moves on.
 */
export function shelfGuidePick<T extends { readonly id: number }>(input: ShelfGuideInput<T>): ShelfGuidePick<T> | null {
  const { target, plan, levelUpGoal, parkId, atPark, rows, owned } = input;
  if (!atPark) return null;
  const row = (id: number | null | undefined) => (id == null ? null : rows.find(item => item.id === id) ?? null);
  const targetHere = target && target.parkId === parkId ? target : null;
  const levelRow = levelUpGoal != null && levelUpGoal === plan && owned.has(levelUpGoal) ? row(levelUpGoal) : null;
  if (levelRow && !(targetHere && targetHere.taskId !== levelRow.id && HERE_NOW.has(targetHere.reason ?? '') &&
    row(targetHere.taskId) && !owned.has(targetHere.taskId))) {
    return { row: levelRow, levelUp: true, reason: targetHere?.taskId === levelRow.id && targetHere.reason === 'level_up' ? 'level_up' : 'coin_parts' };
  }
  if (targetHere) {
    const hit = row(targetHere.taskId);
    if (hit && !owned.has(hit.id)) return { row: hit, levelUp: false, reason: targetHere.reason ?? 'chosen' };
    if (hit && targetHere.reason === 'level_up') return { row: hit, levelUp: true, reason: 'level_up' };
    return null;
  }
  const planned = row(plan);
  return planned && !owned.has(planned.id) ? { row: planned, levelUp: false, reason: 'plan' } : null;
}

/**
 * The plan to forget: a coin this screen watched as your unowned plan that you now own
 * (GO on Tiki Room, then win Tiki Room), and not a level-up goal. guide.clearPlan() then lets
 * the shelf and the map pick the next coin. `watched` is the plan id this screen last saw
 * while you did not own it: a plan another surface set on a coin you already own (Wait Times
 * PLAY IN LINE on an owned ride, the map's level-up pick) is never this screen's to clear.
 */
export function stalePlan(plan: number | null | undefined, owned: ReadonlySet<number>,
  levelUpGoal: number | null | undefined, watched: number | null | undefined): number | null {
  return plan != null && owned.has(plan) && plan !== levelUpGoal && watched === plan ? plan : null;
}

/** The LEVEL UP GOAL card's line: ready now, or where the Parts come from. */
export function levelUpGoalHint(reason: string, sight: boolean): string {
  if (reason === 'level_up') return 'Ready to level up!';
  return sight ? 'Win it again for Ride Parts.' : 'Its line earns Ride Parts.';
}

/** The NEXT COIN card's line under the guide's target, in a 7-year-old's words. */
export function guideShelfHint(reason: string | null | undefined): string {
  if (reason === 'in_line') return 'You are in its line. Play while you wait!';
  if (reason === 'level_up') return 'Ready to level up!';
  if (reason === 'plan') return 'Your plan. The map shows the way.';
  return 'The map shows the way.';
}

/** One ride's live status from the park feed, or null when the feed has no answer for it. */
export type ShelfLiveStatus = 'OPERATING' | 'DOWN' | 'REFURBISHMENT' | 'CLOSED' | null;

export interface ShelfNearbyInput<T> {
  /** True while a fresh live answer (under 2 minutes old) for this park is in hand. */
  readonly feedFresh: boolean;
  /** True when the fresh feed says at least one ride in this park is running. */
  readonly anyRideOpen: boolean;
  /** A sight (statue, shop, street) is always open; only rides wait on the live feed. */
  readonly isSight: (row: T) => boolean;
  readonly status: (row: T) => ShelfLiveStatus;
  /** The nearest coin you do not own that passes `eligible` (parkRideSuggestion.nearbyUncollectedRide). */
  readonly nearest: (eligible: (row: T) => boolean) => T | null;
}

export type ShelfNearby<T> =
  | { readonly kind: 'coin'; readonly row: T; readonly hint: string; readonly reportedOpen: boolean }
  | { readonly kind: 'closed'; readonly title: string; readonly hint: string };

/**
 * The shelf's own NEXT COIN when the guide holds nothing here (blueprint 4.1, rules 7 to 9 and 11):
 * the nearest open ride, then a ride with no live answer, then a sight. A ride the feed calls
 * closed, down or in refurbishment is never "the nearest coin you can win next".
 * At night (no ride open) the sights stay open; with no sight left, the park is closed.
 */
export function shelfNearbyPick<T>(input: ShelfNearbyInput<T>): ShelfNearby<T> | null {
  const { feedFresh, anyRideOpen, isSight, status, nearest } = input;
  if (!feedFresh) {
    const row = nearest(() => true);
    return row ? { kind: 'coin', row, hint: 'The nearest coin you can win next.', reportedOpen: false } : null;
  }
  const open = nearest(row => !isSight(row) && status(row) === 'OPERATING');
  if (open) return { kind: 'coin', row: open, hint: 'Nearest coin, reported open.', reportedOpen: true };
  if (anyRideOpen) {
    const unknown = nearest(row => !isSight(row) && status(row) == null);
    if (unknown) return { kind: 'coin', row: unknown, hint: 'Check it is running when you get there.', reportedOpen: false };
  }
  const sight = nearest(isSight);
  if (sight) {
    return { kind: 'coin', row: sight, reportedOpen: false,
      hint: anyRideOpen ? 'Sights are always open.' : 'Rides are resting. Sights stay open.' };
  }
  return anyRideOpen ? null : { kind: 'closed', title: 'The park is closed', hint: 'See you next park day.' };
}
