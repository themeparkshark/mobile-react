/**
 * hapticBus.ts: the configurable haptic priority bus every game's density rule
 * runs through (pure, testable, no expo imports).
 *
 * The designs all say "one haptic at a time, the important one wins", but with
 * different numbers:
 *   - Whack v4: at most one event per 90 ms; a higher priority preempts a
 *     QUEUED lower one; lower ones are dropped, never delayed more than 30 ms;
 *     at most one tell per 300 ms.
 *   - Banana: max 12/s (84 ms spacing); a lower request within 50 ms of a
 *     higher one is dropped; a higher one preempts a queued lower one.
 *   - Trivia: max 6 per second, lower priority dropped first.
 *   - Sharky: at most 4 gameplay haptics per 1 s outside telegraphs.
 *   - Current Quest: at most one per 50 ms (and 3 per carry, via scheduleHaptics).
 *   - Line Party: own direct hits (P1-input) are exempt from the 120 ms cap.
 *   - Rhythm: 1 per 60 ms, 1 per 90 ms in dense bars (setGap at runtime).
 *
 * One state machine covers all of them:
 *   offer(now, req) -> BUS_FIRE (play now), BUS_QUEUED (play at `queue.dueAt`
 *   unless something better replaces it) or BUS_DROP.
 *   due(now) -> the queued request when its time has come.
 *
 * The default config reproduces the original grammar (60 ms gap, an
 * out-ranking request fires inside the gap, nothing is queued), so games that
 * never configure the bus behave exactly as before.
 *
 * Priorities are numbers, higher = more important. HP from hapticGrammar
 * (rival -1, reaction 1, own 2, telegraph 3, critical 4) still works;
 * WHACK_PRIO maps the v4 six-level order onto the same scale.
 */

export const BUS_DROP = 0;
export const BUS_FIRE = 1;
export const BUS_QUEUED = 2;

export interface HapticBusConfig {
  /** Minimum ms between two fired events. */
  minGapMs: number;
  /** Max events per rolling second (0 = no rate cap). */
  maxPerSec: number;
  /** A request blocked by the gap may wait at most this long (0 = never queue). */
  maxDelayMs: number;
  /** Min ms between two tell (telegraph) haptics (0 = off). */
  tellGapMs: number;
  /** Priority at or above which a request ignores gaps, rates and queues. */
  bypassPriority: number;
  /** Legacy grammar: an out-ranking request inside the gap fires right away. */
  preemptInGap: boolean;
  /** Line Party: requests flagged `input` (own direct hits) skip the gap. */
  inputExempt: boolean;
  /** Sharky: tells do not count toward (or get blocked by) maxPerSec. */
  rateExemptTells: boolean;
  /** Banana: a lower request within this many ms after a higher one is dropped (0 = off). */
  shadowMs: number;
}

export const DEFAULT_HAPTIC_BUS: HapticBusConfig = {
  minGapMs: 60,
  maxPerSec: 0,
  maxDelayMs: 0,
  tellGapMs: 0,
  bypassPriority: 4,
  preemptInGap: true,
  inputExempt: false,
  rateExemptTells: false,
  shadowMs: 0,
};

/** Per-game presets straight from the design docs. */
export const HAPTIC_BUS_PRESETS = {
  default: {},
  whack: { minGapMs: 90, maxDelayMs: 30, tellGapMs: 300, preemptInGap: false, bypassPriority: 99 },
  banana: { minGapMs: 84, maxPerSec: 12, maxDelayMs: 30, shadowMs: 50, preemptInGap: false, bypassPriority: 99 },
  trivia: { minGapMs: 60, maxPerSec: 6 },
  sharky: { minGapMs: 60, maxPerSec: 4, rateExemptTells: true },
  currentQuest: { minGapMs: 50 },
  rhythm: { minGapMs: 60, preemptInGap: true },
  rhythmDense: { minGapMs: 90, preemptInGap: true },
  memory: { minGapMs: 60 },
  boss: { minGapMs: 60, maxDelayMs: 20 },
  lineParty: { minGapMs: 120, inputExempt: true },
} satisfies Record<string, Partial<HapticBusConfig>>;

export type HapticBusPreset = keyof typeof HAPTIC_BUS_PRESETS;

/**
 * Whack v4 priority order (1 = most important in the doc) on the bus scale.
 * Decoy tells and penalties are top, flow ticks are bottom.
 */
export const WHACK_PRIO = {
  decoy: 9,
  quick: 8,
  golden: 7,
  good: 6,
  goldenTell: 5,
  flow: 4,
} as const;

export interface HapticRequest {
  priority: number;
  /** Strength tiebreak inside one priority (PRIMITIVE_STRENGTH / pattern strength). */
  strength: number;
  tell?: boolean;
  /** Own direct input (Line Party P1-input). */
  input?: boolean;
  /** Opaque payload the caller plays when the bus says so. */
  payload?: unknown;
}

export interface QueuedRequest extends HapticRequest {
  dueAt: number;
  expiresAt: number;
}

