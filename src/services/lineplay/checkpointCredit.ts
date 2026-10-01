/**
 * Two-checkpoint, offline-first crediting (L1, next-wave/l1/DESIGN.md).
 *
 * Pure helpers, no imports, so they run the same on the wait screen, in the
 * background task and in tests. The server still decides every Part: these
 * only decide what to keep and send when the queue building kills GPS or
 * signal, and what the guest sees while the phone clock carries the wait.
 *
 *   entry checkpoint  the first fix near the ride, with its phone-clock time
 *   trail             fixes taken while the server was unreachable (thinned)
 *   exit checkpoint   a fix near the ride again, "I rode it", or the next open
 */

/** One position fix on the phone clock (ms epoch). */
export interface CheckpointFix {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters?: number | null;
  readonly at: number;
}

export type ExitMethod = 'geofence' | 'confirm' | 'app_open' | 'left_queue';

export interface ExitCheckpoint {
  readonly method: ExitMethod;
  readonly at: number;
  readonly fix?: CheckpointFix | null;
}

export interface StepReading {
  readonly count: number;
  readonly from: number;
  readonly to: number;
}

/** What the session sends with complete (and the reward queue replays). */
export interface CheckpointPayload {
  readonly exit?: ExitCheckpoint | null;
  readonly samples?: readonly CheckpointFix[];
  readonly steps?: StepReading | null;
}

/** The server's `credit` block (null or absent while its flag is off). */
export interface ServerCreditSummary {
  readonly mode: 'checkpoint';
  readonly verified_seconds: number;
  readonly bridged_seconds: number;
  readonly cap_seconds: number | null;
  readonly posted_wait_seconds: number | null;
  readonly typical_wait_seconds: number | null;
  readonly entry_method: string | null;
  readonly exit_method: string | null;
  readonly flags: readonly string[];
}

/** Trail fixes closer together than this are thinned to one. */
export const TRAIL_MIN_GAP_MS = 60_000;
/** Matches the server's per-request limit with room to spare. */
export const TRAIL_MAX_FIXES = 120;
/** The server credits 90 s between answers; longer is a dark gap worth steps. */
export const DARK_GAP_MS = 90_000;
/** Mirrors the server cap: max(30 min, 1.5 x posted + 10 min). */
const CAP_FLOOR_SECONDS = 1800;
const CAP_MULTIPLIER = 1.5;
const CAP_SLACK_SECONDS = 600;
/** Mirrors the server's dark-time cap when no wait is known at all. */
const UNKNOWN_WAIT_CAP_SECONDS = 3600;

export function isCheckpointFix(value: unknown): value is CheckpointFix {
  const fix = value as CheckpointFix | null;
  return Boolean(fix && Number.isFinite(fix.latitude) && Math.abs(fix.latitude) <= 90 &&
    Number.isFinite(fix.longitude) && Math.abs(fix.longitude) <= 180 &&
    Number.isFinite(fix.at) && fix.at > 0 &&
    (fix.accuracyMeters == null || (Number.isFinite(fix.accuracyMeters) && fix.accuracyMeters >= 0)));
}

/**
 * Add a fix to the offline trail: oldest first, one per minute, newest kept
 * when full. A duplicate or older fix is ignored.
 */
export function appendTrail(trail: readonly CheckpointFix[], fix: CheckpointFix,
  minGapMs = TRAIL_MIN_GAP_MS, maxFixes = TRAIL_MAX_FIXES): CheckpointFix[] {
  if (!isCheckpointFix(fix)) return [...trail];
  const last = trail[trail.length - 1];
  if (last && fix.at <= last.at) return [...trail];
  if (last && fix.at - last.at < minGapMs) {
    // Keep the more accurate of two close fixes.
    const better = (fix.accuracyMeters ?? Infinity) < (last.accuracyMeters ?? Infinity);
    return better ? [...trail.slice(0, -1), fix] : [...trail];
  }
  return [...trail, fix].slice(-maxFixes);
}

/** Merge two trails (foreground and background) into one thinned, ordered trail. */
export function mergeTrails(a: readonly CheckpointFix[], b: readonly CheckpointFix[]): CheckpointFix[] {
  return [...a, ...b].filter(isCheckpointFix).sort((x, y) => x.at - y.at)
    .reduce<CheckpointFix[]>((trail, fix) => appendTrail(trail, fix), []);
}

/** Drop the fixes the server has now seen. */
export function trimSynced(trail: readonly CheckpointFix[], syncedThrough: number): CheckpointFix[] {
  return trail.filter(fix => fix.at > syncedThrough);
}

/** The posted-wait cap the server applies, in seconds (null: no posted cap). */
export function localCreditCapSeconds(postedWaitMinutes: number | null | undefined): number | null {
  if (postedWaitMinutes == null || !Number.isFinite(postedWaitMinutes) || postedWaitMinutes < 0) return null;
  return Math.max(CAP_FLOOR_SECONDS, Math.round(CAP_MULTIPLIER * postedWaitMinutes * 60 + CAP_SLACK_SECONDS));
}

