/**
 * RedeemRetryQueue — generic, AsyncStorage-backed retry queue.
 *
 * Purpose: server-authoritative reward calls (e.g. completeInLineTimer) must
 * never be lost to a flaky network. When such a call fails, enqueue it here.
 * The queue drains on app-foreground and on demand (call drain() after a
 * reconnect / when you next have connectivity). Each enqueued item carries a
 * stable idempotency key so the backend can dedupe if a call actually
 * succeeded but the ack was lost.
 *
 * Why not NetInfo? @react-native-community/netinfo is NOT installed in this
 * project (flagged for architect approval — do not add heavy deps). So drain
 * is driven by AppState foreground transitions + explicit drain() calls after
 * a successful/attempted network op, rather than a connectivity listener.
 * TODO(deps): if NetInfo is approved, add a reachability listener that calls
 * queue.drain() on reconnect for faster recovery.
 *
 * The queue is generic over the payload type. The *executor* (how to actually
 * perform the call for a payload) is registered per queue instance, so this
 * file has zero coupling to any specific endpoint.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';

export interface RetryItem<TPayload> {
  /** Idempotency key — stable across every retry attempt of this item. */
  readonly idempotencyKey: string;
  readonly payload: TPayload;
  readonly enqueuedAt: number;
  attempts: number;
  lastAttemptAt: number | null;
}

/**
 * Executor result. Return `true` on success (item is removed). Throw or return
 * `false` to keep the item for a later retry.
 */
export type RetryExecutor<TPayload> = (
  payload: TPayload,
  idempotencyKey: string,
) => Promise<boolean>;

export interface RedeemRetryQueueOptions<TPayload> {
  /** Unique AsyncStorage key namespace for this queue. */
  readonly storageKey: string;
  /** Performs the network call for one payload. */
  readonly executor: RetryExecutor<TPayload>;
  /** Max attempts before an item is dropped (dead-lettered). Default 8. */
  readonly maxAttempts?: number;
  /**
   * Whether to auto-drain when the app returns to the foreground.
   * Default true.
   */
  readonly drainOnForeground?: boolean;
}

const DEFAULT_MAX_ATTEMPTS = 8;

function makeIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export class RedeemRetryQueue<TPayload> {
  private readonly storageKey: string;
  private readonly executor: RetryExecutor<TPayload>;
  private readonly maxAttempts: number;

  /** Serializes all storage mutations to avoid read-modify-write races. */
  private writeChain: Promise<void> = Promise.resolve();
  /** Guards against overlapping drains. */
  private draining = false;
  private appStateSub: { remove: () => void } | null = null;
  private lastAppState: AppStateStatus = AppState.currentState;

  constructor(options: RedeemRetryQueueOptions<TPayload>) {
    this.storageKey = options.storageKey;
    this.executor = options.executor;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    if (options.drainOnForeground ?? true) {
      this.appStateSub = AppState.addEventListener('change', this.handleAppState);
    }
  }

  private handleAppState = (next: AppStateStatus): void => {
    const wasBackground = this.lastAppState === 'background' || this.lastAppState === 'inactive';
    this.lastAppState = next;
    if (wasBackground && next === 'active') {
      // Fire-and-forget; drain guards against overlap.
      void this.drain();
    }
  };

  /** Tear down the AppState listener. Call when the owning session ends. */
  dispose(): void {
    this.appStateSub?.remove();
    this.appStateSub = null;
  }

  /**
   * Read the stored items for a write. A storage read that fails throws, so a
   * mutation or drain stops instead of writing over items it could not see
   * (a hiccup must never wipe what is waiting). Data that cannot be parsed is
   * copied to `<key>.corrupt` for diagnosis and treated as empty, so one bad
   * write cannot block the queue forever.
   */
  private async readForWrite(): Promise<RetryItem<TPayload>[]> {
    const raw = await AsyncStorage.getItem(this.storageKey);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as RetryItem<TPayload>[];
    } catch {
      // fall through to the corrupt copy below
    }
    await AsyncStorage.setItem(`${this.storageKey}.corrupt`, raw);
    return [];
  }

  /** Read for display only: any failure reads as empty and nothing is written. */
  private async read(): Promise<RetryItem<TPayload>[]> {
    try {
      return await this.readForWrite();
    } catch {
      return [];
    }
  }

  private async write(items: RetryItem<TPayload>[]): Promise<void> {
    await AsyncStorage.setItem(this.storageKey, JSON.stringify(items));
  }

  /** Serialize a mutation through the write chain. */
  private mutate(fn: (items: RetryItem<TPayload>[]) => RetryItem<TPayload>[]): Promise<void> {
    const next = this.writeChain.then(async () => {
      // Throws on a failed read, so nothing stored is overwritten blind.
      const items = await this.readForWrite();
      await this.write(fn(items));
    });
    // Swallow errors so the chain never breaks; individual reads/writes retry.
    this.writeChain = next.catch((e) => {
      console.warn('[RedeemRetryQueue] mutate error:', e);
    });
    return next;
  }

  /**
   * Enqueue a payload for retry. Returns the idempotency key assigned to it.
   * Pass an explicit `idempotencyKey` (recommended) so the same logical action
   * — e.g. completing a specific session — is never enqueued twice with two
   * different keys.
   */
  async enqueue(payload: TPayload, idempotencyKey?: string, options?: { replace?: boolean }): Promise<string> {
    const key = idempotencyKey ?? makeIdempotencyKey('retry');
    await this.mutate((items) => {
      // Dedupe by idempotency key: never queue the same action twice. With
      // replace, the newest payload wins (an edited draft of the same action).
      const index = items.findIndex((it) => it.idempotencyKey === key);
      if (index >= 0) {
        if (options?.replace) items[index] = { ...items[index], payload };
        return items;
      }
      items.push({
        idempotencyKey: key,
        payload,
        enqueuedAt: Date.now(),
        attempts: 0,
        lastAttemptAt: null,
      });
      return items;
    });
    return key;
  }

  /** Take one item out (it was sent another way, or the server said no). */
  async remove(idempotencyKey: string): Promise<void> {
    await this.mutate((items) => items.filter((it) => it.idempotencyKey !== idempotencyKey));
  }

  /** How many items are currently queued. */
  async size(): Promise<number> {
    return (await this.read()).length;
  }

  /** Read a snapshot of queued items (for UI / diagnostics). */
  async peek(): Promise<RetryItem<TPayload>[]> {
    return this.read();
  }

  /**
   * Attempt to flush every queued item exactly once, oldest first. Successes
   * and dead-lettered (max-attempt) items are removed; transient failures stay
   * for the next drain. Safe to call repeatedly; overlapping calls no-op.
   *
   * @returns number of items successfully executed this pass.
   */
  async drain(): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    let succeeded = 0;

    try {
      let items: RetryItem<TPayload>[];
      try {
        items = await this.readForWrite();
      } catch {
        return 0; // storage hiccup: leave everything as it is for the next drain
      }
      if (items.length === 0) return 0;

      const survivors: RetryItem<TPayload>[] = [];

      for (const item of items) {
        item.attempts += 1;
        item.lastAttemptAt = Date.now();
        let ok = false;
        try {
          ok = await this.executor(item.payload, item.idempotencyKey);
        } catch (e) {
          ok = false;
          console.warn('[RedeemRetryQueue] executor threw:', e);
        }

        if (ok) {
          succeeded += 1;
          continue; // drop on success
        }

        if (item.attempts >= this.maxAttempts) {
          // Dead-letter: drop after too many attempts so the queue can't grow
          // unbounded. Log loudly so it can be diagnosed.
          console.error(
            `[RedeemRetryQueue] dropping item after ${item.attempts} attempts:`,
            item.idempotencyKey,
          );
          continue;
        }

        survivors.push(item);
      }

      // Merge survivors back with anything enqueued during the drain.
      await this.mutate((current) => {
        const survivorKeys = new Set(survivors.map((s) => s.idempotencyKey));
        const drainedKeys = new Set(items.map((i) => i.idempotencyKey));
        // Keep: survivors (updated attempt counts) + any brand-new items added
        // mid-drain that we never processed.
        const newlyAdded = current.filter((c) => !drainedKeys.has(c.idempotencyKey));
        // A payload replaced mid-drain keeps its newest version; only the try count comes from the drain.
        const updatedSurvivors = current
          .filter((c) => survivorKeys.has(c.idempotencyKey))
          .map((c) => {
            const tried = survivors.find((s) => s.idempotencyKey === c.idempotencyKey);
            return tried ? { ...c, attempts: tried.attempts, lastAttemptAt: tried.lastAttemptAt } : c;
          });
        return [...updatedSurvivors, ...newlyAdded];
      });

      return succeeded;
    } finally {
      this.draining = false;
    }
  }

  /** Remove everything. Mainly for tests / hard resets. */
  async clear(): Promise<void> {
    await this.mutate(() => []);
  }
}
