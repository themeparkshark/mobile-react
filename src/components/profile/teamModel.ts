import { isTeam, type TeamId } from '../../constants/teams';

/**
 * The player's team from any player payload. /me loads the `team` relation
 * ({ team: 'shark', ... }); some payloads send the bare id. Anything else
 * (no team yet, an older server, another player's page without it) is null.
 */
export function playerTeamId(player: unknown): TeamId | null {
  const raw = (player as { team?: unknown } | null | undefined)?.team;
  if (isTeam(raw)) return raw;
  const nested = (raw as { team?: unknown } | null | undefined)?.team;
  return isTeam(nested) ? nested : null;
}

/** What the identity row shows: your team, a "Pick your team" nudge (own profile only), or nothing. */
export function teamSlot(team: TeamId | null, own: boolean): 'team' | 'pick' | 'none' {
  if (team) return 'team';
  return own ? 'pick' : 'none';
}
