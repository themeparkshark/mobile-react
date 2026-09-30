import AsyncStorage from '@react-native-async-storage/async-storage';
import { attackRaid, lookupRaidAttack, type AttackResult, type BossId, type LookupResult, type RaidAttackBody } from '../../api/endpoints/parks/raid';

export interface BossAttackCheckpoint {
  readonly version: 1;
  readonly playerId: number;
  readonly parkId: number;
  readonly raidId: number;
  readonly boss: BossId;
  readonly rideName: string | null;
  readonly savedAt: number;
  readonly body: Readonly<RaidAttackBody>;
}

export interface BossAttackSnapshot {
  readonly loaded: boolean;
  readonly phase: 'loading' | 'ready' | 'saving' | 'sending' | 'unconfirmed' | 'storage_error';
  readonly pending: BossAttackCheckpoint | null;
  readonly receipt: { readonly checkpoint: BossAttackCheckpoint; readonly result: AttackResult } | null;
}

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;
type Entry = {
  snapshot: BossAttackSnapshot;
  persisted: boolean;
  loading?: Promise<void>;
  operation?: Promise<void>;
  listeners: Set<() => void>;
};
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
export const bossAttackKey = (playerId: number, parkId: number) => `boss_attack_v1_${playerId}_${parkId}`;

/** A saved round never expires locally: a lost reply may already have spent Energy.
 * The server checks this exact request's receipt before checking raid expiry. */
export function parseBossAttack(raw: string, playerId: number, parkId: number): BossAttackCheckpoint {
  const value = JSON.parse(raw) as BossAttackCheckpoint;
  const body = value?.body;
  const hasLocation = body?.latitude !== undefined || body?.longitude !== undefined;
  if (value?.version !== 1 || value.playerId !== playerId || value.parkId !== parkId ||
    !positiveId(playerId) || !positiveId(parkId) || !positiveId(value.raidId) ||
    !['kraken', 'robo_shark', 'ghost_squid'].includes(value.boss) ||
    (value.rideName !== null && typeof value.rideName !== 'string') ||
    !Number.isFinite(value.savedAt) || value.savedAt <= 0 ||
    !body || !/^[A-Za-z0-9-]{16,64}$/.test(body.client_request_id) ||
    // No GPS fix is allowed (a remote round); a fix must be a real coordinate.
    (hasLocation && (!Number.isFinite(body.latitude) || Math.abs(body.latitude as number) > 90 ||
      !Number.isFinite(body.longitude) || Math.abs(body.longitude as number) > 180)) ||
    // Older builds saved up to 26s; the server refuses those as a bad proof, which retires them.
    !Number.isInteger(body.duration_ms) || body.duration_ms < 12000 || body.duration_ms > 26000 ||
    !Number.isInteger(body.hits) || body.hits <= 0 || body.hits > Math.floor(body.duration_ms / 1000 * 7) ||
    !Number.isInteger(body.weak_hits) || body.weak_hits < 0 || body.weak_hits > Math.floor(body.hits / 3) ||
    (body.round_token !== undefined && (typeof body.round_token !== 'string' || !/^[a-f0-9]{16,64}$/.test(body.round_token))) ||
    (body.remote !== undefined && typeof body.remote !== 'boolean')) {
    throw new Error('Invalid saved boss attack');
  }
  // Only the original, validated proof is retried. Never merge fresh GPS or a new pass choice.
  return Object.freeze({ version: 1, playerId, parkId, raidId: value.raidId, boss: value.boss,
    rideName: value.rideName, savedAt: value.savedAt, body: Object.freeze({
      client_request_id: body.client_request_id,
      ...(hasLocation ? { latitude: body.latitude, longitude: body.longitude } : {}),
      hits: body.hits, weak_hits: body.weak_hits, duration_ms: body.duration_ms,
      ...(body.round_token === undefined ? {} : { round_token: body.round_token }),
      ...(body.remote === undefined ? {} : { remote: body.remote }),
    }) });
}

/** Shared by Home and Explore, so two sheets cannot submit or replace one pending round. */
export class BossAttackRecovery {
  private entries = new Map<string, Entry>();
  constructor(private storage: Storage = AsyncStorage,
    private attack: (raidId: number, body: RaidAttackBody) => Promise<AttackResult> = attackRaid,
    private lookup: (raidId: number, clientRequestId: string) => Promise<LookupResult> = lookupRaidAttack) {}

