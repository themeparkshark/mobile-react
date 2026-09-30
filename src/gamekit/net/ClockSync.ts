/**
 * ClockSync: estimates (server time - device time) from a few round trips.
 *
 * NTP-lite: every sample brackets one GET /party/time between two device
 * readings; the sample with the lowest round-trip time is the least distorted,
 * and its offset is server_ms - midpoint. Park LTE is jittery, so we keep the
 * best of several samples and re-sample periodically, and never jump the
 * clock by more than it drifted unless the new sample is clearly better.
 *
 * Only presentation is clock-synced (count-in, live scoreboard, rival pacing).
 * Fairness never depends on it: every board plays the same seed on its own
 * clock and the server replays the tap log.
 */

export interface ClockSample {
  /** device ms when the request left */
  t0: number;
  /** server epoch ms in the response */
  server: number;
  /** device ms when the response arrived */
  t1: number;
}

export interface ClockEstimate {
  offsetMs: number;
  rttMs: number;
  samples: number;
}

export function sampleOffset(s: ClockSample): { offsetMs: number; rttMs: number } {
  const rttMs = Math.max(0, s.t1 - s.t0);
  return { offsetMs: s.server - (s.t0 + s.t1) / 2, rttMs };
}

/** Best (lowest RTT) sample wins; ties average. Returns null for no samples. */
export function estimate(samples: ClockSample[]): ClockEstimate | null {
  if (samples.length === 0) return null;
  const scored = samples.map(sampleOffset).sort((a, b) => a.rttMs - b.rttMs);
  const best = scored[0];
  const near = scored.filter((s) => s.rttMs <= best.rttMs + 4);
  const offsetMs = near.reduce((sum, s) => sum + s.offsetMs, 0) / near.length;
  return { offsetMs, rttMs: best.rttMs, samples: samples.length };
}

/**
 * Keep a better estimate, or accept a worse one only once the old one is stale
 * (device clocks drift, and a phone can come back from sleep minutes later).
 */
export function merge(current: ClockEstimate | null, next: ClockEstimate | null, ageMs: number): ClockEstimate | null {
  if (!next) return current;
  if (!current) return next;
  if (next.rttMs <= current.rttMs * 1.5 + 10 || ageMs > 60000) return next;
  return current;
}

export class ClockSync {
  private current: ClockEstimate | null = null;
  private syncedAt = 0;

  constructor(
    private readonly fetchServerMs: () => Promise<number>,
    private readonly now: () => number = () => Date.now(),
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async sync(samples = 5, gapMs = 120): Promise<ClockEstimate | null> {
    const taken: ClockSample[] = [];
    for (let i = 0; i < samples; i++) {
      const t0 = this.now();
      try {
        const server = await this.fetchServerMs();
        taken.push({ t0, server, t1: this.now() });
      } catch {
        // A dropped sample is fine; we keep whatever arrived.
      }
      if (i < samples - 1) await this.wait(gapMs);
    }
    this.current = merge(this.current, estimate(taken), this.now() - this.syncedAt);
    if (taken.length > 0) this.syncedAt = this.now();
    return this.current;
  }

  get estimate(): ClockEstimate | null {
    return this.current;
  }

  get offsetMs(): number {
    return this.current?.offsetMs ?? 0;
  }

  /** Server epoch ms right now, by this device's best estimate. */
  serverNow(): number {
    return this.now() + this.offsetMs;
  }

  /** Device ms at which a server timestamp happens. */
  toLocal(serverMs: number): number {
    return serverMs - this.offsetMs;
  }
}