export interface OfflineCreditInput {
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly now: number;
  /** Posted wait the session saw at entry (null when only an estimate). */
  readonly postedWaitMinutes: number | null;
  /** The server's own cap once it answered (wins over the local mirror). */
  readonly serverCapSeconds?: number | null;
  readonly verifiedEligibleSeconds: number;
  readonly creditedParts: number | null;
  readonly partIntervalSeconds: number;
  readonly sessionPartCap: number;
  readonly partsRemainingToday: number | null;
  /** Something is still waiting for the server (entry, trail or completion). */
  readonly syncing: boolean;
}

export interface OfflineCredit {
  /** Wait time the phone clock is carrying (what the server should confirm). */
  readonly seconds: number;
  /** Parts the phone clock has earned that the server has not minted yet. */
  readonly pendingParts: number;
  readonly syncing: boolean;
}

/**
 * What the wait screen shows while the phone clock carries the wait: never
 * less than the server already verified, never more than the server's cap.
 */
export function offlineCreditEstimate(input: OfflineCreditInput): OfflineCredit {
  const interval = Math.max(1, input.partIntervalSeconds);
  if (!input.startedAt || !Number.isFinite(input.startedAt)) {
    return { seconds: Math.max(0, input.verifiedEligibleSeconds), pendingParts: 0, syncing: input.syncing };
  }
  const end = input.endedAt ?? input.now;
  const elapsed = Math.max(0, Math.floor((end - input.startedAt) / 1000));
  const cap = input.serverCapSeconds ?? localCreditCapSeconds(input.postedWaitMinutes) ??
    UNKNOWN_WAIT_CAP_SECONDS + Math.max(0, input.verifiedEligibleSeconds);
  const seconds = Math.max(Math.max(0, input.verifiedEligibleSeconds), Math.min(elapsed, cap));
  const projected = Math.min(Math.max(0, input.sessionPartCap), Math.floor(seconds / interval));
  const minted = Math.max(0, input.creditedParts ?? 0);
  let pendingParts = Math.max(0, projected - minted);
  if (input.partsRemainingToday != null) pendingParts = Math.min(pendingParts, Math.max(0, input.partsRemainingToday));
  return { seconds, pendingParts, syncing: input.syncing };
}

/**
 * The exit checkpoint for a finished wait. A boarding confirm is "I rode it";
 * the away detector exits at its first away answer; a session reopened after
 * the app was closed, that never heard "near" again, exits at that open.
 */
export function buildExit(input: {
  readonly endReason: 'manual' | 'left_queue' | 'boarded' | null;
  readonly boardingAt: number | null;
  readonly endedAt: number;
  readonly firstAwayAt: number | null;
  readonly reopenedAt: number | null;
  readonly nearSinceReopen: boolean;
  readonly recentFix: CheckpointFix | null;
}): ExitCheckpoint {
  const fix = input.recentFix && isCheckpointFix(input.recentFix) ? input.recentFix : null;
  if (input.endReason === 'left_queue') {
    if (input.reopenedAt && !input.nearSinceReopen) return { method: 'app_open', at: input.reopenedAt };
    return { method: 'left_queue', at: input.firstAwayAt ?? input.endedAt };
  }
  const at = input.boardingAt ?? input.endedAt;
  return fix ? { method: 'geofence', at, fix } : { method: 'confirm', at };
}

/** Steps worth sending: a real reading over a dark gap. */
export function usableSteps(reading: StepReading | null | undefined): StepReading | null {
  if (!reading || !Number.isInteger(reading.count) || reading.count < 0 ||
      !Number.isFinite(reading.from) || !Number.isFinite(reading.to) || reading.to - reading.from < 60_000) return null;
  return { count: reading.count, from: Math.round(reading.from), to: Math.round(reading.to) };
}

/** Wire format for one fix. */
export function fixBody(fix: CheckpointFix): { latitude: number; longitude: number; accuracy_meters?: number; at: number } {
  const accuracy = typeof fix.accuracyMeters === 'number' && Number.isFinite(fix.accuracyMeters) && fix.accuracyMeters >= 0
    ? Math.min(10_000, fix.accuracyMeters) : undefined;
  return { latitude: fix.latitude, longitude: fix.longitude,
    ...(accuracy === undefined ? {} : { accuracy_meters: accuracy }), at: Math.round(fix.at) };
}

/** Wire format for the L1 fields of a complete or sync request. */
export function checkpointBody(payload: CheckpointPayload | null | undefined, clientNow: number): Record<string, unknown> {
  if (!payload) return {};
  const body: Record<string, unknown> = { client_now: Math.round(clientNow) };
  const samples = (payload.samples ?? []).filter(isCheckpointFix).slice(-TRAIL_MAX_FIXES);
  if (samples.length) body.samples = samples.map(fixBody);
  const steps = usableSteps(payload.steps);
  if (steps) body.steps = steps;
  if (payload.exit && Number.isFinite(payload.exit.at)) {
    const fix = payload.exit.fix && isCheckpointFix(payload.exit.fix) ? fixBody(payload.exit.fix) : null;
    body.exit = { method: payload.exit.method, at: Math.round(payload.exit.at),
      ...(fix ? { latitude: fix.latitude, longitude: fix.longitude,
        ...(fix.accuracy_meters === undefined ? {} : { accuracy_meters: fix.accuracy_meters }) } : {}) };
  }
  return body;
}
