export type TeamId = 'mouse' | 'globe' | 'shark';

export const TEAMS: Record<TeamId, { name: string; color: string; badge: number }> = {
  mouse: { name: 'Team Mouse', color: '#F59E0B', badge: require('../../assets/images/teams/mouse-small.png') },
  globe: { name: 'Team Globe', color: '#22C55E', badge: require('../../assets/images/teams/globe-small.png') },
  shark: { name: 'Team Shark', color: '#3B82F6', badge: require('../../assets/images/teams/shark-small.png') },
};

export function isTeam(value: unknown): value is TeamId {
  return value === 'mouse' || value === 'globe' || value === 'shark';
}
