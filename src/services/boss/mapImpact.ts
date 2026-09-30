import type { BossId, BossRaid } from '../../api/endpoints/parks/raid';
import type { RideControlClaim, RideControlPark } from '../../api/endpoints/parks/rideControl';
import { isTeam, type TeamId } from '../../constants/teams';
import { gameTimestamp } from '../../screens/ExploreScreen/mapOpportunityTiming';

export interface BossMapImpact {
  readonly key: string;
  readonly playerId: number;
  readonly parkId: number;
  readonly raidId: number;
  readonly boss: BossId;
  readonly taskId: number;
  readonly rideName: string;
  readonly coordinate: { readonly latitude: number; readonly longitude: number };
  readonly yourDamage: number;
  readonly claim: RideControlClaim | null;
  /** The raid's top fighters, whose sharks pop up around the ride. */
  readonly fighters: readonly { readonly username: string; readonly team: TeamId | null; readonly you: boolean }[];
}

const id = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const teams: TeamId[] = ['mouse', 'globe', 'shark'];
/** Place the boss beside the landmark using a valid MapLibre anchor, keeping its art unobscured. */
export function bossDisplayCoordinate(coordinate: { latitude: number; longitude: number }) {
  if (Math.abs(coordinate.latitude) > 85) return coordinate;
  return { latitude: coordinate.latitude + 7 / 111320,
    longitude: coordinate.longitude + 12 / (111320 * Math.cos(coordinate.latitude * Math.PI / 180)) };
}
/**
 * The server's Ride Control claim from the MVP's reward receipt, validated. Two
 * kinds: a takeover (`flipped`, the flag is raised) and a hold (the MVP's team
 * already controlled the ride and the boss win added to it: "Held!").
 */
export function confirmedClaim(value: RideControlClaim | null | undefined, parkId: number): RideControlClaim | null {
  if (!value || value.park_id !== parkId || !id(value.asset_id) || typeof value.park_day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.park_day) ||
    typeof value.confirmed_at !== 'string' || gameTimestamp(value.confirmed_at) === null || typeof value.ride_name !== 'string' ||
    !isTeam(value.team) || value.controller !== value.team ||
    (value.previous_controller !== null && !isTeam(value.previous_controller)) ||
    typeof value.flipped !== 'boolean' ||
    (value.flipped ? value.previous_controller === value.team : value.previous_controller !== value.team) ||
    !id(value.points) || !teams.every(team => Number.isSafeInteger(value.scores?.[team]) && value.scores[team] >= 0)) return null;
  const scores = value.scores;
  if (scores[value.team] < value.points || teams.some(team => team !== value.team && scores[team] > scores[value.team]) ||
    (value.flipped && value.previous_controller && scores[value.previous_controller] >= scores[value.team])) return null;
  return value;
}

export type ClaimKind = 'raised' | 'held';
export function claimKind(claim: RideControlClaim | null | undefined): ClaimKind | null {
  return !claim ? null : claim.flipped ? 'raised' : 'held';
}

/** Only a settled, server-owned personal participation receipt creates this moment. */
export function createBossMapImpact(playerId: number, parkId: number, raid: BossRaid): BossMapImpact | null {
  if (!id(playerId) || !id(parkId) || !id(raid.id) || !id(raid.task_id) ||
    !['kraken', 'robo_shark', 'ghost_squid'].includes(raid.boss) || raid.status !== 'defeated' || raid.hp_left !== 0 ||
    raid.you?.reward?.outcome !== 'defeated' || !id(raid.you.attacks) || !id(raid.you.damage) ||
    raid.latitude === null || raid.longitude === null || !Number.isFinite(raid.latitude) || Math.abs(raid.latitude) > 90 ||
    !Number.isFinite(raid.longitude) || Math.abs(raid.longitude) > 180) return null;
  return { key: `boss-map-v1-${playerId}-${parkId}-${raid.id}`, playerId, parkId, raidId: raid.id,
    boss: raid.boss, taskId: raid.task_id, rideName: raid.ride_name || 'this ride',
    coordinate: { latitude: raid.latitude, longitude: raid.longitude }, yourDamage: raid.you.damage,
    claim: confirmedClaim(raid.ride_control, parkId),
    fighters: (Array.isArray(raid.top) ? raid.top : []).slice(0, 3)
      .filter(f => f && typeof f.username === 'string' && f.username.length > 0)
      .map(f => ({ username: f.username.slice(0, 24), team: isTeam(f.team) ? f.team : null, you: f.you === true })) };
}

/**
 * The flag appears when the server's claim still describes the map: same park
 * day, the ride is live today (not a carried hold) and the claimed team still
 * controls it. The claim itself is server-confirmed, so later points on the
 * same side never hide the moment; a loss or a day rollover does.
 */
export function verifiedBossFlag(impact: BossMapImpact, control: RideControlPark | null): RideControlClaim | null {
  const claim = impact.claim;
  if (!claim || !control || control.park_day !== claim.park_day) return null;
  const ride = control.rides.find(item => item.asset_id === claim.asset_id);
  if (!ride || ride.controller !== claim.team || ride.carried_over) return null;
  return claim;
}

export function isRideControlFrame(value: RideControlPark | null | undefined): value is RideControlPark {
  if (!value || typeof value.park_day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.park_day) || !Array.isArray(value.rides)) return false;
  const ids = new Set<number>();
  return value.rides.every(ride => {
    if (!ride || !id(ride.asset_id) || ids.has(ride.asset_id) || !isTeam(ride.controller) || typeof ride.carried_over !== 'boolean' ||
      !(ride.flipped_at === null || typeof ride.flipped_at === 'string' && gameTimestamp(ride.flipped_at) !== null) ||
      !teams.every(team => Number.isSafeInteger(ride.scores?.[team]) && ride.scores[team] >= 0)) return false;
    ids.add(ride.asset_id); return true;
  });
}

/** Same-day power only grows. An older replica must not roll a confirmed map backward. */
export function preferFreshRideControl(current: RideControlPark | null, incoming: RideControlPark): RideControlPark {
  if (!current) return incoming;
  if (current.park_day !== incoming.park_day) return incoming.park_day > current.park_day ? incoming : current;
  const newer = new Map(incoming.rides.map(ride => [ride.asset_id, ride]));
  if (current.rides.some(ride => {
    const next = newer.get(ride.asset_id);
    return !next || teams.some(team => next.scores[team] < ride.scores[team]) ||
      (gameTimestamp(next.flipped_at) ?? 0) < (gameTimestamp(ride.flipped_at) ?? 0);
  })) return current;
  return incoming;
}
