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
 *   - Auto-pause only on sustained, trustworthy movement from the shared
 *     LocationContext stream — this class never creates its own watcher.
 *
 * IMPORTANT — this is a plain controller class, framework-agnostic. The screen
 * subscribes to it and feeds it location samples from useContext(LocationContext).
 * That satisfies "subscribe, don't create new watchers": we consume the app's
 * existing location state rather than spinning up another watchPositionAsync.
 *
 * BATTERY / ACCURACY: useLinePlaySession temporarily switches the shared
 * LocationProvider watcher to High accuracy during an active queue wait.
 * It restores navigation accuracy when play ends or the screen unmounts.
 * LinePlay still creates no new GPS watcher and does not keep the screen awake.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import startInLineTimer from '../../api/endpoints/me/inline-timer/start';
import completeInLineTimer from '../../api/endpoints/me/inline-timer/complete';
import type { QueueStoryMemento } from '../../api/endpoints/me/inline-timer/complete';
import heartbeatInLineTimer from '../../api/endpoints/me/inline-timer/heartbeat';
import readInLineTimer from '../../api/endpoints/me/inline-timer/read';
import chooseLineSignal from '../../api/endpoints/me/inline-timer/signal';
import guessCrewPuzzle from '../../api/endpoints/me/inline-timer/puzzle';
import submitCurrentQuest, { type CurrentQuestProof } from '../../api/endpoints/me/inline-timer/currentQuest';
import { voteParkProject, type ParkProject } from '../../api/endpoints/me/park-projects';
import type { LineSignalSummary } from '../../api/endpoints/me/inline-timer/types';
import type { LineSessionResponse } from '../../api/endpoints/me/inline-timer/types';
import { RidePartType } from '../../models/ride-part-type';
import { linePlayRewardQueue, subscribeLinePlayRewardRecovery } from './rewardRecovery';
import {
  buildPredictionCard,
  PredictionCard,
} from './content';
import { adaptiveEpisodeCountForRide, getLinePlayChapter, type LinePlayChapter } from './chapters';
import { recordAdaptiveEpisode, selectAdaptiveEpisode } from './episodeRotation';
import { readCheckpoint, writeCheckpoint, removeCheckpoint, type LinePlayCheckpoint } from './checkpoint';
import { createCrewRelay, isCrewRelayProgress, type CrewRelayProgress } from './crewRelay';
import { crewGridHasLine } from './crewGrid';
import { activateQueueBackgroundHeartbeat, deactivateQueueBackgroundHeartbeat } from './backgroundQueueHeartbeat';
import { LINEPLAY_ROUND_QUESTIONS } from '../../games/trivia/config';

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
  /** OS horizontal accuracy and speed are optional; absent data cannot auto-pause games. */
  readonly accuracyMeters?: number | null;
  readonly speedMps?: number | null;
}

/** Queue credit requires a real, recent position fix rather than a cached coordinate. */
export function isRecentQueueSample(sample: LocationSample | null | undefined, now = Date.now()): sample is LocationSample & { timestamp: number } {
  return Boolean(sample && Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude) &&
    typeof sample.timestamp === 'number' && Number.isFinite(sample.timestamp) &&
    sample.timestamp <= now + 5_000 && now - sample.timestamp <= 45_000);
}

export interface RideContext {
  readonly rideId: number;
  readonly rideName: string;
  readonly rideSlug?: string;
  readonly parkId?: number;
  /** Posted wait in minutes from queue-times, if known at detect time. */
  readonly postedWaitMinutes?: number | null;
  /** When the queue-times request that supplied this number completed. */
  readonly postedWaitObservedAt?: number | null;
  /** Exact ID in the queue-times feed, used only for live entrance-wait updates. */
  readonly waitFeedRideId?: string | null;
  readonly imageUrl?: string | null;
  /** False means the server catalog cannot award Parts for this ride. */
  readonly lineRewardsReady?: boolean;
}

export type WaitSource = 'posted' | 'last_known' | 'estimate';

/**
 * Typed activity queue. Each item declares its `type`; a 'minigame' item
 * carries the concrete game id so the screen can mount the right game later
 * (Wave 2). trivia/lore/prediction items are resolved by the content loaders.
 */
export type MiniGameId = 'tap' | 'timing' | 'memory' | 'trivia' | 'shark' | 'banana' | 'current' | 'showdown';

export type ActivityItem =
  | { readonly kind: 'chapter_intro'; readonly id: string }
  | { readonly kind: 'crew_relay'; readonly id: string }
  | { readonly kind: 'crew_grid'; readonly id: string; readonly seed: number }
  | { readonly kind: 'minigame'; readonly id: string; readonly gameId: MiniGameId;
      readonly seed: number; readonly title?: string; readonly preview?: string }
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
  readonly coinAssetId?: number | null;
  readonly durationSeconds: number;
  readonly rideParts: ReadonlyArray<{ ridePart: RidePartType; quantity: number }>;
  readonly bonusEnergy: number;
  readonly experience: number;
  readonly tickets: number;
  readonly masteryBonusParts: number;
  readonly crewPuzzleBonusParts: number;
  readonly currentQuestBonusParts: number;
}

export interface SessionSnapshot {
  readonly state: LinePlayState;
  readonly ride: RideContext | null;
  readonly chapter: LinePlayChapter | null;
  /** Server session id once started. */
  readonly serverSessionId: string | null;
  /** The server explicitly cannot offer ride rewards for this session. */
  readonly rewardUnavailable: boolean;
  readonly backgroundTrackingAvailable: boolean | null;
  readonly verifiedEligibleSeconds: number;
  /** Local clock time of the last successful nearby server sample. Display only. */
  readonly verifiedPresenceAt: number | null;
  readonly creditedParts: number | null;
  readonly partsRemainingToday: number | null;
  readonly partIntervalSeconds: number;
  readonly sessionPartCap: number;
  readonly ticketIntervalSeconds: number;
  readonly ticketAvailable: boolean | null;
  readonly masteryBonusAvailable: boolean;
  readonly crewPuzzleBonusAvailable: boolean;
  readonly currentQuestBonusEnabled: boolean;
  readonly currentQuestSeed: number | null;
  readonly currentQuestVerified: boolean;
  readonly currentQuestProofPending: boolean;
  readonly signal: LineSignalSummary | null;
  readonly parkProject: ParkProject | null;
  readonly projectPending: boolean;
  readonly projectError: string | null;
  readonly signalPending: boolean;
  readonly signalError: string | null;
  readonly puzzlePending: boolean;
  readonly puzzleRetryPending: boolean;
  readonly puzzleRetrySymbols: readonly number[] | null;
  readonly puzzleError: string | null;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  /** Posted wait used to size the session (minutes). */
  readonly plannedWaitMinutes: number;
  readonly waitSource: WaitSource;
  readonly entranceWaitMinutes: number | null;
  readonly entranceWaitObservedAt: number | null;
  readonly entranceWaitChangeMinutes: number;
  readonly extraRoundsAdded: number;
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
  readonly completedActivityIds: readonly string[];
  readonly loreChoices: Readonly<Record<string, number>>;
  readonly crewGridMarks: readonly number[];
  readonly prediction: { card: PredictionCard; guess: 'beat' | 'miss' } | null;
  /** Guest explicitly said they reached boarding; never inferred from ending a session. */
  readonly boardingConfirmed: boolean;
  readonly boardingAt: number | null;
  readonly crewRelay: CrewRelayProgress | null;
}

