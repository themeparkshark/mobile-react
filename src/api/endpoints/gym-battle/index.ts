import api from '../../client';
import { arenaLocation } from './arenaLocation';
import { badShapeError, isCoordinate, isRecord } from '../../jsonGuard';

// Re-export getMyParkCoins
export { getMyParkCoins, type ParkCoin } from './getMyParkCoins';

// ============ TEAMS ============

export interface TeamInfo {
  has_team: boolean;
  team: 'mouse' | 'globe' | 'shark' | null;
  team_name?: string;
  team_emoji?: string;
  team_color?: string;
  joined_at?: string;
}

export async function getMyTeam(): Promise<TeamInfo> {
  const response = await api.get('/me/team');
  if (!isRecord(response.data)) throw badShapeError('/me/team');
  return response.data as unknown as TeamInfo;
}

export async function joinTeam(team: 'mouse' | 'globe' | 'shark'): Promise<{
  success: boolean;
  team: string;
  team_name: string;
  team_emoji: string;
  team_color: string;
}> {
  const response = await api.post('/teams/join', { team });
  return response.data;
}

export interface TeamStanding {
  team: string;
  name: string;
  emoji: string;
  color: string;
  player_count: number;
  weekly_wins: number;
}

export async function getTeamStandings(): Promise<{
  standings: TeamStanding[];
  week_start: string;
}> {
  const response = await api.get('/teams/standings');
  return response.data;
}

// ============ GYMS ============

export interface GymData {
  gym: {
    id: number;
    name: string;
    park_id: number;
    latitude: number;
    longitude: number;
  };
  scores: {
    mouse: number;
    globe: number;
    shark: number;
  };
  leader: 'mouse' | 'globe' | 'shark' | null;
  lead_margin: number;
  player: {
    team: 'mouse' | 'globe' | 'shark';
    team_emoji: string;
    has_placed_today: boolean;
    can_checkin: boolean;
    seconds_until_checkin: number;
    can_defend: boolean;
    seconds_until_defend: number;
    today_contribution: number;
    swords: number;
    can_attack: boolean;
    seconds_until_attack: number;
    sword_cost_to_attack: number;
    is_winning: boolean;
    is_underdog: boolean;
  };
  teammates_here: number;
  battle_status?: {
    is_active: boolean;
    seconds_until_next_event: number;
    next_event: 'ends' | 'starts';
    battle_start_hour: number;
    battle_end_hour: number;
    current_hour: number;
    timezone: string;
  };
}

export async function getGym(parkId: number): Promise<GymData> {
  const response = await api.get(`/parks/${parkId}/gym`);
  // The map reads gym.latitude while rendering: no gym, no marker, no crash.
  const gym = isRecord(response.data) ? response.data.gym : undefined;
  if (!isRecord(gym) || !isCoordinate(gym.latitude) || !isCoordinate(gym.longitude)) {
    throw badShapeError('gym');
  }
  return response.data as unknown as GymData;
}

export async function placeCoin(parkId: number, assetId: number): Promise<{
  success: boolean;
  message: string;
  points_added: number;
}> {
  const response = await api.post(`/parks/${parkId}/gym/place`, { asset_id: assetId, ...await arenaLocation() });
  return response.data;
}

export async function checkinGym(parkId: number, taps: number = 0): Promise<{
  success: boolean;
  message: string;
  points_earned: number;
}> {
  const response = await api.post(`/parks/${parkId}/gym/checkin`, { taps, ...await arenaLocation() });
  return response.data;
}

export async function defendGym(parkId: number, taps: number): Promise<{
  success: boolean;
  message: string;
  points_earned: number;
}> {
  const response = await api.post(`/parks/${parkId}/gym/defend`, { taps, ...await arenaLocation() });
  return response.data;
}

export async function attackGym(parkId: number, targetTeam: 'mouse' | 'globe' | 'shark'): Promise<{
  success: boolean;
  message: string;
  damage: number;
  target_team: string;
  swords_remaining: number;
}> {
  const response = await api.post(`/parks/${parkId}/gym/attack`, { target_team: targetTeam, ...await arenaLocation() });
  return response.data;
}

// ============ SWORDS ============

export interface SwordSpawn {
  id: number;
  latitude: number;
  longitude: number;
  expires_at: string;
  seconds_remaining: number;
}

export async function getSwords(parkId: number): Promise<{
  swords: SwordSpawn[];
  count: number;
}> {
  const response = await api.get(`/parks/${parkId}/swords`);
  // The map spreads swords into its markers while rendering, so only real
  // spawns with coordinates get through.
  const swords = isRecord(response.data) && Array.isArray(response.data.swords)
    ? (response.data.swords as unknown[]).filter((spawn): spawn is SwordSpawn =>
      isRecord(spawn) && isCoordinate(spawn.latitude) && isCoordinate(spawn.longitude))
    : null;
  if (!swords) throw badShapeError('swords');
  return { ...(response.data as Record<string, unknown>), swords, count: swords.length };
}

export async function claimSword(spawnId: number): Promise<{
  success: boolean;
  message: string;
  total_swords: number;
}> {
  const response = await api.post(`/swords/${spawnId}/claim`);
  return response.data;
}

export async function getMySwords(): Promise<{ swords: number }> {
  const response = await api.get('/me/swords');
  return response.data;
}
