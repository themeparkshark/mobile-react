/**
 * The park shelf as the plan (core loop blueprint 5.4, section 7 "Park shelf").
 * Pure helpers, so the shelf, the coin guide search and the tests read one truth:
 * - one count from the server's shelf total ("9 of 35 coins"), the same numbers
 *   the win card reads (both come from the permanent shelf on the server);
 * - the Rides, Sights and Limited tabs;
 * - the labeled trophy shelf and the next trophy;
 * - the milestone that makes today's park day story card sit on top.
 */

export interface ShelfTotals {
  readonly collected: number;
  readonly available: number;
}

/**
 * The one shelf count. The server's ride_coins_collected / ride_coins_available
 * win; an older server without them falls back to the slots on screen.
 */
export function shelfTotals(park: { readonly ride_coins_collected?: number | null; readonly ride_coins_available?: number | null } | null | undefined,
  fallback?: ShelfTotals): ShelfTotals {
  const collected = Number(park?.ride_coins_collected);
  const available = Number(park?.ride_coins_available);
  if (Number.isFinite(collected) && Number.isFinite(available) && available >= 0) {
    return { collected: Math.max(0, Math.min(collected, available)), available };
  }
  return fallback ?? { collected: 0, available: 0 };
}

/** "9 of 35 coins" (one coin: "1 of 1 coin"). */
export function shelfCountLabel(totals: ShelfTotals): string {
  return `${totals.collected} of ${totals.available} ${totals.available === 1 ? 'coin' : 'coins'}`;
}

export type ShelfTab = 'rides' | 'sights' | 'limited';

/**
 * Split the permanent coins into Rides and Sights. A park without a reviewed
 * ride list keeps every permanent coin on the Rides tab (no Sights tab).
 */
export function shelfTabs<T extends { readonly id: number }>(permanent: readonly T[], rideTaskIds: readonly number[] | null | undefined): {
  rides: T[]; sights: T[]; split: boolean;
} {
  if (!rideTaskIds?.length) return { rides: [...permanent], sights: [], split: false };
  const ids = new Set(rideTaskIds);
  return {
    rides: permanent.filter(task => ids.has(task.id)),
    sights: permanent.filter(task => !ids.has(task.id)),
    split: true,
  };
}

/** The tabs a park shows, in order. Limited shows while a rotation or a past event has coins. */
export function visibleTabs(split: boolean, sightsCount: number, limitedCount: number, pastCount: number): ShelfTab[] {
  const tabs: ShelfTab[] = ['rides'];
  if (split && sightsCount > 0) tabs.push('sights');
  if (limitedCount > 0 || pastCount > 0) tabs.push('limited');
  return tabs;
}

/**
 * The tab a shelf slot lives on, so a coin landing or a coin link always opens
 * the tab that holds its slot: sights on Sights, limited and past events on
 * Limited, rides and secret coins on Rides.
 */
export function tabForSlot(section: 'normal' | 'limited' | 'secret' | 'archived', taskId: number,
  rideTaskIds: readonly number[] | null | undefined): ShelfTab {
  if (section === 'limited' || section === 'archived') return 'limited';
  if (section === 'secret') return 'rides';
  if (rideTaskIds?.length && !rideTaskIds.includes(taskId)) return 'sights';
  return 'rides';
}

/**
 * The tab a coin landing holds while the coin is still flying in. It holds only
 * until the coin lands (or the landing is closed): the shelf has already moved
 * to that tab, so after the landing every tab chip works again, even while the
 * "ON YOUR SHELF" chip is still up.
 */
export function landingTab(input: {
  readonly slot: { readonly section: 'normal' | 'limited' | 'secret' | 'archived'; readonly taskId: number } | null;
  readonly requestKey: string | null;
  readonly landedKey: string | null;
  readonly closedKey: string | null;
  readonly rideTaskIds: readonly number[] | null | undefined;
}): ShelfTab | null {
  if (!input.slot || !input.requestKey) return null;
  if (input.landedKey === input.requestKey || input.closedKey === input.requestKey) return null;
  return tabForSlot(input.slot.section, input.slot.taskId, input.rideTaskIds);
}

