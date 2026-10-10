import client from '../../client';
import type { RideControlClaim } from './rideControl';

export type BossId = 'kraken' | 'robo_shark' | 'ghost_squid';
export type RaidTeamId = 'mouse' | 'globe' | 'shark';

export interface RaidReward {
  readonly outcome: 'defeated' | 'escaped';
  readonly coins: number;
  readonly xp: number;
  readonly energy: number;
  readonly parts: number;
  readonly tickets: number;
  /** Fought only from home: coins and XP at the remote rate, no Ride Parts. */
  readonly remote?: boolean;
}

/** The server's damage weights (config/boss.php). Weak-spot hits carry the fight. */
export interface RaidDamageWeights {
  readonly per_hit: number;
  readonly per_weak_hit: number;
  readonly weak_share: number;
  readonly participation_floor?: number;
  readonly participation_min_bonks?: number;
}

export interface BossRaid {
  readonly id: number;
  readonly boss: BossId;
  readonly task_id: number;
  readonly ride_name: string | null;
  /** Only sent to players checked in at this park. */
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly hp_max: number;
  readonly hp_left: number;
  readonly status: 'active' | 'defeated' | 'escaped';
  readonly starts_at: string;
  readonly ends_at: string;
  readonly fighters: number;
  readonly teams: Record<RaidTeamId, number>;
  readonly team_names?: Partial<Record<RaidTeamId, string>>;
  readonly feed: readonly { username: string; damage: number; team: string | null }[];
  readonly top: readonly { username: string; damage: number; you: boolean; team?: string | null }[];
  readonly mvp_is_you: boolean;
  readonly ride_control?: RideControlClaim | null;
  readonly you: {
    attacks: number; attacks_left: number; damage: number; reward: RaidReward | null;
    /** Each of your attacks in order, for the attack pips. */
    log?: readonly { damage: number; remote: boolean }[];
    acknowledged?: boolean;
  };
  readonly max_attacks?: number;
  readonly energy_cost: number;
  /** What a win pays before the home rate (newer servers; the app falls back to config defaults). */
  readonly rewards?: { coins: number; xp: number; energy: number; parts: number } | null;
  readonly reach_meters: number;
  readonly damage?: RaidDamageWeights;
  readonly remote: {
    readonly joined: boolean;
    readonly ticket_cost: number;
    readonly damage_rate: number;
    readonly reward_rate?: number;
    readonly fighters: number;
  };
}

export interface RaidState {
  readonly raid: BossRaid | null;
  readonly next_at: string | null;
}

export const DEFAULT_DAMAGE: RaidDamageWeights = { per_hit: 4, per_weak_hit: 40, weak_share: 3 };
export const DEFAULT_MAX_ATTACKS = 5;
/** Longest Boss Brawl the server accepts (config boss.rounds.max_ms). */
export const MAX_ROUND_MS = 21000;
export const MIN_ROUND_MS = 12000;

export async function getParkRaid(parkId: number): Promise<RaidState> {
  const { data } = await client.get<{ data: RaidState }>(`/parks/${parkId}/raid`);
  return data.data;
}

/** Why the server decided a player is not at the ride. */
export type PresenceReason = 'far' | 'not_checked_in' | 'jump' | 'no_location';

export interface RaidRound {
  readonly token: string;
  readonly remote: boolean;
  readonly reason: PresenceReason | null;
  readonly damage_rate: number;
  readonly max_ms: number;
  readonly max_hits: number;
}

export type RoundResult =
  | { ok: true; round: RaidRound }
  | { ok: false; error: 'too_far' | 'no_energy' | 'no_attacks_left' | 'raid_over' | 'no_remote_pass' | 'not_found' | 'network'; reason?: PresenceReason };

const ROUND_ERRORS = new Set(['too_far', 'no_energy', 'no_attacks_left', 'raid_over', 'no_remote_pass', 'not_found', 'damage_cap']);

/** FIGHT: ask the server for this round's token (and whether it counts as remote). */
export async function startRaidRound(raidId: number, body: { latitude?: number; longitude?: number; remote?: boolean }): Promise<RoundResult> {
  try {
    const { data } = await client.post<{ data: { round: RaidRound } }>(`/raids/${raidId}/rounds`, body);
    const round = data?.data?.round;
    if (!round || typeof round.token !== 'string' || !/^[a-f0-9]{16,64}$/.test(round.token) || typeof round.remote !== 'boolean') {
      return { ok: false, error: 'network' };
    }
    return { ok: true, round };
  } catch (e: any) {
    const payload = e?.response?.data?.data;
    if (ROUND_ERRORS.has(payload?.error)) return { ok: false, error: payload.error, reason: payload.reason ?? undefined };
    return { ok: false, error: 'network' };
  }
}

