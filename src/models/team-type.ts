/**
 * Team types for Gym Battles
 */

export type TeamId = 'mouse' | 'globe' | 'shark';

export interface Team {
  id: TeamId;
  name: string;
  emoji: string;
  color: string;
  tagline: string;
}

export const TEAMS: Record<TeamId, Team> = {
  mouse: {
    id: 'mouse',
    name: 'Team Mouse',
    emoji: '🐭',
    color: '#3B82F6',
    tagline: 'The magic is in the details',
  },
  globe: {
    id: 'globe',
    name: 'Team Globe',
    emoji: '🌍',
    color: '#EF4444',
    tagline: 'Thrill seekers unite',
  },
  shark: {
    id: 'shark',
    name: 'Team Shark',
    emoji: '🦈',
    color: '#F59E0B',
    tagline: 'We play ALL the parks',
  },
};

export const getTeam = (id: TeamId): Team => TEAMS[id];
export const getTeamColor = (id: TeamId): string => TEAMS[id].color;
export const getTeamEmoji = (id: TeamId): string => TEAMS[id].emoji;
export const getTeamName = (id: TeamId): string => TEAMS[id].name;
