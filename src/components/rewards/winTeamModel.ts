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