export type AttackResult =
  | { ok: true; damage: number; state: RaidState }
  | { ok: false; error: 'too_far' | 'no_energy' | 'no_attacks_left' | 'bad_proof' | 'bad_round' | 'raid_over' | 'no_remote_pass' | 'not_found' | 'damage_cap' | 'network'; state?: RaidState };

export interface RaidAttackBody {
  client_request_id: string; latitude?: number; longitude?: number; hits: number; weak_hits: number; duration_ms: number;
  remote?: boolean;
  round_token?: string;
}

const ATTACK_ERRORS = new Set(['too_far', 'no_energy', 'no_attacks_left', 'bad_proof', 'bad_round', 'raid_over', 'no_remote_pass', 'not_found', 'damage_cap']);

function isState(result: any): boolean {
  return !!result && Object.prototype.hasOwnProperty.call(result, 'raid') && (result.raid === null ||
    (Number.isSafeInteger(result.raid?.id) && !!result.raid?.you && !!result.raid?.teams));
}

export async function attackRaid(raidId: number, body: RaidAttackBody): Promise<AttackResult> {
  try {
    const { data } = await client.post<{ data: RaidState & { damage: number } }>(`/raids/${raidId}/attack`, body);
    const result = data?.data;
    if (!result || !Number.isSafeInteger(result.damage) || result.damage < 0 || !isState(result)) {
      return { ok: false, error: 'network' }; // A malformed reply cannot retire the original proof.
    }
    return { ok: true, damage: result.damage, state: result };
  } catch (e: any) {
    const payload = e?.response?.data?.data;
    if (ATTACK_ERRORS.has(payload?.error)) return { ok: false, error: payload.error, state: payload.raid !== undefined ? payload : undefined };
    // A request the server validated and refused (422 without a game error, e.g. a
    // saved round from an older build) will never succeed: retire it instead of
    // blocking every future attack. Transport and 5xx errors stay retryable.
    if (e?.response?.status === 422) return { ok: false, error: 'bad_proof' };
    return { ok: false, error: 'network' };
  }
}

export type LookupResult =
  | { ok: true; found: boolean; damage: number | null; raidActive: boolean; state: RaidState }
  | { ok: false };

/** Did this saved round count? Used when a confirmation keeps failing. */
export async function lookupRaidAttack(raidId: number, clientRequestId: string): Promise<LookupResult> {
  try {
    const { data } = await client.get<{ data: RaidState & { found: boolean; damage: number | null; raid_active: boolean } }>(
      `/raids/${raidId}/attacks/${encodeURIComponent(clientRequestId)}`);
    const result = data?.data;
    if (!result || typeof result.found !== 'boolean' || typeof result.raid_active !== 'boolean' || !isState(result) ||
      (result.found && (!Number.isSafeInteger(result.damage) || (result.damage as number) < 0))) return { ok: false };
    return { ok: true, found: result.found, damage: result.damage, raidActive: result.raid_active, state: result };
  } catch {
    return { ok: false };
  }
}

/** The app showed this raid's result; the server stops offering it as a missed win. */
export async function acknowledgeRaid(raidId: number): Promise<boolean> {
  try {
    await client.post(`/raids/${raidId}/ack`, {});
    return true;
  } catch {
    return false;
  }
}

export const BOSS_NAMES: Record<BossId, string> = {
  kraken: 'The Kraken',
  robo_shark: 'Robo-Shark',
  ghost_squid: 'Ghost Squid',
};

/**
 * Fit a finished brawl's report to the round the server issued: play time within
 * [min_ms, max_ms], hits within the per-boss cap and weak hits within the one-in-N share,
 * so an honest round never comes back as bad_proof.
 */
export function fitToRound(
  meta: { hits: number; weak_hits: number; duration_ms: number },
  round: Pick<RaidRound, 'max_ms' | 'max_hits'> | null | undefined,
  weights: RaidDamageWeights = DEFAULT_DAMAGE,
  minMs = 12000,
): { hits: number; weak_hits: number; duration_ms: number } {
  const whole = (n: unknown) => (Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0);
  const maxMs = round && round.max_ms > 0 ? round.max_ms : 21000;
  const duration_ms = Math.min(maxMs, Math.max(minMs, whole(meta.duration_ms)));
  const hits = round && round.max_hits > 0 ? Math.min(round.max_hits, whole(meta.hits)) : whole(meta.hits);
  const weak_hits = Math.min(whole(meta.weak_hits), Math.floor(hits / Math.max(1, weights.weak_share)));
  return { hits, weak_hits, duration_ms };
}

/** The server's damage formula with the raid's weights (rounded once after the remote rate). */
export function raidDamage(hits: number, weak: number, weights: RaidDamageWeights = DEFAULT_DAMAGE, rate = 1): number {
  return Math.floor((hits * weights.per_hit + weak * weights.per_weak_hit) * rate);
}
