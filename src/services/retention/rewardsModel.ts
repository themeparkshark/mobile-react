/**
 * The Rewards sheet (core loop blueprint 4.2, 4.3 and 5.8, October 2026): one
 * list of what is ready, behind one Rewards button with one number. It folds
 * the seven reward containers (daily chest, Daily 3 and its chest, level
 * chests, the Weekly Box, Trail Boxes, stamps to claim, event chests) into one
 * place, so nothing pops over the map.
 *
 * Pure (no React, no network), unit tested in tools/tests/rewards-sheet.test.cjs.
 * A null input means "not on for this player yet" (its switch is off or its
 * unlock rung has not opened): it never shows and never counts.
 */

export type RewardsRowKey = 'daily_chest' | 'daily3' | 'level_chest' | 'weekly_box' | 'trail' | 'stamps' | 'events';
export type RewardsAction = 'open' | 'go' | 'claim_all';

export interface RewardsRow {
  readonly key: RewardsRowKey;
  readonly title: string;
  /** One short line: what is waiting, in kid words. */
  readonly line: string;
  /** How many things this row has ready to open or claim right now (0 = just a progress line). */
  readonly ready: number;
  /** The row's button, or null when there is nothing to do here today. */
  readonly action: RewardsAction | null;
}

export interface RewardsInput {
  /** Today's daily chest (always on). */
  readonly dailyChest: { readonly unclaimed: boolean; readonly day: number; readonly of: number } | null;
  /** Daily 3, after rung 4 and with its switch on. */
  readonly daily3: { readonly done: number; readonly total: number; readonly claimable: boolean; readonly claimed: boolean; readonly flame: number } | null;
  /** The Weekly Box (comes with Daily 3). */
  readonly weekly: { readonly claimable: boolean } | null;
  /** The lowest unopened level chest, and how many wait (rung 4). */
  readonly levelChest: { readonly level: number; readonly waiting: number } | null;
  /** Trail Boxes, after rung 6: ready to open, walking, and the walking box nearest to done (0..1). */
  readonly trail: { readonly ready: number; readonly walking: number; readonly nearest: number | null; readonly atPark: boolean;
    /** The Trail host is on screen to open (false: the row shows its line with no button, never a dead tap). */
    readonly door?: boolean } | null;
  /** Earned stamps whose rewards are still to claim. */
  readonly stamps: { readonly claimable: number } | null;
  /** Event chests to open, after rung 9 and only while an event is on. */
  readonly events: { readonly chests: number; readonly door?: boolean } | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The rows, ready things first, then progress lines. Rows with nothing to say are left out. */
export function rewardsRows(i: RewardsInput): RewardsRow[] {
  const rows: RewardsRow[] = [];
  if (i.dailyChest?.unclaimed) {
    rows.push({ key: 'daily_chest', title: 'Daily Chest', line: `Day ${i.dailyChest.day} of ${i.dailyChest.of} is ready`, ready: 1, action: 'open' });
  }
  if (i.daily3) {
    const d = i.daily3;
    if (d.claimable) rows.push({ key: 'daily3', title: 'Daily 3 Chest', line: 'All 3 done! Open your chest', ready: 1, action: 'open' });
    else if (d.claimed) rows.push({ key: 'daily3', title: 'Daily 3', line: 'Done for today. New goals tomorrow', ready: 0, action: 'go' });
    else rows.push({ key: 'daily3', title: 'Daily 3', line: `${d.done} of ${d.total} done`, ready: 0, action: 'go' });
  }
  if (i.levelChest && i.levelChest.waiting > 0) {
    rows.push({ key: 'level_chest', title: `Level ${i.levelChest.level} Chest`, line: 'New gear inside', ready: i.levelChest.waiting, action: 'open' });
  }
  if (i.weekly?.claimable) {
    rows.push({ key: 'weekly_box', title: 'Weekly Box', line: 'Your week of flames earned it', ready: 1, action: 'open' });
  }
  if (i.trail) {
    const t = i.trail;
    const door = t.door !== false;
    if (t.ready > 0) rows.push({ key: 'trail', title: 'Trail Boxes', line: `${plural(t.ready, 'box', 'boxes')} ready to open`, ready: t.ready, action: door ? 'open' : null });
    else if (t.walking > 0) {
      rows.push({ key: 'trail', title: 'Trail Boxes', line: t.atPark ? 'Walk the park to open them' : 'They walk open on your next park day', ready: 0, action: door ? 'go' : null });
    }
  }
  if (i.stamps && i.stamps.claimable > 0) {
    rows.push({ key: 'stamps', title: 'Stamps', line: `${plural(i.stamps.claimable, 'stamp prize', 'stamp prizes')} to claim`, ready: i.stamps.claimable, action: 'claim_all' });
  }
  if (i.events && i.events.chests > 0) {
    rows.push({ key: 'events', title: 'Event Chests', line: `${plural(i.events.chests, 'chest', 'chests')} to open`, ready: i.events.chests, action: i.events.door !== false ? 'open' : null });
  }
  // Ready rows first (stable within each group).
  return [...rows.filter(r => r.ready > 0), ...rows.filter(r => r.ready === 0)];
}

/** The one number on the Rewards button: everything ready to open or claim. */
export function rewardsCount(i: RewardsInput): number {
  return rewardsRows(i).reduce((n, r) => n + r.ready, 0);
}

export interface RewardsSummary {
  /** The number on the button (0: no number, no dot). */
  readonly count: number;
  /** The flame shows on the button once Daily 3 is unlocked (null before). */
  readonly flame: number | null;
  /** A thin ring that fills as the nearest Trail Box walks (null: no ring). */
  readonly trailRing: number | null;
}

/** What guide-map's Rewards button draws: one number, the flame after rung 4, the Trail ring after rung 6. */
export function rewardsSummary(i: RewardsInput): RewardsSummary {
  const ring = i.trail && i.trail.ready === 0 && i.trail.nearest != null ? Math.max(0, Math.min(1, i.trail.nearest)) : null;
  return { count: rewardsCount(i), flame: i.daily3 ? Math.max(0, i.daily3.flame) : null, trailRing: ring };
}

/** The sheet's closing line when nothing is ready: always a reason to come back (never a dead end). */
export function emptyLine(i: RewardsInput): string {
  if (i.daily3 && !i.daily3.claimed && !i.daily3.claimable) return 'Finish your Daily 3 for a chest';
  return 'Your next daily chest comes tomorrow';
}

/** The kid's Daily 3 goal from the server, as the home side when the app is at home (never a GO to a park). */
export interface GoalLike {
  readonly kind: string;
  readonly park: boolean;
  readonly target: number;
  readonly title: string;
  readonly hint: string;
}

/** The chest goal's line (the server still says "Tap the chest on the map"). */
export const CHEST_GOAL_HINT = 'In your Rewards';

/**
 * At home a park goal shows its home side: a ride-coin catch becomes "Find N
 * treats" (the server counts either), and a park-only goal waits for the next
 * park day with no GO. At a park every goal is as sent.
 */
export function homeSideGoal<T extends GoalLike>(goal: T, atPark: boolean): T & { readonly parkOnly: boolean } {
  // The daily chest lives in the Rewards sheet now (not on the map), so its goal says where it really is.
  if (goal.kind === 'chest') return { ...goal, hint: CHEST_GOAL_HINT, parkOnly: false };
  if (atPark || !goal.park) return { ...goal, parkOnly: false };
  if (goal.kind === 'catch') {
    const t = Math.max(1, goal.target);
    return { ...goal, park: false, title: `Find ${t} ${t === 1 ? 'treat' : 'treats'}`, hint: 'or win a ride coin', parkOnly: false };
  }
  return { ...goal, hint: 'On your next park day', parkOnly: true };
}

/** Where GO on a Daily 3 goal goes. At home it never names a park. */
export type GoalGo = 'chest' | 'closet' | 'friends' | 'snack' | 'ride' | 'shelf' | null;
export function goalGo(goal: { readonly kind: string; readonly park: boolean; readonly done: boolean }, atPark: boolean): GoalGo {
  if (goal.done) return null;
  switch (goal.kind) {
    case 'chest': return 'chest';
    case 'look': return 'closet';
    case 'heart': return 'friends';
    case 'level': case 'plan': return 'shelf';
    case 'catch': return atPark && goal.park ? 'ride' : 'snack';
    case 'play': return atPark ? 'ride' : null;
    default: return null;
  }
}

/** The Daily 3 goal's Shark Pass event, for its "+N pass points" line after rung 5. */
export function goalPassEvent(goal: { readonly kind: string; readonly park: boolean }): string | null {
  switch (goal.kind) {
    case 'catch': return goal.park ? 'ride_coin_win' : 'home_find';
    case 'play': return 'mini_game_win';
    case 'level': return 'coin_level_up';
    default: return null;
  }
}

/** "+35 pass points" (each, for a goal that counts more than one) from the server's own points, or null. */
export function goalPassLine(goal: { readonly kind: string; readonly park: boolean; readonly target: number },
  today: readonly { readonly event: string; readonly points: number }[] | null | undefined): string | null {
  const event = goalPassEvent(goal);
  const points = event ? today?.find(e => e.event === event)?.points ?? 0 : 0;
  if (!points) return null;
  // "each" only where the goal counts several of the same thing (treats, ride games), never on a one-coin goal.
  const counts = goal.target > 1 && (goal.kind === 'play' || (goal.kind === 'catch' && !goal.park));
  return counts ? `+${points} pass points each` : `+${points} pass points`;
}

/** The Weekly Box line: the week always starts Monday, said plainly. */
export function weekStartsLine(w: { readonly claimed: boolean; readonly claimable: boolean; readonly done: number; readonly needed: number }): string {
  if (w.claimed) return 'Box opened! Your week starts Monday.';
  if (w.claimable) return 'Your Weekly Box is ready!';
  const left = Math.max(0, w.needed - w.done);
  return left === 0 ? 'Your Weekly Box is ready!' : `${plural(left, 'more flame', 'more flames')} this week. Your week starts Monday.`;
}

/** Streak Freezes show once the flame has reached 3 days (or the player already holds one). */
export function freezesShown(streak: { readonly days: number; readonly best: number; readonly freezes: number }): boolean {
  return streak.freezes > 0 || streak.days >= 3 || streak.best >= 3;
}
