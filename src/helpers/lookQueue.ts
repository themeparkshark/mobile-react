import type { SaveLookResult } from '../api/endpoints/me/look';
import type { ItemType } from '../models/item-type';
import type { LookSlots, SharkLook, SlotKey } from '../models/look-type';

/**
 * The optimistic save queue behind useLook (dressing-room.md 13.3, 7.10).
 *
 * A tap changes the shark in the same frame. Taps within MERGE_WINDOW_MS
 * merge into one PUT /me/look, and a burst never waits longer than
 * MAX_WAIT_MS. Nothing ever locks:
 * - 409 (another device saved): adopt the server look, replay the pending
 *   taps once, and report the slots that moved.
 * - 422 (not in your closet): those slots go back to the saved look.
 * - Network failure: keep the local look, retry at 2s and 6s, then read the
 *   server look and put back whatever did not save.
 * - 404 (older backend without /me/look): fall back to PUT /me/inventory.
 *
 * Try-on never enters this queue.
 */

export const MERGE_WINDOW_MS = 400;
export const MAX_WAIT_MS = 1200;
export const RETRY_DELAYS_MS = [2000, 6000] as const;

type Worn = ItemType | null;
type SlotMap = Partial<Record<SlotKey, Worn>>;

export type LookNotice =
  | { readonly kind: 'other_device'; readonly slots: SlotKey[] }
  | { readonly kind: 'save_failed'; readonly slots: SlotKey[] }
  | { readonly kind: 'not_owned'; readonly slots: SlotKey[] };

export interface LookQueueDeps {
  save(version: number, slots: Partial<Record<SlotKey, number | null>>): Promise<SaveLookResult>;
  load(): Promise<SharkLook>;
  /** PUT /me/inventory toggle for older backends; resolves to the saved slots. */
  legacyToggle(item: ItemType): Promise<LookSlots>;
  schedule(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  now(): number;
  /** The displayed look changed. */
  onChange(): void;
  /** The server confirmed a look (push it to the player profile). */
  onSaved(slots: LookSlots): void;
  onNotice(notice: LookNotice): void;
}

const idOf = (worn: unknown): number | null =>
  worn && typeof worn === 'object' && 'id' in worn ? Number((worn as { id: number }).id) : null;

const keys = (map: SlotMap) => Object.keys(map) as SlotKey[];

export function changedSlots(before: LookSlots, after: LookSlots): SlotKey[] {
  const all = new Set([...Object.keys(before), ...Object.keys(after)] as SlotKey[]);
  return [...all].filter((slot) => idOf(before[slot]) !== idOf(after[slot]));
}

export class LookQueue {
  private saved: { version: number | null; slots: LookSlots };
  private pending: SlotMap = {};
  private inFlight: SlotMap = {};
  private timer: unknown = null;
  private firstPendingAt: number | null = null;
  private busy = false;
  private failures = 0;
  private replayed = false;
  private legacy = false;
  private disposed = false;

  constructor(private readonly deps: LookQueueDeps, slots: LookSlots, version: number | null = null) {
    this.saved = { version, slots };
  }

  /** What the shark wears right now: saved, then sending, then just tapped. */
  display(): LookSlots {
    return { ...this.saved.slots, ...this.inFlight, ...this.pending };
  }

  get savedVersion(): number | null {
    return this.saved.version;
  }

  /** Whether anything is still waiting to reach the server. */
  get dirty(): boolean {
    return keys(this.pending).length > 0 || keys(this.inFlight).length > 0;
  }

  /** A fresh server look (GET /me/look, profile refresh) while idle. */
  adopt(look: { version?: number | null; slots: LookSlots }): void {
    if (this.dirty || this.busy) {
      if (look.version != null) this.saved = { ...this.saved, version: this.saved.version ?? look.version };
      return;
    }
    this.saved = { version: look.version ?? this.saved.version, slots: { ...this.saved.slots, ...look.slots } };
    this.deps.onChange();
  }

  /** Put an item on a slot (or take it off with null). */
  intend(slot: SlotKey, item: Worn): void {
    const base = { ...this.saved.slots, ...this.inFlight };
    if (idOf(base[slot]) === idOf(item)) {
      // Tapped back to what is already saved or sending: nothing to send.
      delete this.pending[slot];
    } else {
      this.pending[slot] = item;
    }
    if (keys(this.pending).length === 0) {
      this.firstPendingAt = null;
      this.clearTimer();
    } else {
      this.firstPendingAt ??= this.deps.now();
      const waited = this.deps.now() - this.firstPendingAt;
      this.scheduleFlush(Math.max(0, Math.min(MERGE_WINDOW_MS, MAX_WAIT_MS - waited)));
    }
    this.deps.onChange();
  }

