/**
 * LinePlaySession — the in-queue session state machine.
 *
 * Lifecycle:
 *   idle -> detected -> active -> paused(lineMoving) <-> active
 *                              -> ending(grace 60s) -> complete
 *
 * Responsibilities:
 *   - Own the session state machine and emit changes to subscribers.
 *   - Start the server-side in-line timer (server-authoritative) and complete
 *     it, routing failed completes through a RedeemRetryQueue.
 *   - Size the session from the posted wait time, with an AsyncStorage
 *     last-known cache so a session can start offline.
 *   - Model passive accrual for display only (server computes real rewards).
 *   - Generate the activity playlist as a typed activity queue.
 *   - Auto-pause on sustained movement (speed > 0.7 m/s for 5s), computed from
 *     the shared LocationContext stream — this class never creates its own
 *     location watcher.
 *
 * IMPORTANT — this is a plain controller class, framework-agnostic. The screen
 * subscribes to it and feeds it location samples from useContext(LocationContext).
 * That satisfies "subscribe, don't create new watchers": we consume the app's
 * existing location state rather than spinning up another watchPositionAsync.
 *
 * BATTERY / ACCURACY (quality bar #4): the plan wants location dropped to
 * `Balanced` accuracy during a session. The LocationProvider
 * (src/context/LocationProvider.tsx) hardcodes `Accuracy.BestForNavigation`
 * and exposes NO runtime accuracy control on its context. Per the worker
 * brief, this is documented as a follow-up rather than hacked:
 *   TODO(location): add `setAccuracyMode('balanced' | 'navigation')` to
 *   LocationContextType and have the provider's watcher honor it, then call it
 *   here on start()/complete(). Until then LinePlay cannot lower accuracy and
 *   relies on: no keep-awake, no new watchers, and no polling faster than 30s.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import startInLineTimer from '../../api/endpoints/me/inline-timer/start';
import completeInLineTimer from '../../api/endpoints/me/inline-timer/complete';
import { RidePartType } from '../../models/ride-part-type';
import { RedeemRetryQueue } from './RedeemRetryQueue';
import {
  buildPredictionCard,
  PredictionCard,
} from './content';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LinePlayState =
  | 'idle'
  | 'detected'
  | 'active'
  | 'paused'
  | 'ending'
  | 'complete';

/** Why the session is paused. Currently only auto line-movement. */
export type PauseReason = 'lineMoving' | 'manual';

/** A single point in the location stream the session consumes. */
export interface LocationSample {
  readonly latitude: number;
  readonly longitude: number;
  /** Sample time in ms epoch. Defaults to Date.now() if omitted. */
  readonly timestamp?: number;
}

export interface RideContext {
  readonly rideId: number;
  readonly rideName: string;
  readonly parkId?: number;
  /** Posted wait in minutes from queue-times, if known at detect time. */
  readonly postedWaitMinutes?: number | null;
  readonly imageUrl?: string | null;
}

/**
 * Typed activity queue. Each item declares its `type`; a 'minigame' item
 * carries the concrete game id so the screen can mount the right game later
 * (Wave 2). trivia/lore/prediction items are resolved by the content loaders.
 */
export type MiniGameId = 'tap' | 'timing' | 'memory' | 'trivia' | 'shark';

export type ActivityItem =
  | { readonly kind: 'minigame'; readonly id: string; readonly gameId: MiniGameId; readonly seed: number }
  | { readonly kind: 'trivia'; readonly id: string; readonly seed: number }
  | { readonly kind: 'lore'; readonly id: string; readonly seed: number }
  | { readonly kind: 'prediction'; readonly id: string; readonly card: PredictionCard };

/** Display-only accrual model. Server is the source of truth for real rewards. */
export interface AccrualDisplay {
  /** Whole "ticks" accrued so far (one per accrual interval survived). */
  readonly ticks: number;
  /** Estimated bonus energy for display, derived from ticks. */
  readonly estimatedEnergy: number;
  /** Fraction [0,1] toward the next tick, for a progress ring. */
  readonly progressToNextTick: number;
}

export interface SessionRewards {
  readonly durationSeconds: number;
  readonly rideParts: ReadonlyArray<{ ridePart: RidePartType; quantity: number }>;
  readonly bonusEnergy: number;
  readonly experience: number;
}