export interface HapticBusState {
  cfg: HapticBusConfig;
  lastAt: number;
  lastPriority: number;
  lastStrength: number;
  lastTellAt: number;
  /** Fire times inside the last second (rate cap). */
  recent: number[];
  queue: QueuedRequest | null;
  fired: number;
  dropped: number;
  queued: number;
  preempted: number;
}

export function createHapticBus(cfg: Partial<HapticBusConfig> | HapticBusPreset = {}): HapticBusState {
  const over = typeof cfg === 'string' ? HAPTIC_BUS_PRESETS[cfg] : cfg;
  return {
    cfg: { ...DEFAULT_HAPTIC_BUS, ...over },
    lastAt: -1e9,
    lastPriority: -1,
    lastStrength: 0,
    lastTellAt: -1e9,
    recent: [],
    queue: null,
    fired: 0,
    dropped: 0,
    queued: 0,
    preempted: 0,
  };
}

/** Swap the config at runtime (Rhythm dense bars, a different game). Clears the queue. */
export function configureHapticBus(s: HapticBusState, cfg: Partial<HapticBusConfig> | HapticBusPreset): void {
  const over = typeof cfg === 'string' ? HAPTIC_BUS_PRESETS[cfg] : cfg;
  s.cfg = { ...DEFAULT_HAPTIC_BUS, ...over };
  s.queue = null;
}

function rateCount(s: HapticBusState, now: number): number {
  let n = 0;
  const keep: number[] = [];
  for (const t of s.recent) {
    if (now - t < 1000) {
      n += 1;
      keep.push(t);
    }
  }
  s.recent = keep;
  return n;
}

function outranks(a: HapticRequest, prio: number, strength: number): boolean {
  return a.priority > prio || (a.priority === prio && a.strength > strength);
}

function commit(s: HapticBusState, now: number, r: HapticRequest): void {
  s.lastAt = now;
  s.lastPriority = r.priority;
  s.lastStrength = r.strength;
  if (r.tell) s.lastTellAt = now;
  if (!(r.tell && s.cfg.rateExemptTells)) s.recent.push(now);
  s.fired += 1;
}

/**
 * Offer a request at `now`. BUS_FIRE: play it now (the bus already counted
 * it). BUS_QUEUED: it waits in `s.queue` until `due()` hands it back.
 * BUS_DROP: never play it.
 */
export function busOffer(s: HapticBusState, now: number, r: HapticRequest): number {
  const c = s.cfg;
  if (r.priority < 0) {
    s.dropped += 1;
    return BUS_DROP;
  }
  if (r.priority >= c.bypassPriority) {
    if (s.queue && s.queue.priority <= r.priority) {
      s.queue = null;
      s.preempted += 1;
    }
    commit(s, now, r);
    return BUS_FIRE;
  }
  if (r.tell && c.tellGapMs > 0 && now - s.lastTellAt < c.tellGapMs) {
    s.dropped += 1;
    return BUS_DROP;
  }
  // Shadow: a lower request right after a higher one is noise.
  if (c.shadowMs > 0 && now - s.lastAt < c.shadowMs && r.priority < s.lastPriority) {
    s.dropped += 1;
    return BUS_DROP;
  }
  if (c.maxPerSec > 0 && !(r.tell && c.rateExemptTells) && rateCount(s, now) >= c.maxPerSec) {
    s.dropped += 1;
    return BUS_DROP;
  }
  if (r.input && c.inputExempt) {
    commit(s, now, r);
    return BUS_FIRE;
  }
  const wait = s.lastAt + c.minGapMs - now;
  if (wait <= 0) {
    // A queued request that is due goes first unless this one outranks it.
    if (s.queue && !outranks(r, s.queue.priority, s.queue.strength)) {
      s.dropped += 1;
      return BUS_DROP;
    }
    if (s.queue) {
      s.queue = null;
      s.preempted += 1;
    }
    commit(s, now, r);
    return BUS_FIRE;
  }
  // Inside the gap.
  if (c.preemptInGap && outranks(r, s.lastPriority, s.lastStrength)) {
    commit(s, now, r);
    return BUS_FIRE;
  }
  if (c.maxDelayMs > 0 && wait <= c.maxDelayMs) {
    if (s.queue) {
      if (!outranks(r, s.queue.priority, s.queue.strength)) {
        s.dropped += 1;
        return BUS_DROP;
      }
      s.preempted += 1;
    }
    s.queue = { ...r, dueAt: now + wait, expiresAt: now + c.maxDelayMs };
    s.queued += 1;
    return BUS_QUEUED;
  }
  s.dropped += 1;
  return BUS_DROP;
}

/**
 * Hand back the queued request once it is due (null otherwise). A request
 * that waited past its max delay is dropped instead: a late buzz reads as a bug.
 */
export function busDue(s: HapticBusState, now: number): HapticRequest | null {
  const q = s.queue;
  if (!q || now < q.dueAt) return null;
  s.queue = null;
  if (now > q.expiresAt + 8) {
    s.dropped += 1;
    return null;
  }
  commit(s, now, q);
  return q;
}

/** Counters for the dev overlay / tests. */
export function busStats(s: HapticBusState): { fired: number; dropped: number; queued: number; preempted: number } {
  return { fired: s.fired, dropped: s.dropped, queued: s.queued, preempted: s.preempted };
}
