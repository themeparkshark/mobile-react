/**
 * When a reward may open by itself (core loop blueprint 4.3, October 2026).
 * Pure, so the map (guide-map) and the reward hosts share one rule and the
 * test pins it (tools/tests/rewards-sheet.test.cjs).
 *
 * - The daily chest: at home, once a day after the first catch. At a park, never
 *   by itself: it waits in the Rewards button.
 * - Level chests and the "a freeze saved your flame" card: never at a park; at
 *   home only as the app open's one automatic open and only once Daily 3 has
 *   unlocked (rung 4). Everything else (Daily 3 chest, Weekly Box, event chests,
 *   Trail Boxes, stamps) never opens by itself: it waits in the Rewards button.
 * - Nothing opens by itself in a park's first 30 s, while walking to the guide
 *   target, during a game or LinePlay, or within 10 s of a win card (the map's
 *   queue knows those; it passes them as `parkBusy`).
 */

export type AutoReward = 'daily_chest' | 'level_chest' | 'freeze_saved' | 'daily3_chest' | 'weekly_box'
  | 'event_chest' | 'trail_box' | 'stamps' | 'member_look';

export interface AutoOpenInput {
  readonly kind: AutoReward;
  readonly atPark: boolean;
  /** The home hunt's first catch happened (the daily chest waits for it). */
  readonly firstCatchDone: boolean;
  /** Another reward or sheet already opened by itself in this app open. */
  readonly autoOpenUsed: boolean;
  /** Rung 4 (Daily 3 and level chests) is open for this player. */
  readonly dailyRungOpen: boolean;
  /** The map's park moments that hold every automatic open (first 30 s, walking to the target, play, a fresh win card). */
  readonly parkBusy?: boolean;
}

/** May this reward open by itself right now? A tap always opens it (that is not this question). */
export function rewardMayAutoOpen(i: AutoOpenInput): boolean {
  if (i.autoOpenUsed) return false;
  switch (i.kind) {
    case 'daily_chest': return !i.atPark && i.firstCatchDone;
    case 'level_chest':
    case 'freeze_saved': return !i.atPark && i.dailyRungOpen;
    // Membership look dialogs: home first; at a park only when nothing else may wait.
    case 'member_look': return !i.atPark || i.parkBusy === false;
    default: return false;
  }
}

/**
 * A tap on the Rewards sheet's chest row: the daily chest card may show at a
 * park for the next few seconds (the map mounts it right after the tap).
 */
let chestAskedAt = 0;
export const CHEST_ASK_MS = 5000;
export function askForDailyChest(now: number = Date.now()): void {
  chestAskedAt = now;
}
export function dailyChestAsked(now: number = Date.now()): boolean {
  return chestAskedAt > 0 && now - chestAskedAt < CHEST_ASK_MS;
}

/**
 * Whether the daily chest card may show: at home always (the map already
 * decided when to mount it); at a park only when the player asked for it.
 */
export function dailyChestMayShow(input: { readonly atPark: boolean; readonly requested?: boolean; readonly asked: boolean }): boolean {
  if (!input.atPark) return true;
  return input.requested === true || input.asked;
}
