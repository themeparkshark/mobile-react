import client from '../../client';

export type BossId = 'kraken' | 'robo_shark' | 'ghost_squid';

export interface RaidReward {
  readonly outcome: 'defeated' | 'escaped';
  readonly coins: number;
  readonly xp: number;
  readonly energy: number;
  readonly parts: number;
  readonly tickets: number;
}

export interface BossRaid {
  readonly id: number;
  readonly boss: BossId;
  readonly task_id: number;
  readonly ride_name: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly hp_max: number;
  readonly hp_left: number;
  readonly status: 'active' | 'defeated' | 'escaped';
  readonly starts_at: string;
  readonly ends_at: string;
  readonly fighters: number;
  readonly teams: Record<'mouse' | 'globe' | 'shark', number>;
  readonly feed: readonly { username: string; damage: number; team: string | null }[];
  readonly top: readonly { username: string; damage: number; you: boolean }[];
  readonly mvp_is_you: boolean;
  readonly you: { attacks: number; attacks_left: number; damage: number; reward: RaidReward | null };
  readonly energy_cost: number;
  readonly reach_meters: number;
  readonly remote: {
    readonly joined: boolean;
    readonly ticket_cost: number;
    readonly damage_rate: number;
    readonly fighters: number;
  };
}

export interface RaidState {
  readonly raid: BossRaid | null;
  readonly next_at: string | null;
}

export async function getParkRaid(parkId: number): Promise<RaidState> {
  const { data } = await client.get<{ data: RaidState }>(`/parks/${parkId}/raid`);
  return data.data;
}

export type AttackResult =
  | { ok: true; damage: number; state: RaidState }
  | { ok: false; error: 'too_far' | 'no_energy' | 'no_attacks_left' | 'bad_proof' | 'raid_over' | 'no_remote_pass' | 'not_found' | 'network'; state?: RaidState };

export interface RaidAttackBody {
  client_request_id: string; latitude: number; longitude: number; hits: number; weak_hits: number; duration_ms: number;
  remote?: boolean;
}

const ATTACK_ERRORS = new Set(['too_far', 'no_energy', 'no_attacks_left', 'bad_proof', 'raid_over', 'no_remote_pass', 'not_found']);

export async function attackRaid(raidId: number, body: RaidAttackBody): Promise<AttackResult> {
  try {
    const { data } = await client.post<{ data: RaidState & { damage: number } }>(`/raids/${raidId}/attack`, body);
    const result = data?.data;
    if (!result || !Number.isSafeInteger(result.damage) || result.damage < 0 ||
      !Object.prototype.hasOwnProperty.call(result, 'raid') || (result.raid !== null &&
        (!Number.isSafeInteger(result.raid?.id) || !result.raid?.you || !result.raid?.teams))) {
      return { ok: false, error: 'network' }; // A malformed reply cannot retire the original proof.
    }
    return { ok: true, damage: result.damage, state: result };
  } catch (e: any) {
    const payload = e?.response?.data?.data;
    if (ATTACK_ERRORS.has(payload?.error)) return { ok: false, error: payload.error, state: payload.raid !== undefined ? payload : undefined };
    return { ok: false, error: 'network' };
  }
}

export const BOSS_NAMES: Record<BossId, string> = {
  kraken: 'The Kraken',
  robo_shark: 'Robo-Shark',
  ghost_squid: 'Ghost Squid',
};
