/**
 * The team offer after the first coin, once ever per player (core loop
 * blueprint 4.3 rule 3): the win card, then the team step, then the map.
 * Saved per player id (AsyncStorage "tps.teamOffer.v1@p<id>"); a failed read
 * or write never blocks the win, it only means the offer may show once more.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tps.teamOffer.v1';

export function teamOfferKey(playerId: number | string): string {
  return `${KEY}@p${playerId}`;
}

/**
 * Whether this win should open the team step: a brand-new coin, the player's
 * first coin ever, no team yet (the server's needs_team), and never offered.
 */
export function wantsTeamStep(input: {
  needsTeam: boolean; isNewCoin: boolean; firstCoinEver: boolean; offeredBefore: boolean;
}): boolean {
  return input.needsTeam && input.isNewCoin && input.firstCoinEver && !input.offeredBefore;
}

export async function teamOffered(playerId: number | null | undefined): Promise<boolean> {
  if (playerId == null) return true;
  try {
    return (await AsyncStorage.getItem(teamOfferKey(playerId))) === '1';
  } catch {
    return false;
  }
}

export async function markTeamOffered(playerId: number | null | undefined): Promise<void> {
  if (playerId == null) return;
  try { await AsyncStorage.setItem(teamOfferKey(playerId), '1'); } catch { /* best effort */ }
}

/**
 * The win card stays up until the team step has finished sliding in under it, then fades into it:
 * win card, team step, map, with no frame of map in between. TeamSelection reports its native
 * transitionEnd here; the win card never waits longer than TEAM_STEP_SHOWN_MAX_MS.
 */
export const TEAM_STEP_SHOWN_MAX_MS = 900;
let shownWaiters: Array<() => void> = [];

/** TeamSelection calls this once its slide-in has finished. */
export function teamStepShown(): void {
  const waiters = shownWaiters;
  shownWaiters = [];
  waiters.forEach(finish => finish());
}

/** Resolves when the team step reports it is on screen, or after `ms` at most. */
export function whenTeamStepShown(ms: number = TEAM_STEP_SHOWN_MAX_MS): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      shownWaiters = shownWaiters.filter(waiter => waiter !== finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    shownWaiters.push(finish);
  });
}

/**
 * When the win card hands off to the first coin's team step, its rewards (Shark Coins and the Ticket
 * to their header pills, the stamp to the Rewards button) wait for the map instead of being dropped
 * (blueprint 4.3 rule 3): the team step runs them once it has closed back onto the map. A step that
 * goes on to another screen (the shelf, a line story) drops them, since their places are not there.
 */
export const TEAM_STEP_GONE_MAX_MS = 700;
/** Where a win card's rewards go when it closes: now, after the team step, or nowhere (another screen). */
export type WinFlyWhen = 'now' | 'after_team_step' | 'never';
let queuedFly: (() => void) | null = null;
let leavingFly: (() => void) | null = null;
let goneTimer: ReturnType<typeof setTimeout> | null = null;

/** The win card queues its flight here when the team step took over. A newer win replaces it. */
export function flyAfterTeamStep(fly: () => void): void {
  queuedFly = fly;
}

/** TeamSelection calls this as it leaves: back to the map runs the queued flight once the map is in front. */
export function teamStepLeaving(toMap: boolean): void {
  const fly = queuedFly;
  queuedFly = null;
  if (!fly || !toMap) return;
  leavingFly = fly;
  if (goneTimer) clearTimeout(goneTimer);
  goneTimer = setTimeout(teamStepGone, TEAM_STEP_GONE_MAX_MS);
}

/** The team step has finished sliding away (its closing transitionEnd), or the cap ran out. */
export function teamStepGone(): void {
  if (goneTimer) clearTimeout(goneTimer);
  goneTimer = null;
  const fly = leavingFly;
  leavingFly = null;
  fly?.();
}

/** Where LET'S GO, Later or the close X take the player. */
export interface TeamSelectionParams {
  readonly onTeamSelected?: () => void;
  readonly isOnboarding?: boolean;
  /**
   * The first-coin step (blueprint 4.3 rule 3): opened right after the first
   * win card ever closes. It shows a Later button, and afterwards goes back to
   * the map (or on to `next`, the shelf the player asked for on the win card).
   */
  readonly firstCoin?: boolean;
  readonly next?: { readonly name: string; readonly params?: object };
}


/**
 * Where LET'S GO, Later and the close X take the player: always somewhere
 * (must-fix 2, the team welcome dead end). The callback (Profile's refresh)
 * runs first and never replaces the way out.
 */
export function teamExit(params: TeamSelectionParams | undefined, canGoBack: boolean):
  { kind: 'reset' } | { kind: 'next'; name: string; params?: object } | { kind: 'back' } {
  if (params?.next?.name) return { kind: 'next', name: params.next.name, params: params.next.params };
  if (params?.isOnboarding || !canGoBack) return { kind: 'reset' };
  return { kind: 'back' };
}
