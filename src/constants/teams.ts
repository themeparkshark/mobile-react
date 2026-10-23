export type TeamId = 'mouse' | 'globe' | 'shark';

/**
 * The one team table for the whole app: colours match the badge art and the
 * server (PlayerTeam::TEAM_COLORS). Screens import from here and never keep
 * their own copy.
 */
/*
 * IP safety (Oct 23 2026): "Team Mouse" and "Team Globe" read as two famous
 * park brands, so players see the shield colors instead: Team Gold and Team
 * Green. The ids stay 'mouse' and 'globe' (the server and saved data use them).
 * New badge art for both is Dustin's call (his GPT Image pipeline from Alex's
 * references); until then the shields keep their colors, which match the names.
 */
export const TEAMS: Record<TeamId, { name: string; color: string; badge: number }> = {
  mouse: { name: 'Team Gold', color: '#F59E0B', badge: require('../../assets/images/teams/mouse-small.png') },
  globe: { name: 'Team Green', color: '#22C55E', badge: require('../../assets/images/teams/globe-small.png') },
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

type TeamNames = Partial<Record<TeamId, string>> | null | undefined;
/** The old look-alike names a server still sends by default: never shown; the app's own names win. */
const RETIRED_NAMES = /^(?:team\s+)?(?:mouse|globe)$/i;
const clean = (value: unknown) => (typeof value === 'string' && value.trim() && value.trim().length <= 40
  && !RETIRED_NAMES.test(value.trim()) ? value.trim() : null);

/** Remember the newest server names for surfaces without a payload of their own. Call from an effect, not render. */
export function applyTeamNames(names: unknown): void {
  if (!names || typeof names !== 'object') return;
  for (const team of TEAM_ORDER) {
    const value = clean((names as Record<string, unknown>)[team]);
    if (value) overrides[team] = value;
  }
}

/** "Team Gold", or the name from this payload's team_names, or the newest server name seen. */
export function teamName(team: TeamId, names?: TeamNames): string {
  return clean(names?.[team]) ?? overrides[team] ?? TEAMS[team].name;
}

/** "Gold": the name without its "Team " prefix, for tight chips. */
export function teamShortName(team: TeamId, names?: TeamNames): string {
  return teamName(team, names).replace(/^Team\s+/i, '');
}
