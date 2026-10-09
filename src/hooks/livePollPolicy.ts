/**
 * When a repeating refresh may run. Pure rules, unit tested.
 *
 * The app runs all day in a park, often with background location keeping the
 * JS runtime alive while the phone is in a pocket. A plain setInterval keeps
 * hitting the network (and waking the radio) the whole time. Every poll goes
 * through these rules instead:
 *  - nothing runs while the poll is disabled;
 *  - in the background a poll is paused, unless it names a slower background
 *    rate (ride detection wait times);
 *  - in the foreground it runs only while its screen is focused;
 *  - when it resumes it runs at once if a refresh is overdue, otherwise it
 *    waits out the rest of the interval, so a quick app switch is free.
 */

export interface PollGate {
  readonly enabled: boolean;
  readonly appActive: boolean;
  readonly focused: boolean;
}

/** The interval to poll at right now, or null while the poll is paused. */
export function pollIntervalFor(gate: PollGate, intervalMs: number, backgroundMs?: number | null): number | null {
  if (!gate.enabled) return null;
  if (!gate.appActive) return backgroundMs && backgroundMs > 0 ? backgroundMs : null;
  if (!gate.focused) return null;
  return intervalMs > 0 ? intervalMs : null;
}

/** Wait before the next run: now if never run (or overdue), else the rest of the interval. */
export function pollDelay(lastRunAt: number | null, now: number, intervalMs: number): number {
  if (lastRunAt === null || !Number.isFinite(lastRunAt) || lastRunAt > now) return 0;
  return Math.max(0, lastRunAt + intervalMs - now);
}

/** Battery Saver slows every live poll by a fixed 2x (never stacked with the budget's idle multiplier). */
export const SAVER_POLL_FACTOR = 2;
export function saverInterval(intervalMs: number, lowPower: boolean): number {
  return lowPower ? intervalMs * SAVER_POLL_FACTOR : intervalMs;
}
