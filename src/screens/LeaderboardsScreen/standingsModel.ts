/**
 * Standings logic (WS8). Pure, so it is unit tested
 * (tools/tests/standings-model.test.cjs).
 *
 * The screens used to wait for a leaderboard id and a non-empty player list
 * before they cleared the spinner, so a park with no leaderboard or no players
 * spun forever. Every load now ends in one of three states: ready (with 0 to N
 * players), empty (nothing to rank yet) or error (retry).
 */
import dayjs from 'dayjs';

export type StandingsStatus = 'loading' | 'ready' | 'empty' | 'error';

export type PodiumSlots<T> = {
  /** Index 0 = rank 1, 1 = rank 2, 2 = rank 3. Missing places are null (open spots). */
  readonly podium: readonly [T | null, T | null, T | null];
  /** Everyone from rank 4 down. */
  readonly rest: readonly T[];
  readonly count: number;
};

/** Split a ranked list into the three podium places and the list below. */
export function podiumSlots<T>(players: readonly T[] | null | undefined): PodiumSlots<T> {
  const list = Array.isArray(players) ? players : [];
  return {
    podium: [list[0] ?? null, list[1] ?? null, list[2] ?? null],
    rest: list.slice(3),
    count: list.length,
  };
}

/** Which state a finished load lands in. */
export function standingsStatus(result: { readonly players?: readonly unknown[] | null; readonly failed?: boolean }): StandingsStatus {
  if (result.failed) return 'error';
  return result.players && result.players.length > 0 ? 'ready' : 'empty';
}

/**
 * The park the Standings open on: the park the player is standing in, then the
 * park the server last saw them at, then the first park that exists. A choice
 * the player made on this screen always wins.
 */
export function defaultStandingsPark(options: {
  readonly chosenParkId?: number | null;
  readonly locationParkId?: number | null;
  readonly playerParkId?: number | null;
  readonly parkIds: readonly number[];
}): number | undefined {
  const known = (id?: number | null) => typeof id === 'number' && id > 0
    && (options.parkIds.length === 0 || options.parkIds.includes(id));
  if (known(options.chosenParkId)) return options.chosenParkId as number;
  if (known(options.locationParkId)) return options.locationParkId as number;
  if (known(options.playerParkId)) return options.playerParkId as number;
  return options.parkIds[0];
}

/** The all-time board when there is one, otherwise the longest window. */
export function pickDefaultLeaderboard<T extends { readonly id: number; readonly duration_text?: string | null; readonly duration?: number | null }>(
  leaderboards: readonly T[] | null | undefined,
): number | undefined {
  const list = Array.isArray(leaderboards) ? leaderboards : [];
  if (!list.length) return undefined;
  const allTime = list.find(board => /all[\s-]?time/i.test(board.duration_text ?? ''));
  if (allTime) return allTime.id;
  return [...list].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0].id;
}

/** "2026-09-29" -> "Tuesday, September 29". Anything unparseable falls back to "today". */
export function formatParkDay(parkDay: string | null | undefined): string {
  if (!parkDay || !/^\d{4}-\d{2}-\d{2}/.test(parkDay)) return 'today';
  const day = dayjs(parkDay.slice(0, 10));
  return day.isValid() ? day.format('dddd, MMMM D') : 'today';
}

/**
 * VIP-neutral Experience standings (Dustin decides; see WS7). Off by default,
 * which keeps today's behaviour: rank by total_experience. When the flag is on
 * and the server sends base_total_experience (XP before the VIP multiplier),
 * that is the number shown.
 */
export const VIP_NEUTRAL_STANDINGS_DEFAULT = false;

export function vipNeutralStandingsEnabled(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.EXPO_PUBLIC_VIP_NEUTRAL_STANDINGS;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return VIP_NEUTRAL_STANDINGS_DEFAULT;
}

export function experienceScore(
  player: { readonly total_experience?: number | null; readonly base_total_experience?: number | null },
  vipNeutral: boolean,
): number {
  if (vipNeutral && typeof player.base_total_experience === 'number') return player.base_total_experience;
  return Number(player.total_experience) || 0;
}

export type RideMetric = 'today' | 'collection' | 'mastery' | 'masters';

/** Copy for the Rides tab: the line under the pills, the empty state and the score unit. */
export function rideMetricCopy(metric: RideMetric, parkDay: string | null | undefined, available: number) {
  if (metric === 'today') {
    return {
      caption: `Ride wins on ${formatParkDay(parkDay)}`,
      emptyTitle: 'Be the first on the podium',
      emptyMessage: 'Nobody has won a ride here today. Win one ride challenge to take first place.',
      unit: 'rides today',
      detail: 'Ride challenge wins',
    };
  }
  if (metric === 'collection') {
    return {
      caption: available > 0 ? `Ride coins collected here, ${available} to find` : 'Ride coins collected here',
      emptyTitle: 'Be the first on the podium',
      emptyMessage: 'Nobody has a ride coin from this park yet. Win a ride challenge to claim the top spot.',
      unit: 'ride coins',
      detail: 'Ride coins collected',
    };
  }
  if (metric === 'masters') {
    // Ride Masters (progression v2): crowns first, then Ride Boss clears, polish, levels.
    return {
      caption: 'Ride Masters: Level 10 coins crowned at this park',
      emptyTitle: 'Be the first Ride Master',
      emptyMessage: 'Nobody has crowned a ride coin here yet. Level a favorite ride to 10 to take the top spot.',
      unit: 'crowns',
      detail: 'Crowned coins',
    };
  }
  return {
    caption: 'Coin levels upgraded at this park',
    emptyTitle: 'Be the first on the podium',
    emptyMessage: 'Nobody has upgraded a ride coin here yet. Replay a ride you own to level it up.',
    unit: 'levels',
    detail: 'Coin upgrade levels',
  };
}

export const STANDINGS_EMPTY_COPY = {
  coins: {
    title: 'Be the first on the podium',
    message: 'Nobody has earned coins at this park yet. Win a ride challenge to take first place.',
    action: 'Find a ride',
  },
  xp: {
    title: 'Be the first on the podium',
    message: 'Play ride challenges and queue games to earn XP and claim the top spot.',
    action: 'Start playing',
  },
} as const;