type Listener = (snap: SessionSnapshot) => void;

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** A queue shuffle should not pause play; sustained walking should. */
const MOVE_SPEED_MPS = 0.8;
/** How long movement must be sustained before auto-pause fires. */
const MOVE_SUSTAIN_MS = 5_000;
const MOVE_MAX_SAMPLE_GAP_MS = 10_000;
const MOVE_MAX_ACCURACY_METERS = 20;
const MOVE_MIN_NET_METERS = 6;
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
/** Keep a long line playable without building an unbounded checkpoint or carousel. */
export const MAX_SESSION_ACTIVITY_SLOTS = 80;

const WAIT_CACHE_PREFIX = 'lineplay_wait_cache_';
const FRESH_WAIT_MS = 10 * 60 * 1000;
const CACHE_WAIT_MS = 3 * 60 * 60 * 1000;

/** Round-robin order for the playlist generator. */
const ROUND_ROBIN: ReadonlyArray<ActivityItem['kind']> = ['minigame', 'trivia', 'lore', 'prediction'];
/** Minigames cycled through for 'minigame' slots. */
const MINIGAME_CYCLE: ReadonlyArray<MiniGameId> = ['current', 'trivia', 'shark', 'showdown', 'tap', 'banana', 'timing', 'memory'];

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
export async function cacheWaitTime(rideId: number, waitMinutes: number, observedAt = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${WAIT_CACHE_PREFIX}${rideId}`,
      JSON.stringify({ waitMinutes, cachedAt: observedAt }),
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
    const parsed = JSON.parse(raw) as { waitMinutes: number; cachedAt: number };
    const age = Date.now() - parsed.cachedAt;
    return Number.isFinite(parsed.waitMinutes) && parsed.waitMinutes > 0 &&
      Number.isFinite(parsed.cachedAt) && age >= 0 && age <= CACHE_WAIT_MS
      ? parsed.waitMinutes : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the session length in minutes: live posted wait if present, else the
 * cached last-known, else a sane default. Also refreshes the cache when a live
 * value is present.
 */
export async function resolveSessionWait(ride: RideContext): Promise<{ minutes: number; source: WaitSource }> {
  const observedAt = ride.postedWaitObservedAt;
  const age = observedAt == null ? null : Date.now() - observedAt;
  if (ride.postedWaitMinutes != null && ride.postedWaitMinutes > 0 &&
      Number.isFinite(ride.postedWaitMinutes) && (age === null || (age >= 0 && age <= CACHE_WAIT_MS))) {
    if (age !== null && age <= FRESH_WAIT_MS) {
      await cacheWaitTime(ride.rideId, ride.postedWaitMinutes, observedAt!);
      return { minutes: ride.postedWaitMinutes, source: 'posted' };
    }
    return { minutes: ride.postedWaitMinutes, source: 'last_known' };
  }
  const cached = await readCachedWaitTime(ride.rideId);
  if (cached != null) return { minutes: cached, source: 'last_known' };
  return { minutes: DEFAULT_WAIT_MINUTES, source: 'estimate' };
}

export async function resolveSessionWaitMinutes(ride: RideContext): Promise<number> {
  return (await resolveSessionWait(ride)).minutes;
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
export function generatePlaylist(waitMinutes: number, postedWaitMinutes: number,
  chapter?: LinePlayChapter | null, allowPrediction = true, seedOffset = 0): ActivityItem[] {
  const rotation = Math.abs(Math.floor(seedOffset));
  const waitSeconds = Math.max(60, waitMinutes * 60);
  // The opening activity is one question. Rotate across every authored clue
  // while keeping a large session hash inside the ride's story.
  const openingTriviaSeed = chapter?.trivia?.length
    ? rotation % chapter.trivia.length
    : rotation;
  const featuredLoreSeed = chapter?.fieldNotes?.length
    ? rotation % Math.min(3, chapter.fieldNotes.length) : rotation;
  const items: ActivityItem[] = chapter ? [
    { kind: 'chapter_intro', id: `${chapter.id}-intro` },
    { kind: 'crew_relay', id: `${chapter.id}-crew-relay` },
    { kind: 'crew_grid', id: `${chapter.id}-crew-grid`, seed: rotation + 5 },
    { kind: 'trivia', id: `${chapter.id}-trivia`, seed: openingTriviaSeed },
    { kind: 'lore', id: `${chapter.id}-field-note`, seed: featuredLoreSeed },
    { kind: 'minigame', id: `${chapter.id}-${chapter.finale.idSuffix}`,
      gameId: chapter.finale.gameId ?? 'memory', seed: rotation + 2,
      title: chapter.finale.title, preview: chapter.finale.preview },
  ] : [];
  const predictionCard = buildPredictionCard(postedWaitMinutes);
  let predictionPlaced = false;
  let budget = waitSeconds;
  let slot = 0;
  let minigameCycle = rotation % MINIGAME_CYCLE.length;
  // Inline trivia cards consume one question; the Trivia+ game consumes five.
  // Share one cursor so neither format immediately repeats the other.
  let triviaSeed = chapter ? openingTriviaSeed + 1 : rotation;
  let loreSeed = chapter ? featuredLoreSeed + 1 : rotation;

  // Cap the number of slots so a very long wait doesn't build a giant array.
  const MAX_SLOTS = 40;

  while (budget > 0 && items.length < MAX_SLOTS) {
    const kind = ROUND_ROBIN[slot % ROUND_ROBIN.length];
    slot += 1;

    if (kind === 'prediction') {
      if (allowPrediction && !predictionPlaced) {
        predictionPlaced = true;
        items.push({ kind: 'prediction', id: `pred-${slot}`, card: predictionCard });
      } else {
        items.push({ kind: 'lore', id: `lo-${slot}`, seed: loreSeed++ });
      }
      budget -= LIGHT_ROUND_SECONDS;
      continue;
    }

    if (kind === 'minigame') {
      const gameId = MINIGAME_CYCLE[minigameCycle % MINIGAME_CYCLE.length];
      minigameCycle += 1;
      const gameSeed = gameId === 'trivia' ? triviaSeed : slot + rotation;
      if (gameId === 'trivia') triviaSeed += LINEPLAY_ROUND_QUESTIONS;
      items.push({ kind: 'minigame', id: `mg-${slot}`, gameId, seed: gameSeed });
      budget -= MINIGAME_ROUND_SECONDS;
      continue;
    }

    if (kind === 'trivia') {
      items.push({ kind: 'trivia', id: `tr-${slot}`, seed: triviaSeed });
      triviaSeed += 1;
      budget -= LIGHT_ROUND_SECONDS;
      continue;
    }

    // lore
    items.push({ kind: 'lore', id: `lo-${slot}`, seed: loreSeed++ });
    budget -= LIGHT_ROUND_SECONDS;
  }

  // Guarantee the prediction is present even on very short waits.
  if (allowPrediction && !predictionPlaced) {
    items.push({ kind: 'prediction', id: 'pred-final', card: predictionCard });
  }

  return items;
}

/** A fresh, optional ten-minute wave after a guest reaches the planned tail. */
export function generateEncoreRounds(startIndex: number, seedOffset: number): ActivityItem[] {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= MAX_SESSION_ACTIVITY_SLOTS) return [];
  const rotation = seedOffset + startIndex * 17;
  return generatePlaylist(10, 10, null, false, rotation)
    .filter(item => item.kind === 'minigame' || item.kind === 'trivia' || item.kind === 'lore')
    .slice(0, Math.min(8, MAX_SESSION_ACTIVITY_SLOTS - startIndex))
    .map(item => ({ ...item, id: `encore-${startIndex}-${item.id}` }));
}

/** A resumed session uses the same request ID, so its activity order cannot jump. */
export function playlistRotation(requestId: string): number {
  let hash = 0;
  for (let i = 0; i < requestId.length; i++) {
    hash = (Math.imul(hash, 31) + requestId.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Session controller
// ---------------------------------------------------------------------------

export class LinePlaySession {
  private disposed = false;
  private state: LinePlayState = 'idle';
  private ride: RideContext | null = null;
  private chapter: LinePlayChapter | null = null;
  private adaptiveEpisodeRecorded = false;
  private serverSessionId: string | null = null;
  private rewardUnavailable = false;
  private verifiedEligibleSeconds = 0;
  private creditedParts: number | null = null;
  private partsRemainingToday: number | null = null;
  private partIntervalSeconds = 600;
  private sessionPartCap = 12;
  private ticketIntervalSeconds = 600;
  private ticketAvailable: boolean | null = null;
  private masteryBonusAvailable = false;
  private crewPuzzleBonusAvailable = false;
  private signal: LineSignalSummary | null = null;
  private parkProject: ParkProject | null = null;
  private projectPending = false;
  private projectError: string | null = null;
  private signalPending = false;
  private signalError: string | null = null;
  private puzzlePending = false;
  private puzzleError: string | null = null;
  private puzzleRequest: { id: string; stage: number; symbols: readonly number[] } | null = null;
  private startRequestId: string | null = null;
  private serverStartInFlight: Promise<void> | null = null;
  private heartbeatInFlight = false;
  private sharedReadInFlight = false;
  private lastSuccessfulPresenceUpdateAt = 0;
  private lastSharedReadAttemptAt = 0;
  private serverSnapshotRevision = 0;
  private lastServerStartAttemptAt = 0;
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private plannedWaitMinutes = DEFAULT_WAIT_MINUTES;
  private waitSource: WaitSource = 'estimate';
  private entranceWaitMinutes: number | null = null;
  private entranceWaitObservedAt: number | null = null;
  private entranceWaitChangeMinutes = 0;
  private extraRoundsAdded = 0;
  private pauseReason: PauseReason | null = null;
  private playlist: ActivityItem[] = [];
  private playlistSeedOffset = 0;
  private rewards: SessionRewards | null = null;
  private rewardsPending = false;
  private currentQuestBonusEnabled = false;
  private currentQuestSeed: number | null = null;
  private currentQuestVerified = false;
  private currentQuestProof: CurrentQuestProof | null = null;
  private currentQuestSubmission: Promise<void> | null = null;
  private completionInFlight: Promise<void> | null = null;
  private checkpointPlayerId: number | null = null;
  private backgroundTrackingSessionId: string | null = null;
  private backgroundTrackingAvailable: boolean | null = null;
  private checkpointWrites: Promise<void> = Promise.resolve();
  private completedActivityIds = new Set<string>();
  private loreChoices: Record<string, number> = {};
  private crewGridMarks: number[] = [];
  private prediction: { card: PredictionCard; guess: 'beat' | 'miss' } | null = null;
  private boardingConfirmed = false;
  private boardingAt: number | null = null;
  private crewRelay: CrewRelayProgress | null = null;

  private listeners = new Set<Listener>();

  private applySignal(next: LineSignalSummary | null): void {
    this.signal = next;
    this.serverSnapshotRevision += 1;
    if (this.puzzleRequest && next?.puzzle && (
        next.puzzle.last_result?.client_request_id === this.puzzleRequest.id ||
        next.puzzle.stage !== this.puzzleRequest.stage || next.puzzle.completed)) {
      this.puzzleRequest = null;
      this.puzzleError = null;
    }
  }

  private applyParkProject(next: ParkProject | null): void {
    if (next && this.parkProject?.id === next.id) {
      const currentVotes = this.parkProject.chapter_a_votes + this.parkProject.chapter_b_votes;
      const nextVotes = next.chapter_a_votes + next.chapter_b_votes;
      if (next.total_points < this.parkProject.total_points || nextVotes < currentVotes) return;
    }
    this.parkProject = next;
    this.serverSnapshotRevision += 1;
  }

  // Movement tracking for auto-pause.
  private lastSample: LocationSample | null = null;
  private sustainedMoveStart: number | null = null;
  private sustainedMoveOrigin: LocationSample | null = null;

  // Exit grace timer.
  private graceStartedAt: number | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Ticking timer that pushes snapshots so elapsed/accrual update live. */
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  private readonly retryQueue = linePlayRewardQueue;
  private readonly unsubscribeRecovery: () => void;

  constructor() {
    // The queue executes completeInLineTimer with idempotency. On success it
    // stashes the server rewards so a late-draining complete still updates UI
    // if a subscriber is listening.
    this.unsubscribeRecovery = subscribeLinePlayRewardRecovery((sessionId, response) => {
      if (!this.disposed && this.serverSessionId === sessionId) this.applyServerSnapshot(response);
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
      chapter: this.chapter,
      serverSessionId: this.serverSessionId,
      rewardUnavailable: this.rewardUnavailable,
      backgroundTrackingAvailable: this.backgroundTrackingAvailable,
      verifiedEligibleSeconds: this.verifiedEligibleSeconds,
      verifiedPresenceAt: this.lastSuccessfulPresenceUpdateAt || null,
      creditedParts: this.creditedParts,
      partsRemainingToday: this.partsRemainingToday,
      rewards: this.rewards,
      rewardsPending: this.rewardsPending,
      partIntervalSeconds: this.partIntervalSeconds,
      sessionPartCap: this.sessionPartCap,
      ticketIntervalSeconds: this.ticketIntervalSeconds,
      ticketAvailable: this.ticketAvailable,
      masteryBonusAvailable: this.masteryBonusAvailable,
      crewPuzzleBonusAvailable: this.crewPuzzleBonusAvailable,
      currentQuestBonusEnabled: this.currentQuestBonusEnabled,
      currentQuestSeed: this.currentQuestSeed,
      currentQuestVerified: this.currentQuestVerified,
      currentQuestProofPending: this.currentQuestProof !== null && !this.currentQuestVerified,
      signal: this.signal,
      parkProject: this.parkProject,
      projectPending: this.projectPending,
      projectError: this.projectError,
      signalPending: this.signalPending,
      signalError: this.signalError,
      puzzlePending: this.puzzlePending,
      puzzleRetryPending: this.puzzleRequest !== null,
      puzzleRetrySymbols: this.puzzleRequest?.symbols ?? null,
      puzzleError: this.puzzleError,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      plannedWaitMinutes: this.plannedWaitMinutes,
      waitSource: this.waitSource,
      entranceWaitMinutes: this.entranceWaitMinutes,
      entranceWaitObservedAt: this.entranceWaitObservedAt,
      entranceWaitChangeMinutes: this.entranceWaitChangeMinutes,
      extraRoundsAdded: this.extraRoundsAdded,
      elapsedSeconds: this.computeElapsedSeconds(),
      pauseReason: this.pauseReason,
      graceMsRemaining: this.computeGraceRemaining(),
      playlist: this.playlist,
      accrual: this.computeAccrual(),
      completedActivityIds: Array.from(this.completedActivityIds),
      loreChoices: { ...this.loreChoices },
      crewGridMarks: [...this.crewGridMarks],
      prediction: this.prediction,
      boardingConfirmed: this.boardingConfirmed,
      boardingAt: this.boardingAt,
      crewRelay: this.crewRelay,
    };
  }

  private persistCheckpoint(): void {
    if (!this.ride || !this.checkpointPlayerId || !this.startRequestId || !this.startedAt) return;
    const data: LinePlayCheckpoint = {
      version: 1,
      playerId: this.checkpointPlayerId,
      rideId: this.ride.rideId,
      startRequestId: this.startRequestId,
      serverSessionId: this.serverSessionId,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      plannedWaitMinutes: this.plannedWaitMinutes,
      waitSource: this.waitSource,
      extraRoundsAdded: this.extraRoundsAdded,
      playlist: this.playlist,
      completedActivityIds: Array.from(this.completedActivityIds),
      loreChoices: { ...this.loreChoices },
      crewGridMarks: [...this.crewGridMarks],
      prediction: this.prediction,
      boardingConfirmed: this.boardingConfirmed,
      boardingAt: this.boardingAt,
      crewRelay: this.crewRelay,
      state: this.state === 'complete' ? 'complete' : 'active',
      verifiedEligibleSeconds: this.verifiedEligibleSeconds,
      rewards: this.rewards,
      rewardsPending: this.rewardsPending,
      currentQuestProof: this.currentQuestProof,
    };
    this.checkpointWrites = this.checkpointWrites.then(() => writeCheckpoint(data))
      .catch(error => console.warn('[LinePlaySession] checkpoint unavailable:', error));
  }

  async forgetCheckpoint(): Promise<void> {
    if (!this.ride || !this.checkpointPlayerId) return;
    const playerId = this.checkpointPlayerId;
    const rideId = this.ride.rideId;
    await this.checkpointWrites;
    await removeCheckpoint(playerId, rideId).catch(error =>
      console.warn('[LinePlaySession] could not clear checkpoint:', error));
    this.checkpointPlayerId = null;
  }

  markActivityCompleted(id: string): void {
    if (this.completedActivityIds.has(id) || this.state !== 'active') return;
    this.completedActivityIds.add(id);
    this.recordPlayedAdaptiveEpisode(id);
    this.persistCheckpoint();
    this.emit();
  }

  private recordPlayedAdaptiveEpisode(activityId: string): void {
    if (this.adaptiveEpisodeRecorded || !this.chapter?.adaptive || !this.ride ||
        !this.checkpointPlayerId || !activityId.startsWith(`${this.chapter.id}-`)) return;
    const episode = this.chapter.id.match(/-episode-(\d+)$/);
    if (!episode) return;
    this.adaptiveEpisodeRecorded = true;
    void recordAdaptiveEpisode(this.checkpointPlayerId, this.ride.parkId, this.ride.rideId,
      Number(episode[1]), adaptiveEpisodeCountForRide(this.ride.rideName));
  }

  /** Keep proof through an outage; the completion request carries it again. */
  recordCurrentQuest(meta?: Record<string, unknown>): void {
    if (!this.currentQuestBonusEnabled || !this.serverSessionId ||
        this.currentQuestSeed == null || !meta || this.currentQuestVerified) return;
    const { seed, score, duration, paths } = meta;
    if (seed !== this.currentQuestSeed || !Number.isInteger(score) ||
        !Number.isInteger(duration) || !Array.isArray(paths) || paths.length !== 3 ||
        !paths.every(path => Array.isArray(path) && path.length >= 7 && path.length <= 100 &&
          path.every(index => Number.isInteger(index) && index >= 0 && index <= 24))) return;
    const proof: CurrentQuestProof = { seed: seed as number, score: score as number,
      duration_seconds: duration as number, paths: paths as number[][] };
    this.currentQuestProof = proof;
    this.persistCheckpoint();
    this.emit();
    if (this.currentQuestSubmission) return;
    const sessionId = this.serverSessionId;
    this.currentQuestSubmission = submitCurrentQuest(sessionId, proof)
      .then(response => {
        if (response?.verified && this.serverSessionId === sessionId) {
          this.currentQuestVerified = true;
          this.persistCheckpoint();
          this.emit();
        }
      })
      .catch(error => console.warn('[LinePlaySession] Current Quest proof pending:', error))
      .finally(() => { this.currentQuestSubmission = null; });
  }

  /** Save a private, non-rewarding queue clue so an interrupted wait can resume. */
  chooseLore(id: string, choice: number): void {
    if (this.state !== 'active' || !Number.isInteger(choice) || choice < -1 || choice > 2 ||
        !this.playlist.some(item => item.kind === 'lore' && item.id === id) ||
        this.completedActivityIds.has(id)) return;
    if (choice === -1) delete this.loreChoices[id];
    else this.loreChoices[id] = choice;
    this.persistCheckpoint();
    this.emit();
  }

  /** Self-reported play only: a row appears in the recap but never awards Parts. */
  chooseCrewGridSquare(index: number): void {
    if (this.state !== 'active' || !Number.isInteger(index) || index < 0 || index > 8) return;
    const grid = this.playlist.find(item => item.kind === 'crew_grid');
    if (!grid || this.completedActivityIds.has(grid.id)) return;
    this.crewGridMarks = this.crewGridMarks.includes(index)
      ? this.crewGridMarks.filter(mark => mark !== index)
      : [...this.crewGridMarks, index].sort((a, b) => a - b);
    if (crewGridHasLine(this.crewGridMarks)) {
      this.completedActivityIds.add(grid.id);
      this.recordPlayedAdaptiveEpisode(grid.id);
    }
    this.persistCheckpoint();
    this.emit();
  }

  choosePrediction(card: PredictionCard, guess: 'beat' | 'miss'): void {
    if (this.state !== 'active' || this.prediction) return;
    this.prediction = { card, guess };
    this.persistCheckpoint();
    this.emit();
  }

  /** Respond to a fresh entrance-board update without claiming it is this guest's remaining wait. */
  updateEntranceWait(waitMinutes: number, observedAt: number): void {
    if (this.state !== 'active' && this.state !== 'paused') return;
    const age = Date.now() - observedAt;
    if (!Number.isFinite(waitMinutes) || waitMinutes < 0 || waitMinutes > 600 ||
        !Number.isFinite(observedAt) || age < 0 || age > FRESH_WAIT_MS ||
        (this.entranceWaitObservedAt != null && observedAt <= this.entranceWaitObservedAt)) return;

    const previous = this.entranceWaitMinutes;
    this.entranceWaitMinutes = waitMinutes;
    this.entranceWaitObservedAt = observedAt;
    this.entranceWaitChangeMinutes = previous == null ? 0 : waitMinutes - previous;

    // A longer entrance wait is only a hint that this guest may need more to do.
    // Add optional tail rounds; keep all existing and completed cards in place.
    if (waitMinutes >= this.plannedWaitMinutes + 5 && this.playlist.length < 40) {
      const extension = Math.min(20, Math.floor((waitMinutes - this.plannedWaitMinutes) / 5) * 5);
      const existingIds = new Set(this.playlist.map(item => item.id));
      const additions = generatePlaylist(
        this.plannedWaitMinutes + extension, this.plannedWaitMinutes, this.chapter,
        this.playlist.some(item => item.kind === 'prediction'), this.playlistSeedOffset,
      ).filter(item => item.kind !== 'prediction' && !existingIds.has(item.id))
        .slice(0, 40 - this.playlist.length);
      if (additions.length > 0) {
        this.playlist = [...this.playlist, ...additions];
        this.extraRoundsAdded += additions.length;
      }
    }
    this.persistCheckpoint();
    this.emit();
  }

  /** Adds replayable queue activities; the server still awards only verified nearby time. */
  addMoreRounds(): string | null {
    if (this.state !== 'active') return null;
    const rounds = generateEncoreRounds(this.playlist.length, this.playlistSeedOffset);
    if (rounds.length === 0) return null;
    this.playlist = [...this.playlist, ...rounds];
    this.extraRoundsAdded += rounds.length;
    this.persistCheckpoint();
    this.emit();
    return rounds[0].id;
  }

  updateCrewRelay(next: CrewRelayProgress): void {
    if (this.state !== 'active' || !this.chapter || !isCrewRelayProgress(next) || !this.crewRelay) return;
    this.crewRelay = next;
    if (next.step === 'complete') {
      const relayId = `${this.chapter.id}-crew-relay`;
      this.completedActivityIds.add(relayId);
      this.recordPlayedAdaptiveEpisode(relayId);
    }
    this.persistCheckpoint();
    this.emit();
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
  async start(ride: RideContext, initialLocation?: LocationSample, playerId?: number): Promise<void> {
    if (this.disposed || this.state === 'active' || this.state === 'paused') return;

    const locationDuringLoad = this.lastSample;
    const saved = playerId ? await readCheckpoint(playerId, ride.rideId) : null;
    if (this.disposed) return;

    this.ride = ride;
    this.checkpointPlayerId = playerId ?? null;
    this.serverSessionId = null;
    this.backgroundTrackingSessionId = null;
    this.backgroundTrackingAvailable = null;
    this.rewardUnavailable = false;
    this.verifiedEligibleSeconds = 0;
    this.lastSuccessfulPresenceUpdateAt = 0;
    this.creditedParts = null;
    this.partsRemainingToday = null;
    this.partIntervalSeconds = 600;
    this.sessionPartCap = 12;
    this.ticketIntervalSeconds = 600;
    this.ticketAvailable = null;
    this.masteryBonusAvailable = false;
    this.crewPuzzleBonusAvailable = false;
    this.signal = null;
    this.parkProject = null;
    this.projectPending = false;
    this.projectError = null;
    this.signalPending = false;
    this.signalError = null;
    this.puzzlePending = false;
    this.puzzleError = null;
    this.puzzleRequest = null;
    this.startRequestId = saved?.startRequestId ??
      `line-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    // Old checkpoints used zero-based content. Infer their original rotation
    // from the saved first question so newly appended rounds stay consistent.
    const savedOpening = saved?.playlist.find(item => item.kind === 'trivia');
    this.playlistSeedOffset = savedOpening?.kind === 'trivia'
      ? savedOpening.seed : playlistRotation(this.startRequestId);
    // New sessions can start a different fictional chapter at the same ride.
    // Keep older checkpoints on their original chapter id so a resume never
    // replaces an in-progress board or its completed activity ids.
    const savedEpisodeId = saved?.playlist.find(item =>
      item.kind === 'chapter_intro' && /-episode-\d+-intro$/.test(item.id))?.id;
    const savedEpisode = savedEpisodeId?.match(/-episode-(\d+)-intro$/);
    this.adaptiveEpisodeRecorded = false;
    this.chapter = getLinePlayChapter(ride.parkId, ride.rideSlug, ride.rideName,
      saved ? savedEpisode ? Number(savedEpisode[1]) : undefined : this.playlistSeedOffset);
    if (!saved && this.chapter?.adaptive && playerId) {
      const nextEpisode = await selectAdaptiveEpisode(playerId, ride.parkId, ride.rideId,
        adaptiveEpisodeCountForRide(ride.rideName), playerId * 31 + ride.rideId * 17);
      if (this.disposed) return;
      this.chapter = getLinePlayChapter(ride.parkId, ride.rideSlug, ride.rideName, nextEpisode);
    }
    this.lastServerStartAttemptAt = 0;
    this.rewards = saved?.rewards ?? null;
    this.rewardsPending = saved?.rewardsPending ?? false;
    this.currentQuestProof = saved?.currentQuestProof ?? null;
    this.currentQuestVerified = false;
    this.currentQuestSeed = null;
    this.currentQuestBonusEnabled = false;
    this.endedAt = saved?.endedAt ?? null;
    this.pauseReason = null;
    this.lastSample = null;
    this.sustainedMoveStart = null;
    this.sustainedMoveOrigin = null;
    this.completedActivityIds = new Set(saved?.completedActivityIds ?? []);
    if (saved?.completedActivityIds.some(id => id.startsWith(`${this.chapter?.id}-`)))
      this.recordPlayedAdaptiveEpisode(saved.completedActivityIds.find(id =>
        id.startsWith(`${this.chapter?.id}-`))!);
    this.loreChoices = saved?.loreChoices ?? {};
    this.crewGridMarks = saved?.crewGridMarks ?? [];
    const originalWaitStillFresh = ride.postedWaitMinutes === saved?.plannedWaitMinutes &&
      ride.postedWaitObservedAt != null &&
      Date.now() - ride.postedWaitObservedAt >= 0 &&
      Date.now() - ride.postedWaitObservedAt <= FRESH_WAIT_MS;
    this.prediction = saved?.waitSource === 'posted' ? saved.prediction : null;
    this.boardingConfirmed = saved?.boardingConfirmed ?? false;
    this.boardingAt = saved?.boardingAt ?? null;
    this.crewRelay = null;

    const wait: { minutes: number; source: WaitSource } = saved
      ? { minutes: saved.plannedWaitMinutes,
          source: saved.waitSource === 'posted' && !originalWaitStillFresh
            ? 'last_known' : saved.waitSource ?? 'estimate' }
      : await resolveSessionWait(ride);
    this.plannedWaitMinutes = wait.minutes;
    this.waitSource = wait.source;
    const initialObservedAt = ride.postedWaitObservedAt;
    const initialAge = initialObservedAt == null ? Infinity : Date.now() - initialObservedAt;
    this.entranceWaitMinutes = ride.postedWaitMinutes != null && Number.isFinite(ride.postedWaitMinutes) &&
      ride.postedWaitMinutes >= 0 && initialAge >= 0 && initialAge <= CACHE_WAIT_MS
      ? ride.postedWaitMinutes : null;
    this.entranceWaitObservedAt = this.entranceWaitMinutes == null ? null : initialObservedAt ?? null;
    this.entranceWaitChangeMinutes = 0;
    this.extraRoundsAdded = saved?.extraRoundsAdded ?? 0;
    if (this.disposed) return;
    this.playlist = saved
      ? saved.playlist.filter(item => this.waitSource === 'posted' || item.kind !== 'prediction' ||
          item.card.id === this.prediction?.card.id)
      : generatePlaylist(
      this.plannedWaitMinutes,
      this.plannedWaitMinutes,
      this.chapter,
      this.waitSource === 'posted',
      this.playlistSeedOffset,
    );

    this.startedAt = saved?.startedAt ?? Date.now();
    this.crewRelay = this.chapter
      ? saved?.crewRelay && isCrewRelayProgress(saved.crewRelay)
        ? saved.crewRelay
        : createCrewRelay(Math.floor(this.startedAt / 1000) + ride.rideId)
      : null;
    this.serverSessionId = saved?.serverSessionId ?? null;
    this.verifiedEligibleSeconds = saved?.verifiedEligibleSeconds ?? 0;
    this.state = saved?.state === 'complete' ? 'complete' : 'active';
    if (this.state === 'active') this.startTicking();
    this.emit();
    this.persistCheckpoint();
    void this.retryQueue.drain();

    // Location can arrive while the cached wait is loading. Use that sample
    // too, so a stationary player does not wait for another GPS update.
    const startLocation = initialLocation ?? locationDuringLoad;
    if (this.serverSessionId) {
      try {
        const response = await readInLineTimer(this.serverSessionId);
        this.applyServerSnapshot(response);
        this.lastSharedReadAttemptAt = Date.now();
        if (this.state === 'complete' && response.status === 'active')
          await this.queueComplete(this.serverSessionId);
      } catch (error) {
        console.warn('[LinePlaySession] saved session read unavailable:', error);
        if (this.state === 'complete') await this.queueComplete(this.serverSessionId);
      }
    } else if (startLocation && this.state === 'active') {
      this.lastSample = { ...startLocation, timestamp: Date.now() };
      await this.connectServer(startLocation);
    }
  }

  private applyServerSnapshot(result: LineSessionResponse): void {
    if (!result.success || !result.session_id) return;
    this.serverSnapshotRevision += 1;
    this.serverSessionId = result.session_id;
    this.verifiedEligibleSeconds = result.eligible_seconds;
    this.creditedParts = result.parts_credited ?? null;
    this.partsRemainingToday = result.parts_remaining_today ?? null;
    this.partIntervalSeconds = result.part_interval_seconds;
    this.sessionPartCap = result.session_part_cap;
    this.ticketIntervalSeconds = result.ticket_interval_seconds ?? 600;
    this.ticketAvailable = result.ticket_available ?? null;
    this.masteryBonusAvailable = result.mastery_bonus_available ?? false;
    this.crewPuzzleBonusAvailable = result.crew_puzzle_bonus_available ?? false;
    this.currentQuestBonusEnabled = result.current_quest_bonus_enabled ?? false;
    this.currentQuestSeed = result.current_quest_seed ?? null;
    this.currentQuestVerified = result.current_quest_verified ?? false;
    this.applySignal(result.signal);
    this.applyParkProject(result.park_project);
    this.startedAt = Date.parse(result.started_at) || this.startedAt;
    if (result.status === 'completed') {
      void deactivateQueueBackgroundHeartbeat(result.session_id).catch(error =>
        console.warn('[LinePlaySession] could not stop background tracking:', error));
      this.backgroundTrackingSessionId = null;
      this.backgroundTrackingAvailable = null;
      this.state = 'complete';
      this.endedAt = result.ended_at ? Date.parse(result.ended_at) : Date.now();
      this.stopTicking();
      if (result.rewards) this.applyServerRewards(result.duration_seconds, result.rewards);
      this.rewardsPending = false;
    } else if (this.state !== 'complete' && this.checkpointPlayerId &&
               this.backgroundTrackingSessionId !== result.session_id) {
      void this.retryBackgroundTracking();
    }
    this.persistCheckpoint();
    this.emit();
    if (result.status === 'active' && this.currentQuestBonusEnabled &&
        !this.currentQuestVerified && this.currentQuestProof && !this.currentQuestSubmission &&
        this.currentQuestProof.seed === this.currentQuestSeed) {
      this.recordCurrentQuest({ ...this.currentQuestProof,
        duration: this.currentQuestProof.duration_seconds });
    }
  }

  /** Retry after the guest grants Always location from the active queue screen. */
  async retryBackgroundTracking(): Promise<boolean> {
    const sessionId = this.serverSessionId;
    const playerId = this.checkpointPlayerId;
    if (this.disposed || !sessionId || !playerId || this.state === 'complete') return false;
    this.backgroundTrackingSessionId = sessionId;
    try {
      const available = await activateQueueBackgroundHeartbeat(sessionId, playerId);
      if (this.disposed || this.backgroundTrackingSessionId !== sessionId) return false;
      this.backgroundTrackingAvailable = available;
      this.emit();
      return available;
    } catch (error) {
      if (!this.disposed && this.backgroundTrackingSessionId === sessionId) {
        this.backgroundTrackingAvailable = false;
        this.emit();
      }
      console.warn('[LinePlaySession] background tracking unavailable:', error);
      return false;
    }
  }

  private async connectServer(sample: LocationSample, force = false): Promise<void> {
    if (this.disposed || !this.ride || this.ride.rideId <= 0 || this.ride.lineRewardsReady === false ||
        this.rewardUnavailable || !this.startRequestId ||
        this.serverSessionId || this.state === 'idle') return;
    if (this.serverStartInFlight) return this.serverStartInFlight;
    if (!force && Date.now() - this.lastServerStartAttemptAt < 30_000) return;
    this.lastServerStartAttemptAt = Date.now();

    const attempt = (async () => {
      try {
        const result = await startInLineTimer(
          this.ride!.rideId,
          this.startRequestId!,
          sample.latitude,
          sample.longitude,
        );
        if (result.success && result.session_id) {
          this.lastSuccessfulPresenceUpdateAt = Date.now();
          this.applyServerSnapshot(result);
        }
      } catch (error) {
        const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response;
        if (response?.status === 404 || response?.data?.code === 'LINE_REWARDS_UNAVAILABLE') {
          this.rewardUnavailable = true;
          this.emit();
        }
        console.info('[LinePlaySession] reward session start unavailable', response?.status ?? 'network');
      }
    })();
    this.serverStartInFlight = attempt;
    try {
      await attempt;
    } finally {
      if (this.serverStartInFlight === attempt) this.serverStartInFlight = null;
    }
  }

  /** Submit one current location sample; elapsed time is computed by the server. */
  async heartbeat(sample: LocationSample): Promise<void> {
    if (this.state === 'complete' || this.state === 'idle') return;
    if (!this.serverSessionId) {
      await this.connectServer(sample);
      return;
    }
    if (this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;
    try {
      const result = await heartbeatInLineTimer(this.serverSessionId, sample.latitude, sample.longitude);
      this.lastSuccessfulPresenceUpdateAt = Date.now();
      this.applyServerSnapshot(result);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      console.info('[LinePlaySession] queue reward sample unavailable', status ?? 'network');
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  /** Refresh shared play without claiming queue presence or advancing rewards. */
  async refreshSharedState(): Promise<void> {
    if (this.disposed || (this.state !== 'active' && this.state !== 'paused') ||
        !this.serverSessionId || this.heartbeatInFlight || this.sharedReadInFlight) return;
    const now = Date.now();
    if (now - this.lastSuccessfulPresenceUpdateAt < 45_000 ||
        now - this.lastSharedReadAttemptAt < 60_000) return;
    this.lastSharedReadAttemptAt = now;
    this.sharedReadInFlight = true;
    const sessionId = this.serverSessionId;
    const revision = this.serverSnapshotRevision;
    try {
      const result = await readInLineTimer(sessionId);
      if (this.disposed || this.serverSessionId !== sessionId ||
          this.serverSnapshotRevision !== revision) return;
      this.applyServerSnapshot(result);
    } catch (error) {
      console.warn('[LinePlaySession] shared queue refresh unavailable:', error);
    } finally {
      this.sharedReadInFlight = false;
    }
  }

  /** Lock in one curated story route for today's shared ride chapter. */
  async chooseSignal(route: 'route_a' | 'route_b'): Promise<void> {
    if (this.state !== 'active' || !this.serverSessionId || this.signalPending || this.signal?.player_choice) return;
    this.signalPending = true;
    this.signalError = null;
    this.emit();
    try {
      this.applySignal(await chooseLineSignal(this.serverSessionId, route));
    } catch (error) {
      const data = (error as { response?: { data?: { message?: string } } })?.response?.data;
      this.signalError = data?.message ?? 'Could not save your signal. Try again when connected.';
    } finally {
      this.signalPending = false;
      this.emit();
    }
  }

  /** A verified contributor can influence the live park-wide queue chapter. */
  async voteProject(chapter: 'a' | 'b'): Promise<void> {
    if (this.state !== 'active' || !this.parkProject?.can_vote || this.projectPending) return;
    this.projectPending = true;
    this.projectError = null;
    this.emit();
    try {
      this.applyParkProject(await voteParkProject(this.parkProject.id, chapter));
    } catch (error) {
      const data = (error as { response?: { data?: { message?: string } } })?.response?.data;
      this.projectError = data?.message ?? 'Could not save your chapter vote. Try again when connected.';
    } finally {
      this.projectPending = false;
      this.emit();
    }
  }

  /** One server-scored crew guess; lost responses retry with the same ID. */
  async guessPuzzle(symbols: readonly number[]): Promise<void> {
    if (this.state !== 'active' || !this.serverSessionId || this.puzzlePending || (!this.puzzleRequest && !this.signal?.puzzle?.can_guess)) return;
    if (this.puzzleRequest && this.puzzleRequest.symbols.join(',') !== symbols.join(',')) {
      this.puzzleError = 'Retry the pending guess before changing symbols.';
      this.emit();
      return;
    }
    const request = this.puzzleRequest ?? {
      id: `crew-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
      stage: this.signal!.puzzle!.stage,
      symbols: [...symbols],
    };
    this.puzzleRequest = request;
    this.puzzlePending = true;
    this.puzzleError = null;
    this.emit();
    try {
      const response = await guessCrewPuzzle(this.serverSessionId, request.id, request.symbols);
      this.applySignal(response.signal);
      this.puzzleRequest = null;
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
      this.puzzleError = response?.data?.message ?? 'Could not confirm your guess. Tap Retry safely.';
      if (response?.status === 422 || response?.status === 409 || response?.status === 404) {
        this.puzzleRequest = null;
      }
    } finally {
      this.puzzlePending = false;
      this.emit();
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
    this.sustainedMoveOrigin = null;
    this.emit();
  }

  /**
   * Begin ending with a 60s grace window (exit undo). Called on detected exit
   * or when the user taps "End session". Auto-completes when the grace expires
   * unless undoEnd() is called first.
   */
  beginEnding(boardingConfirmed = false): void {
    if (this.state !== 'active' && this.state !== 'paused') return;
    this.boardingConfirmed = boardingConfirmed;
    this.boardingAt = boardingConfirmed ? Date.now() : null;
    this.state = 'ending';
    this.graceStartedAt = Date.now();
    this.persistCheckpoint();
    this.emit();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      void this.complete();
    }, EXIT_GRACE_MS);
    // Keep ticking so graceMsRemaining animates down.
  }

  /** Explicitly confirmed line exits settle now, while the last nearby sample is fresh. */
  async endNow(boardingConfirmed: boolean): Promise<void> {
    this.beginEnding(boardingConfirmed);
    await this.complete();
  }

  /** Cancel an in-progress ending and return to active. */
  undoEnd(): void {
    if (this.state !== 'ending') return;
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.graceStartedAt = null;
    this.boardingConfirmed = false;
    this.boardingAt = null;
    this.state = 'active';
    this.pauseReason = null;
    this.persistCheckpoint();
    this.emit();
  }

  /**
   * Complete the session: freeze time, call the server (routing failures to the
   * retry queue), and move to `complete`. Safe to call from active/paused/ending.
   */
  complete(): Promise<void> {
    if (this.completionInFlight) return this.completionInFlight;
    if (this.state === 'complete' || this.state === 'idle') return Promise.resolve();
    const completion = this.completeInternal();
    this.completionInFlight = completion.finally(() => { this.completionInFlight = null; });
    return this.completionInFlight;
  }

  private async completeInternal(): Promise<void> {
    if (this.state === 'complete' || this.state === 'idle') return;

    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.graceStartedAt = null;
    this.endedAt = Date.now();
    this.state = 'complete';
    this.backgroundTrackingAvailable = null;
    this.stopTicking();
    this.persistCheckpoint();
    if (this.serverSessionId) {
      void deactivateQueueBackgroundHeartbeat(this.serverSessionId).catch(error =>
        console.warn('[LinePlaySession] could not stop background tracking:', error));
      this.backgroundTrackingSessionId = null;
    }

    if (this.serverStartInFlight) await this.serverStartInFlight;
    if (this.currentQuestSubmission) await this.currentQuestSubmission;
    if (!this.serverSessionId && this.lastSample) {
      await this.connectServer(this.lastSample, true);
    }
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
      const recentSample = this.lastSample && Date.now() - (this.lastSample.timestamp ?? 0) <= 90_000
        ? this.lastSample : null;
      const res = await completeInLineTimer(
        sessionId,
        recentSample?.latitude,
        recentSample?.longitude,
        this.currentQuestVerified ? undefined : this.currentQuestProof ?? undefined,
        this.storyMemento(),
      );
      if (res?.success) {
        this.applyServerSnapshot(res);
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
    this.persistCheckpoint();
    // Idempotency key = the server session id, so a session is never completed
    // twice even across app restarts.
    await this.retryQueue.enqueue({ sessionId,
      currentQuestProof: this.currentQuestVerified ? null : this.currentQuestProof,
      storyMemento: this.storyMemento() }, `complete_${sessionId}`);
  }

  private storyMemento(): QueueStoryMemento | null {
    const chapter = this.chapter;
    if (!chapter || !Array.from(this.completedActivityIds).some(id => id.startsWith(`${chapter.id}-`))) {
      return null;
    }
    const route = this.crewRelay?.step === 'complete' ? this.crewRelay.route : null;
    return {
      chapter_id: chapter.id,
      chapter_title: chapter.title,
      route_name: route === 'alpha' ? chapter.relay.routeNames[0]
        : route === 'omega' ? chapter.relay.routeNames[1] : null,
    };
  }

  private applyServerRewards(
    durationSeconds: number,
    rewards: {
      coin_asset_id?: number;
      ride_parts: Array<{ ride_part: RidePartType; quantity: number }>;
      bonus_energy: number;
      experience: number;
      tickets?: number;
      mastery_bonus_parts?: number;
      crew_puzzle_bonus_parts?: number;
      current_quest_bonus_parts?: number;
    },
  ): void {
    this.rewards = {
      coinAssetId: rewards.coin_asset_id ?? null,
      durationSeconds,
      rideParts: rewards.ride_parts.map((rp) => ({ ridePart: rp.ride_part, quantity: rp.quantity })),
      bonusEnergy: rewards.bonus_energy,
      experience: rewards.experience,
      tickets: rewards.tickets ?? 0,
      masteryBonusParts: rewards.mastery_bonus_parts ?? 0,
      crewPuzzleBonusParts: rewards.crew_puzzle_bonus_parts ?? 0,
      currentQuestBonusParts: rewards.current_quest_bonus_parts ?? 0,
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
    if (this.serverSessionId) {
      void deactivateQueueBackgroundHeartbeat(this.serverSessionId).catch(error =>
        console.warn('[LinePlaySession] could not stop background tracking:', error));
    }
    this.backgroundTrackingSessionId = null;
    this.backgroundTrackingAvailable = null;
    void this.forgetCheckpoint();
    this.stopTicking();
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.state = 'idle';
    this.ride = null;
    this.chapter = null;
    this.adaptiveEpisodeRecorded = false;
    this.serverSessionId = null;
    this.rewardUnavailable = false;
    this.verifiedEligibleSeconds = 0;
    this.lastSuccessfulPresenceUpdateAt = 0;
    this.creditedParts = null;
    this.partsRemainingToday = null;
    this.partIntervalSeconds = 600;
    this.sessionPartCap = 12;
    this.ticketIntervalSeconds = 600;
    this.ticketAvailable = null;
    this.masteryBonusAvailable = false;
    this.crewPuzzleBonusAvailable = false;
    this.currentQuestBonusEnabled = false;
    this.currentQuestSeed = null;
    this.currentQuestVerified = false;
    this.currentQuestProof = null;
    this.currentQuestSubmission = null;
    this.signal = null;
    this.parkProject = null;
    this.projectPending = false;
    this.projectError = null;
    this.signalPending = false;
    this.signalError = null;
    this.puzzlePending = false;
    this.puzzleError = null;
    this.puzzleRequest = null;
    this.startRequestId = null;
    this.serverStartInFlight = null;
    this.lastServerStartAttemptAt = 0;
    this.startedAt = null;
    this.endedAt = null;
    this.waitSource = 'estimate';
    this.entranceWaitMinutes = null;
    this.entranceWaitObservedAt = null;
    this.entranceWaitChangeMinutes = 0;
    this.extraRoundsAdded = 0;
    this.pauseReason = null;
    this.graceStartedAt = null;
    this.playlist = [];
    this.rewards = null;
    this.rewardsPending = false;
    this.completedActivityIds.clear();
    this.loreChoices = {};
    this.crewGridMarks = [];
    this.prediction = null;
    this.crewRelay = null;
    this.lastSample = null;
    this.sustainedMoveStart = null;
    this.sustainedMoveOrigin = null;
    this.emit();
  }

  /** Full teardown — call when the session controller is discarded. */
  dispose(): void {
    this.disposed = true;
    this.stopTicking();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.unsubscribeRecovery();
    this.listeners.clear();
  }

  // -- movement / auto-pause ---------------------------------------------

  /**
   * Feed a location sample from the shared LocationContext stream. Computes
   * device-reported speed and fresh, accurate fixes before interrupting play.
   * A short queue shuffle, missing speed, or noisy indoor GPS leaves the game
   * running. Resuming after a real pause is manual (one tap).
   *
   * We never create a watcher here — the screen wires this to the context's
   * `location` updates.
   */
  ingestLocation(sample: LocationSample): void {
    const now = sample.timestamp ?? Date.now();
    const prev = this.lastSample;
    this.lastSample = { ...sample, timestamp: now };

    if (!this.serverSessionId &&
        (this.state === 'active' || this.state === 'paused' || this.state === 'ending')) {
      void this.connectServer(sample);
    }

    if (this.state !== 'active') {
      // Only auto-pause from active play. Still keep lastSample fresh.
      return;
    }
    if (!prev || prev.timestamp == null) return;

    const dtMs = now - prev.timestamp;
    const reliable = dtMs > 0 && dtMs <= MOVE_MAX_SAMPLE_GAP_MS &&
      typeof prev.accuracyMeters === 'number' && prev.accuracyMeters >= 0 &&
      prev.accuracyMeters <= MOVE_MAX_ACCURACY_METERS &&
      typeof sample.accuracyMeters === 'number' && sample.accuracyMeters >= 0 &&
      sample.accuracyMeters <= MOVE_MAX_ACCURACY_METERS &&
      typeof sample.speedMps === 'number' && sample.speedMps > MOVE_SPEED_MPS &&
      haversineMeters(prev, sample) >= 2;

    if (reliable) {
      if (this.sustainedMoveStart == null) {
        this.sustainedMoveStart = now;
        this.sustainedMoveOrigin = prev;
      } else if (now - this.sustainedMoveStart >= MOVE_SUSTAIN_MS &&
          this.sustainedMoveOrigin &&
          haversineMeters(this.sustainedMoveOrigin, sample) >= MOVE_MIN_NET_METERS) {
        this.pause('lineMoving');
      }
    } else {
      // Accuracy, speed, or continuity broke; reset the sustain window.
      this.sustainedMoveStart = null;
      this.sustainedMoveOrigin = null;
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