/** The tab on screen: the landing's tab while a coin flies in, otherwise the player's pick. */
export function shownShelfTab(picked: ShelfTab, tabs: readonly ShelfTab[], landing: ShelfTab | null): ShelfTab {
  if (landing && tabs.includes(landing)) return landing;
  return tabs.includes(picked) ? picked : 'rides';
}

/**
 * How long the shelf's first paint waits for today's park story. Never while a
 * won coin is landing (the landing never waits on a second request); otherwise
 * a short cap. A story that comes later sits below the shelf until the next
 * visit, so nothing ever jumps over the shelf under the thumb.
 */
export const RECAP_WAIT_MS = 350;
export function recapWaitMs(input: { readonly firstPaint: boolean; readonly ownShelf: boolean; readonly landing: boolean }): number {
  return input.firstPaint && input.ownShelf && !input.landing ? RECAP_WAIT_MS : 0;
}

/**
 * The secret coins the Rides tab shows. Coins you already won always stay on
 * the shelf; the unfound "?" outlines wait for coin levels (rung 3).
 */
export function visibleSecretSlots<T extends { readonly id: number }>(secret: readonly T[],
  owned: readonly { readonly id: number }[], coinLevelsOpen: boolean): T[] {
  if (coinLevelsOpen) return [...secret];
  const ids = new Set(owned.map(task => task.id));
  return secret.filter(task => ids.has(task.id));
}

export const TROPHIES = [
  { name: 'Bronze', at: 12 },
  { name: 'Silver', at: 50 },
  { name: 'Gold', at: 100 },
] as const;

/**
 * The next trophy. Trophies count every coin win at this park (a repeat win
 * counts too), which is the server's park_coins_count.
 */
export function nextTrophy(wins: number): { name: string; at: number; left: number } | null {
  const count = Math.max(0, Number(wins) || 0);
  const next = TROPHIES.find(trophy => count < trophy.at);
  return next ? { name: next.name, at: next.at, left: next.at - count } : null;
}

/**
 * "Bronze trophy: 9 of 12 wins". Trophies count wins, not coins, so the line
 * names its own unit and never reads like a second shelf count. The picture
 * beside it is the trophy itself (trophyIcon); the "repeats count too" idea
 * lives in TROPHY_HELP under the trophy shelf, in kid words.
 */
export function nextTrophyLine(wins: number): string {
  const count = Math.max(0, Number(wins) || 0);
  const next = nextTrophy(count);
  if (!next) return 'All three trophies are yours!';
  return `${next.name} trophy: ${count} of ${next.at} wins`;
}

/** The trophy shelf's help line. */
export const TROPHY_HELP = 'Every win counts, repeats too!';

/** The picture of the trophy you are working toward (gold once all three are yours). */
export function trophyIcon(wins: number): 'trophyBronze' | 'trophySilver' | 'trophy' {
  const next = nextTrophy(wins);
  if (next?.name === 'Bronze') return 'trophyBronze';
  if (next?.name === 'Silver') return 'trophySilver';
  return 'trophy';
}

/** The shelf quarter (0 to 4) a count reaches: 25, 50, 75 and 100 percent. */
export function shelfQuarter(collected: number, available: number): number {
  if (available <= 0) return 0;
  return Math.max(0, Math.min(4, Math.floor(collected / available * 4 + 1e-9)));
}

/** True when today's new coins carried the shelf past 25, 50, 75 or 100 percent. */
export function milestoneToday(totals: ShelfTotals, newCoinsToday: number): boolean {
  const today = Math.max(0, Number(newCoinsToday) || 0);
  if (!today || totals.available <= 0) return false;
  return shelfQuarter(totals.collected, totals.available) > shelfQuarter(totals.collected - today, totals.available);
}

/**
 * The park day story card waits on top of the shelf after a park day (you left
 * the park with a win today) and on milestone days. Otherwise it sits lower.
 */
export function storyOnTop(input: { atPark: boolean; ridesWonToday: number; milestone: boolean }): boolean {
  if (input.ridesWonToday <= 0) return false;
  return !input.atPark || input.milestone;
}

/** Parts held for a coin you have not won yet (the server's parts_waiting, when it sends it). */
export function partsWaiting(task: object): number {
  const value = Number((task as { parts_waiting?: unknown }).parts_waiting);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