  private entry(playerId: number, parkId: number): Entry {
    const key = bossAttackKey(playerId, parkId);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { snapshot: { loaded: false, phase: 'loading', pending: null, receipt: null },
        persisted: false, listeners: new Set() };
      this.entries.set(key, entry);
    }
    return entry;
  }
  snapshot(playerId: number, parkId: number) { return this.entry(playerId, parkId).snapshot; }
  subscribe(playerId: number, parkId: number, listener: () => void): () => void {
    const entry = this.entry(playerId, parkId);
    entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); };
  }
  private publish(entry: Entry, patch: Partial<BossAttackSnapshot>) {
    entry.snapshot = { ...entry.snapshot, ...patch };
    entry.listeners.forEach(listener => {
      try { listener(); } catch { /* A detached observer cannot interrupt receipt persistence. */ }
    });
  }

  load(playerId: number, parkId: number): Promise<void> {
    const entry = this.entry(playerId, parkId);
    if (entry.loading) return entry.loading;
    if (entry.snapshot.loaded) return Promise.resolve();
    this.publish(entry, { phase: 'loading' });
    entry.loading = (async () => {
      try {
        const raw = await this.storage.getItem(bossAttackKey(playerId, parkId));
        const pending = raw === null ? null : parseBossAttack(raw, playerId, parkId);
        entry.persisted = pending !== null;
        this.publish(entry, { loaded: true, pending, phase: pending ? 'unconfirmed' : 'ready' });
      } catch {
        // Do not treat unavailable/corrupt storage as proof there is no paid attack.
        this.publish(entry, { phase: 'storage_error' });
      }
    })().finally(() => { entry.loading = undefined; });
    return entry.loading;
  }

  capture(checkpoint: BossAttackCheckpoint, maySubmit: () => boolean): Promise<void> {
    const entry = this.entry(checkpoint.playerId, checkpoint.parkId);
    if (entry.operation) return entry.operation;
    if (!entry.snapshot.loaded || entry.snapshot.pending || !maySubmit()) return Promise.resolve();
    let pending: BossAttackCheckpoint;
    try { pending = parseBossAttack(JSON.stringify(checkpoint), checkpoint.playerId, checkpoint.parkId); }
    catch (error) { return Promise.reject(error); }
    entry.persisted = false;
    // This synchronous reservation prevents rapid claim taps from creating two requests.
    this.publish(entry, { pending, receipt: null, phase: 'saving' });
    return this.run(entry, maySubmit);
  }

  async retry(playerId: number, parkId: number, maySubmit: () => boolean): Promise<void> {
    const entry = this.entry(playerId, parkId);
    if (entry.operation) return entry.operation;
    await this.load(playerId, parkId);
    if (entry.operation) return entry.operation;
    if (!entry.snapshot.loaded || !entry.snapshot.pending || !maySubmit()) return;
    return this.run(entry, maySubmit);
  }

  /**
   * A confirmation that keeps failing must not lock the player out forever: ask
   * the server whether this exact round counted. Found means confirmed; not found
   * on a finished raid means it never counted (no Energy was spent), so the saved
   * round can be retired. Anything else stays unconfirmed and retryable.
   */
  private async settleByLookup(pending: BossAttackCheckpoint, fallback: AttackResult): Promise<AttackResult> {
    let found: LookupResult;
    try { found = await this.lookup(pending.raidId, pending.body.client_request_id); }
    catch { return fallback; }
    if (!found.ok) return fallback;
    if (found.found && found.damage !== null) return { ok: true, damage: found.damage, state: found.state };
    if (!found.found && !found.raidActive) return { ok: false, error: 'raid_over', state: found.state };
    return fallback;
  }

  private run(entry: Entry, maySubmit: () => boolean): Promise<void> {
    const pending = entry.snapshot.pending!;
    entry.operation = (async () => {
      if (!entry.persisted) {
        this.publish(entry, { phase: 'saving' });
        try {
          await this.storage.setItem(bossAttackKey(pending.playerId, pending.parkId), JSON.stringify(pending));
          entry.persisted = true;
        } catch {
          this.publish(entry, { phase: 'storage_error' });
          return; // No request is sent unless its proof is durable first.
        }
      }
      if (!maySubmit()) { this.publish(entry, { phase: 'unconfirmed' }); return; }
      const previous = entry.snapshot.receipt;
      let result = previous?.checkpoint.body.client_request_id === pending.body.client_request_id &&
        (previous.result.ok || previous.result.error !== 'network') ? previous.result : null;
      if (!result) {
        this.publish(entry, { phase: 'sending' });
        try { result = await this.attack(pending.raidId, pending.body); }
        catch { result = { ok: false, error: 'network' }; }
        if (!result.ok && result.error === 'network') result = await this.settleByLookup(pending, result);
        this.publish(entry, { receipt: { checkpoint: pending, result } });
      }
      if (!result.ok && result.error === 'network') {
        this.publish(entry, { phase: 'unconfirmed' });
        return;
      }
      try {
        await this.storage.removeItem(bossAttackKey(pending.playerId, pending.parkId));
        this.publish(entry, { pending: null, phase: 'ready' });
      } catch {
        // Confirmation is real, but retain the ID until its local receipt is safely retired.
        this.publish(entry, { phase: 'storage_error' });
      }
    })().finally(() => { entry.operation = undefined; });
    return entry.operation;
  }
}

export const bossAttackRecovery = new BossAttackRecovery();
