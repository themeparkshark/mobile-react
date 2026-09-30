export type TeamId = 'mouse' | 'globe' | 'shark';

/**
 * The one team table for the whole app: colours match the badge art and the
 * server (PlayerTeam::TEAM_COLORS). Screens import from here and never keep
 * their own copy.
 */
export const TEAMS: Record<TeamId, { name: string; color: string; badge: number }> = {
  mouse: { name: 'Team Mouse', color: '#F59E0B', badge: require('../../assets/images/teams/mouse-small.png') },
  globe: { name: 'Team Globe', color: '#22C55E', badge: require('../../assets/images/teams/globe-small.png') },
  shark: { name: 'Team Shark', color: '#3B82F6', badge: require('../../assets/images/teams/shark-small.png') },
};

export const TEAM_ORDER: readonly TeamId[] = ['mouse', 'globe', 'shark'];

export function isTeam(value: unknown): value is TeamId {
  return value === 'mouse' || value === 'globe' || value === 'shark';
}

/**
 * Display names can be renamed on the server (config/teams.php, trademark
 * review) and arrive as `team_names` on raid, ride-control and live-parks
 * payloads. The newest names seen win; ids never change.
 */
const overrides: Partial<Record<TeamId, string>> = {};

export function applyTeamNames(names: unknown): void {
  if (!names || typeof names !== 'object') return;
  for (const team of TEAM_ORDER) {
    const value = (names as Record<string, unknown>)[team];
    if (typeof value === 'string' && value.trim() && value.trim().length <= 40) overrides[team] = value.trim();
  }
}

/** "Team Mouse" (or its server override). */
export function teamName(team: TeamId): string {
  return overrides[team] ?? TEAMS[team].name;
}

/** "Mouse": the name without its "Team " prefix, for tight chips. */
export function teamShortName(team: TeamId): string {
  return teamName(team).replace(/^Team\s+/i, '');
}