  /** Send now (leaving the screen). */
  flushNow(): Promise<void> {
    this.clearTimer();
    return this.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) this.deps.cancel(this.timer);
    this.timer = null;
  }

  private scheduleFlush(ms: number): void {
    this.clearTimer();
    this.timer = this.deps.schedule(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private async flush(): Promise<void> {
    if (this.busy || keys(this.pending).length === 0) return;
    this.busy = true;
    this.inFlight = { ...this.inFlight, ...this.pending };
    this.pending = {};
    this.firstPendingAt = null;

    try {
      if (this.saved.version === null && !this.legacy) {
        const look = await this.deps.load();
        this.saved = { version: look.version, slots: { ...this.saved.slots, ...look.slots } };
      }
      const result = this.legacy ? await this.legacySave() : await this.deps.save(
        this.saved.version ?? 0,
        Object.fromEntries(keys(this.inFlight).map((slot) => [slot, idOf(this.inFlight[slot])])),
      );
      this.handle(result);
    } catch {
      this.failed();
    } finally {
      this.busy = false;
      if (!this.disposed) {
        this.deps.onChange();
        if (keys(this.pending).length > 0 && this.timer === null) this.scheduleFlush(MERGE_WINDOW_MS);
      }
    }
  }

  private handle(result: SaveLookResult): void {
    this.failures = 0;
    switch (result.kind) {
      case 'saved': {
        this.saved = { version: result.look.version, slots: { ...this.saved.slots, ...result.look.slots } };
        this.inFlight = {};
        this.replayed = false;
        this.deps.onSaved(this.saved.slots);
        return;
      }
      case 'conflict': {
        const before = this.display();
        const replay = this.replayed ? {} : this.inFlight;
        this.replayed = true;
        this.saved = { version: result.look.version, slots: { ...this.saved.slots, ...result.look.slots } };
        this.inFlight = {};
        for (const slot of keys(replay)) {
          if (!(slot in this.pending) && idOf(replay[slot]) !== idOf(this.saved.slots[slot])) this.pending[slot] = replay[slot];
        }
        const moved = changedSlots(before, this.display());
        if (moved.length) this.deps.onNotice({ kind: 'other_device', slots: moved });
        this.deps.onSaved(this.saved.slots);
        return;
      }
      case 'rejected': {
        const before = this.display();
        for (const slot of keys(this.inFlight)) {
          if (!result.slots.includes(slot) && !(slot in this.pending)
            && idOf(this.inFlight[slot]) !== idOf(this.saved.slots[slot])) this.pending[slot] = this.inFlight[slot];
        }
        this.inFlight = {};
        const reverted = changedSlots(before, this.display());
        this.deps.onNotice({ kind: 'not_owned', slots: reverted.length ? reverted : result.slots });
        return;
      }
      case 'unsupported': {
        this.legacy = true;
        this.pending = { ...this.inFlight, ...this.pending };
        this.inFlight = {};
        return;
      }
    }
  }

  private failed(): void {
    this.failures += 1;
    if (this.failures <= RETRY_DELAYS_MS.length) {
      this.pending = { ...this.inFlight, ...this.pending };
      this.inFlight = {};
      this.clearTimer();
      this.timer = this.deps.schedule(() => {
        this.timer = null;
        void this.flush();
      }, RETRY_DELAYS_MS[this.failures - 1]);
      return;
    }

    // Out of retries: show the last look the server has, and say so.
    this.failures = 0;
    const before = this.display();
    this.inFlight = {};
    this.pending = {};
    const settle = () => {
      const reverted = changedSlots(before, this.display());
      if (reverted.length) this.deps.onNotice({ kind: 'save_failed', slots: reverted });
      this.deps.onChange();
    };
    this.deps.load().then((look) => {
      this.saved = { version: look.version, slots: { ...this.saved.slots, ...look.slots } };
      this.deps.onSaved(this.saved.slots);
      settle();
    }, settle);
  }

  /** Older backend: toggle each changed slot through PUT /me/inventory. */
  private async legacySave(): Promise<SaveLookResult> {
    let slots: LookSlots = this.saved.slots;
    for (const slot of keys(this.inFlight)) {
      const target = this.inFlight[slot];
      const current = slots[slot];
      const toggle = target ? (idOf(target) !== idOf(current) ? target : null) : (current as ItemType | null | undefined) ?? null;
      if (!toggle) continue;
      try {
        slots = { ...slots, [slot]: target ?? null, ...(await this.deps.legacyToggle(toggle)) };
        // A toggle is not idempotent: record each one as saved right away so
        // a later failure never resends (and undoes) it.
        this.saved = { ...this.saved, slots };
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 422) return { kind: 'rejected', slots: [slot] };
        throw error;
      }
    }
    return { kind: 'saved', look: { version: this.saved.version ?? 0, slots } };
  }
}