export interface SessionSnapshot {
  readonly state: LinePlayState;
  readonly ride: RideContext | null;
  /** Server session id once started. */
  readonly serverSessionId: string | null;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  /** Posted wait used to size the session (minutes). */
  readonly plannedWaitMinutes: number;
  /** Elapsed session seconds (frozen once ending/complete). */
  readonly elapsedSeconds: number;
  readonly pauseReason: PauseReason | null;
  /** ms remaining in the exit grace window when in `ending`. */
  readonly graceMsRemaining: number;
  readonly playlist: ReadonlyArray<ActivityItem>;
  readonly accrual: AccrualDisplay;
  /** Populated once the server complete succeeds. */
  readonly rewards: SessionRewards | null;
  /** True while the complete call is queued for retry (offline). */
  readonly rewardsPending: boolean;
}

type Listener = (snap: SessionSnapshot) => void;

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Sustained movement threshold that auto-pauses games. */
const MOVE_SPEED_MPS = 0.7;
/** How long movement must be sustained before auto-pause fires. */
const MOVE_SUSTAIN_MS = 5_000;
/** Grace window for exit undo. */
const EXIT_GRACE_MS = 60_000;
/** One accrual tick per this many seconds (display model). */
const ACCRUAL_TICK_SECONDS = 30;
/** Display-only energy per tick. Server value overrides at complete. */
const ENERGY_PER_TICK = 5;
/** Fallback session length when no wait is known at all (minutes). */
const DEFAULT_WAIT_MINUTES = 20;
/** Each minigame round is ~this long; used to size the playlist. */
const MINIGAME_ROUND_SECONDS = 105;
/** trivia/lore/prediction slots are lighter; ~this long each. */
const LIGHT_ROUND_SECONDS = 45;

const WAIT_CACHE_PREFIX = 'lineplay_wait_cache_';

/** Round-robin order for the playlist generator. */
const ROUND_ROBIN: ReadonlyArray<ActivityItem['kind']> = ['minigame', 'trivia', 'lore', 'prediction'];
/** Minigames cycled through for 'minigame' slots. */
const MINIGAME_CYCLE: ReadonlyArray<MiniGameId> = ['shark', 'tap', 'timing', 'memory'];

function haversineMeters(a: LocationSample, b: LocationSample): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ---------------------------------------------------------------------------
// Wait-time sizing with offline cache
// ---------------------------------------------------------------------------

/**
 * Persist the last-known posted wait for a ride so a session can be sized even
 * when queue-times is unreachable at start.
 */
