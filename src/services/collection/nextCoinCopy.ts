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
 * The plan to forget: a coin you now own that is not a level-up goal (GO on Tiki Room, then win
 * Tiki Room). guide.clearPlan() then lets the shelf and the map pick the next coin.
 */
export function stalePlan(plan: number | null | undefined, owned: ReadonlySet<number>,
  levelUpGoal: number | null | undefined): number | null {
  return plan != null && owned.has(plan) && plan !== levelUpGoal ? plan : null;
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
