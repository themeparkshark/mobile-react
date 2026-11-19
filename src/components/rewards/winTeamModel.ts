/**
 * The in-card team step's words and rules (fix round W3, T034), pure.
 * Same three crews and vibes as the team screen.
 */
import type { TeamId } from '../../constants/teams';

export const TEAM_STEP_ORDER: readonly TeamId[] = ['mouse', 'globe', 'shark'];
export const TEAM_STEP_VIBE: Readonly<Record<TeamId, string>> = {
  mouse: 'The planners. A plan for every ride.',
  globe: 'The explorers. Every land, every snack.',
  shark: 'The thrill crew. Biggest drops first.',
};

/** A retried join the server already counted ("already on this team") is a join. */
export function teamJoinOutcome(error: unknown, team: TeamId): 'joined' | 'error' {
  const current = (error as { response?: { data?: { current_team?: unknown } } } | null)?.response?.data?.current_team;
  return current === team ? 'joined' : 'error';
}

/**
 * Whether this win's card carries the team step: a new coin, no team yet (the server's needs_team) and never
 * offered on this phone before. Not only the first coin ever: a player who skipped it on their first coin, or
 * whose first coin's card was lost, still gets it once, on the next new coin (fix W3 T034).
 */
export function wantsWinTeamStep(input: { needsTeam: boolean; isNewCoin: boolean; offeredBefore: boolean }): boolean {
  return input.needsTeam && input.isNewCoin && !input.offeredBefore;
}

/** One coin the server counted for the new team when the player joined (fix w3 T194, core-loop builds). */
export interface TeamJoinCredit {
  readonly ride_name?: string | null;
  readonly points?: number | null;
  readonly team?: string | null;
  readonly first?: boolean | null;
}

/**
 * The line after joining when coins won before the pick now count for the new team (fix w4 T194):
 * "Your Mr. Lincoln coin counts for Team Green too!", or "Your 2 coins from today count for Team Green too!".
 * Null when the join answer has no ride_control_credit (older servers, or nothing to credit): today's
 * team screen words then stay as they are.
 */
export function teamCreditLine(credits: readonly TeamJoinCredit[] | null | undefined, teamLabel: string): string | null {
  if (!Array.isArray(credits)) return null;
  const counted = credits.filter(credit => credit && Number(credit.points) > 0);
  if (!counted.length) return null;
  if (counted.length === 1) {
    const ride = typeof counted[0].ride_name === 'string' ? counted[0].ride_name.trim() : '';
    return ride ? `Your ${ride} coin counts for ${teamLabel} too!` : `Your coin from today counts for ${teamLabel} too!`;
  }
  return `Your ${counted.length} coins from today count for ${teamLabel} too!`;
}
