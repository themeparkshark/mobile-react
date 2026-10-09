/**
 * One clock for every repeating refresh in the app.
 *
 * Separate setIntervals wake the radio at scattered moments; one coordinator
 * lines them up (polls due within ALIGN_MS of each other run in the same
 * wake), pauses all of them in the background (unless a poll names a
 * background rate), and stretches them by the power budget while idle or on
 * Battery Saver. Pure scheduling with an injectable clock, unit tested.
 */
import { budgetedInterval } from './powerPolicy';

export interface PollTask {
  readonly id: string;
  readonly run: () => unknown;
  /** Foreground interval at full power. */
  readonly intervalMs: number;
  /** Keep running in the background at this rate. Default: pause. */
  readonly backgroundMs?: number | null;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Polls due this close together run in one wake. */
export const ALIGN_MS = 1500;

interface Entry { task: PollTask; lastRunAt: number | null; }

export class PollCoordinator {
  private entries = new Map<string, Entry>();
  /** Last run per id, kept across unregister so a re-register (a dep change, a refocus) is not a free extra fetch. */
  private lastRuns = new Map<string, number>();
  private timer: unknown = null;
  private appActive = true;
  private multiplier = 1;

  constructor(private readonly clock: Clock) {}

  /**
   * runNow: run at once (first mount, a new key). Otherwise the poll keeps its
   * old schedule and runs only if it came due while away.
   */
  register(task: PollTask, runNow = true): () => void {
    const remembered = this.entries.get(task.id)?.lastRunAt ?? this.lastRuns.get(task.id) ?? null;
    this.entries.set(task.id, { task, lastRunAt: runNow ? null : (remembered ?? this.clock.now()) });
    this.schedule();
    return () => {
      const current = this.entries.get(task.id);
      if (current && current.task === task) {
        this.entries.delete(task.id);
        this.schedule();
      }
    };
  }

  setAppActive(active: boolean): void {
    if (active === this.appActive) return;
    this.appActive = active;
    this.schedule();
  }

  setMultiplier(multiplier: number): void {
    const next = Number.isFinite(multiplier) ? Math.max(1, multiplier) : Infinity;
    if (next === this.multiplier) return;
    this.multiplier = next;
    this.schedule();
  }

  /** Interval for a task right now, or null if it is paused. */
  intervalFor(task: PollTask): number | null {
    if (!this.appActive) {
      return task.backgroundMs && task.backgroundMs > 0 ? task.backgroundMs : null;
    }
    return budgetedInterval(task.intervalMs, { pollMultiplier: this.multiplier });
  }

  /** When each task is next due (ms timestamp), paused tasks omitted. */
  dueTimes(): Map<string, number> {
    const due = new Map<string, number>();
    const now = this.clock.now();
    for (const [id, entry] of this.entries) {
      const interval = this.intervalFor(entry.task);
      if (interval === null) continue;
      due.set(id, entry.lastRunAt === null ? now : entry.lastRunAt + interval);
    }
    return due;
  }

  size(): number { return this.entries.size; }
  pending(): boolean { return this.timer !== null; }

  private schedule(): void {
    if (this.timer !== null) { this.clock.clearTimeout(this.timer); this.timer = null; }
    const due = this.dueTimes();
    if (!due.size) return;
    const next = Math.min(...due.values());
    const wait = Math.max(0, next - this.clock.now());
    this.timer = this.clock.setTimeout(() => { this.timer = null; this.tick(); }, wait);
  }

  private tick(): void {
    const now = this.clock.now();
    for (const [id, when] of this.dueTimes()) {
      if (when > now + ALIGN_MS) continue;
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.lastRunAt = now;
      this.lastRuns.set(id, now);
      try {
        const result = entry.task.run();
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          (result as Promise<unknown>).catch(() => undefined);
        }
      } catch {
        // A failed refresh keeps its last data; the next wake retries.
      }
    }
    this.schedule();
  }
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The app's one coordinator. PowerProvider feeds it app state and the budget. */
export const pollCoordinator = new PollCoordinator(realClock);