export async function cacheWaitTime(rideId: number, waitMinutes: number): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${WAIT_CACHE_PREFIX}${rideId}`,
      JSON.stringify({ waitMinutes, cachedAt: Date.now() }),
    );
  } catch {
    /* non-fatal */
  }
}

/** Read the last-known posted wait for a ride, or null if none cached. */
export async function readCachedWaitTime(rideId: number): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(`${WAIT_CACHE_PREFIX}${rideId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { waitMinutes: number };
    return typeof parsed.waitMinutes === 'number' ? parsed.waitMinutes : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the session length in minutes: live posted wait if present, else the
 * cached last-known, else a sane default. Also refreshes the cache when a live
 * value is present.
 */
export async function resolveSessionWaitMinutes(ride: RideContext): Promise<number> {
  if (ride.postedWaitMinutes != null && ride.postedWaitMinutes > 0) {
    await cacheWaitTime(ride.rideId, ride.postedWaitMinutes);
    return ride.postedWaitMinutes;
  }
  const cached = await readCachedWaitTime(ride.rideId);
  if (cached != null && cached > 0) return cached;
  return DEFAULT_WAIT_MINUTES;
}

// ---------------------------------------------------------------------------
// Playlist generator
// ---------------------------------------------------------------------------

/**
 * Build a typed activity playlist sized to the remaining wait. Round-robins
 * minigame -> trivia -> lore -> prediction. A single prediction card is placed
 * (it resolves once at session end), and it's biased toward the middle so it
 * lands while the player is engaged rather than on the very first slot.
 */
export function generatePlaylist(waitMinutes: number, postedWaitMinutes: number): ActivityItem[] {
  const waitSeconds = Math.max(60, waitMinutes * 60);
  const items: ActivityItem[] = [];
  const predictionCard = buildPredictionCard(postedWaitMinutes);
  let predictionPlaced = false;
  let budget = waitSeconds;
  let slot = 0;
  let minigameCycle = 0;

  // Cap the number of slots so a very long wait doesn't build a giant array.
  const MAX_SLOTS = 40;

  while (budget > 0 && items.length < MAX_SLOTS) {
    const kind = ROUND_ROBIN[slot % ROUND_ROBIN.length];
    slot += 1;

    if (kind === 'prediction') {
      // Only one prediction per session; skip subsequent prediction turns.
      if (predictionPlaced) continue;
      predictionPlaced = true;
      items.push({ kind: 'prediction', id: `pred-${slot}`, card: predictionCard });
      budget -= LIGHT_ROUND_SECONDS;
      continue;
    }

    if (kind === 'minigame') {
      const gameId = MINIGAME_CYCLE[minigameCycle % MINIGAME_CYCLE.length];
      minigameCycle += 1;
      items.push({ kind: 'minigame', id: `mg-${slot}`, gameId, seed: slot });
      budget -= MINIGAME_ROUND_SECONDS;
      continue;
    }

    if (kind === 'trivia') {
      items.push({ kind: 'trivia', id: `tr-${slot}`, seed: slot });
      budget -= LIGHT_ROUND_SECONDS;
      continue;
    }

    // lore
    items.push({ kind: 'lore', id: `lo-${slot}`, seed: slot });
    budget -= LIGHT_ROUND_SECONDS;
  }

  // Guarantee the prediction is present even on very short waits.
  if (!predictionPlaced) {
    items.push({ kind: 'prediction', id: 'pred-final', card: predictionCard });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Session controller
// ---------------------------------------------------------------------------

export class LinePlaySession {
  private state: LinePlayState = 'idle';
  private ride: RideContext | null = null;
  private serverSessionId: string | null = null;
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private plannedWaitMinutes = DEFAULT_WAIT_MINUTES;
  private pauseReason: PauseReason | null = null;
  private playlist: ActivityItem[] = [];
  private rewards: SessionRewards | null = null;
  private rewardsPending = false;

  private listeners = new Set<Listener>();

  // Movement tracking for auto-pause.
  private lastSample: LocationSample | null = null;
  private sustainedMoveStart: number | null = null;

  // Exit grace timer.
  private graceStartedAt: number | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Ticking timer that pushes snapshots so elapsed/accrual update live. */
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  private readonly retryQueue: RedeemRetryQueue<{ sessionId: string }>;

  constructor() {
    // The queue executes completeInLineTimer with idempotency. On success it
    // stashes the server rewards so a late-draining complete still updates UI
    // if a subscriber is listening.
    this.retryQueue = new RedeemRetryQueue<{ sessionId: string }>({
      storageKey: 'lineplay_complete_retry_queue',
      maxAttempts: 8,
      executor: async ({ sessionId }) => {
        const res = await completeInLineTimer(sessionId);
        if (res?.success) {
          this.applyServerRewards(res.duration_seconds, res.rewards);
          return true;
        }
        return false;
      },
    });
  }

  // -- subscription -------------------------------------------------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    this.listeners.forEach((l) => {
      try {
        l(snap);
      } catch (e) {
        console.warn('[LinePlaySession] listener error:', e);
      }
    });
  }

  getState(): LinePlayState {
    return this.state;
  }

  snapshot(): SessionSnapshot {
    return {
      state: this.state,
      ride: this.ride,
      serverSessionId: this.serverSessionId,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      plannedWaitMinutes: this.plannedWaitMinutes,
      elapsedSeconds: this.computeElapsedSeconds(),
      pauseReason: this.pauseReason,
      graceMsRemaining: this.computeGraceRemaining(),
      playlist: this.playlist,
      accrual: this.computeAccrual(),
      rewards: this.rewards,
      rewardsPending: this.rewardsPending,
    };
  }

  private computeElapsedSeconds(): number {
    if (!this.startedAt) return 0;
    const end = this.endedAt ?? Date.now();
    return Math.max(0, Math.floor((end - this.startedAt) / 1000));
  }

  private computeAccrual(): AccrualDisplay {
    const elapsed = this.computeElapsedSeconds();
    const ticks = Math.floor(elapsed / ACCRUAL_TICK_SECONDS);
    const intoTick = elapsed % ACCRUAL_TICK_SECONDS;
    return {
      ticks,
      estimatedEnergy: ticks * ENERGY_PER_TICK,
      progressToNextTick: intoTick / ACCRUAL_TICK_SECONDS,
    };
  }

  private computeGraceRemaining(): number {
    if (this.state !== 'ending' || this.graceStartedAt == null) return 0;
    return Math.max(0, EXIT_GRACE_MS - (Date.now() - this.graceStartedAt));
  }

  // -- lifecycle ----------------------------------------------------------

  /**
   * Move to `detected` (soft-banner candidate). Idempotent-ish: only valid
   * from idle/complete.
   */
  markDetected(ride: RideContext): void {
    if (this.state !== 'idle' && this.state !== 'complete') return;
    this.ride = ride;
    this.state = 'detected';
    this.emit();
  }

  /**
   * Start a session for a ride. Sizes from posted wait (with offline cache),
   * builds the playlist, and calls the server timer. If the server call fails
   * we still run locally (offline-first) with a null serverSessionId; complete
   * will then no-op the server call gracefully.
   */
  async start(ride: RideContext): Promise<void> {
    if (this.state === 'active' || this.state === 'paused') return;

    this.ride = ride;
    this.rewards = null;
    this.rewardsPending = false;
    this.endedAt = null;
    this.pauseReason = null;
    this.lastSample = null;
    this.sustainedMoveStart = null;

    this.plannedWaitMinutes = await resolveSessionWaitMinutes(ride);
    this.playlist = generatePlaylist(
      this.plannedWaitMinutes,
      ride.postedWaitMinutes ?? this.plannedWaitMinutes,
    );

    this.startedAt = Date.now();
    this.state = 'active';
    this.startTicking();
    this.emit();

    // Server timer is authoritative but must not block local play.
    try {
      const res = await startInLineTimer(ride.rideId, Math.round(this.plannedWaitMinutes));
      if (res?.success) {
        this.serverSessionId = res.session_id;
        if (this.startedAt == null) {
          // Session was ended before the server responded; ignore.
          return;
        }
        this.emit();
      }
    } catch (e) {
      console.warn('[LinePlaySession] startInLineTimer failed, running offline:', e);
      // serverSessionId stays null; complete() will skip the server call.
    }
  }

  /** Auto-pause (line moving) or manual pause. Only from active. */
  pause(reason: PauseReason): void {
    if (this.state !== 'active') return;
    this.state = 'paused';
    this.pauseReason = reason;
    this.emit();
  }

  /** Resume from a pause. */
  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'active';
    this.pauseReason = null;
    this.sustainedMoveStart = null;
    this.emit();
  }

  /**
   * Begin ending with a 60s grace window (exit undo). Called on detected exit
   * or when the user taps "End session". Auto-completes when the grace expires
   * unless undoEnd() is called first.
   */
  beginEnding(): void {
    if (this.state !== 'active' && this.state !== 'paused') return;
    this.state = 'ending';
    this.graceStartedAt = Date.now();
    this.emit();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      void this.complete();
    }, EXIT_GRACE_MS);
    // Keep ticking so graceMsRemaining animates down.
  }

  /** Cancel an in-progress ending and return to active. */
  undoEnd(): void {
    if (this.state !== 'ending') return;
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.graceStartedAt = null;
    this.state = 'active';
    this.pauseReason = null;
    this.emit();
  }

  /**
   * Complete the session: freeze time, call the server (routing failures to the
   * retry queue), and move to `complete`. Safe to call from active/paused/ending.
   */
  async complete(): Promise<void> {
    if (this.state === 'complete' || this.state === 'idle') return;

    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.graceStartedAt = null;
    this.endedAt = Date.now();
    this.state = 'complete';
    this.stopTicking();

    const sessionId = this.serverSessionId;
    if (!sessionId) {
      // Offline session that never got a server id: nothing to complete
      // server-side. Show local elapsed; no server rewards.
      this.rewardsPending = false;
      this.emit();
      return;
    }

    // Attempt the complete immediately; on failure, queue for retry.
    try {
      const res = await completeInLineTimer(sessionId);
      if (res?.success) {
        this.applyServerRewards(res.duration_seconds, res.rewards);
      } else {
        await this.queueComplete(sessionId);
      }
    } catch (e) {
      console.warn('[LinePlaySession] completeInLineTimer failed, queueing:', e);
      await this.queueComplete(sessionId);
    }
    this.emit();
  }

  private async queueComplete(sessionId: string): Promise<void> {
    this.rewardsPending = true;
    // Idempotency key = the server session id, so a session is never completed
    // twice even across app restarts.
    await this.retryQueue.enqueue({ sessionId }, `complete_${sessionId}`);
  }

  private applyServerRewards(
    durationSeconds: number,
    rewards: {
      ride_parts: Array<{ ride_part: RidePartType; quantity: number }>;
      bonus_energy: number;
      experience: number;
    },
  ): void {
    this.rewards = {
      durationSeconds,
      rideParts: rewards.ride_parts.map((rp) => ({ ridePart: rp.ride_part, quantity: rp.quantity })),
      bonusEnergy: rewards.bonus_energy,
      experience: rewards.experience,
    };
    this.rewardsPending = false;
    this.emit();
  }

  /** Manually kick the retry queue (e.g. after regaining connectivity). */
  async drainRetryQueue(): Promise<void> {
    await this.retryQueue.drain();
  }

  /** Reset to idle and tear down timers/listeners on the retry queue. */
  reset(): void {
    this.stopTicking();
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.state = 'idle';
    this.ride = null;
    this.serverSessionId = null;
    this.startedAt = null;
    this.endedAt = null;
    this.pauseReason = null;
    this.graceStartedAt = null;
    this.playlist = [];
    this.rewards = null;
    this.rewardsPending = false;
    this.lastSample = null;
    this.sustainedMoveStart = null;
    this.emit();
  }

  /** Full teardown — call when the session controller is discarded. */
  dispose(): void {
    this.stopTicking();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.retryQueue.dispose();
    this.listeners.clear();
  }

  // -- movement / auto-pause ---------------------------------------------

  /**
   * Feed a location sample from the shared LocationContext stream. Computes
   * instantaneous speed from the previous sample and auto-pauses when movement
   * is sustained above threshold for MOVE_SUSTAIN_MS. Resuming is manual (one
   * tap) per the interruption model.
   *
   * We never create a watcher here — the screen wires this to the context's
   * `location` updates.
   */
  ingestLocation(sample: LocationSample): void {
    const now = sample.timestamp ?? Date.now();
    const prev = this.lastSample;
    this.lastSample = { ...sample, timestamp: now };

    if (this.state !== 'active') {
      // Only auto-pause from active play. Still keep lastSample fresh.
      return;
    }
    if (!prev || prev.timestamp == null) return;

    const dtSec = (now - prev.timestamp) / 1000;
    if (dtSec <= 0) return;

    const meters = haversineMeters(prev, sample);
    const speed = meters / dtSec; // m/s

    if (speed > MOVE_SPEED_MPS) {
      if (this.sustainedMoveStart == null) {
        this.sustainedMoveStart = now;
      } else if (now - this.sustainedMoveStart >= MOVE_SUSTAIN_MS) {
        this.pause('lineMoving');
      }
    } else {
      // Movement broke; reset the sustain window.
      this.sustainedMoveStart = null;
    }
  }

  // -- internal ticking ---------------------------------------------------

  private startTicking(): void {
    if (this.tickTimer) return;
    // 1s tick is display-only (elapsed/accrual/grace); it does NOT hit the
    // network or GPS, so it doesn't violate the "no polling faster than 30s"
    // battery rule (that rule is about network/location polling).
    this.tickTimer = setInterval(() => {
      if (this.state === 'complete' || this.state === 'idle') return;
      this.emit();
    }, 1000);
  }

  private stopTicking(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}
