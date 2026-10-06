/**
 * LinePlaySession: the in-queue session state machine.
 *
 * Lifecycle:
 *   idle -> detected -> active <-> paused(manual)
 *                              -> ending(grace 60s) -> complete
 *
 * THE LINE IS ALWAYS MOVING (Dustin, 2026-09-30). Guests shuffle forward the
 * whole wait, so movement, steps and GPS drift never pause play. Only a manual
 * pause stops input. A big forward advance raises a gentle, non-pausing heads
 * up. Only real queue events end a session: leaving the queue area (the server
 * reports several fresh fixes away from the ride) or boarding detection. Both
 * start the "Your ride's up!" wrap-up, which saves progress and wait credit.
 *
 * Responsibilities:
 *   - Own the session state machine and emit changes to subscribers.
 *   - Start the server-side in-line timer (server-authoritative) and complete
 *     it, routing failed completes through a RedeemRetryQueue.
 *   - Size the session from the posted wait time, with an AsyncStorage
 *     last-known cache so a session can start offline.
 *   - Model passive accrual for display only (server computes real rewards).
 *   - Generate the activity playlist as a typed activity queue.
 *   - Read the shared LocationContext stream for queue heads-ups and exit
 *     detection; this class never creates its own watcher.
 *
 * IMPORTANT: this is a plain controller class, framework-agnostic. The screen
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
import submitCurrentQuest, { startCurrentQuestAttempt, type CurrentQuestAttempt,
  type CurrentQuestProof } from '../../api/endpoints/me/inline-timer/currentQuest';
import { voteParkProject, type ParkProject } from '../../api/endpoints/me/park-projects';
import type { LineSignalSummary } from '../../api/endpoints/me/inline-timer/types';
import type { LineBonusClaim, LineBonusEncore, LineBonusSummary, LineWaitScreenSummary,
  LineSessionResponse } from '../../api/endpoints/me/inline-timer/types';
import { ExitSpeedDetector, forcedHeartbeatDelaysMs, isWalkingSample, nextBonusSeconds,
  takeNewBonusEvents } from './bonusRounds';
import type { CurrentTier } from '../../games/current-quest/v1/logic';
import { RidePartType } from '../../models/ride-part-type';
import { linePlayRewardQueue, subscribeLinePlayRewardRecovery } from './rewardRecovery';
import {
  buildPredictionCard,
  PredictionCard,
} from './content';
import { getLinePlayChapter, type LinePlayChapter } from './chapters';
import { recordAdaptiveEpisode, selectAdaptiveEpisode } from './episodeRotation';
import { readCheckpoint, writeCheckpoint, removeCheckpoint, type LinePlayCheckpoint } from './checkpoint';
import { createCrewRelay, isCrewRelayProgress, type CrewRelayProgress } from './crewRelay';
import { crewGridHasLine } from './crewGrid';
import { activateQueueBackgroundHeartbeat, deactivateQueueBackgroundHeartbeat,
  takeBackgroundTrail } from './backgroundQueueHeartbeat';
import syncLineSession from '../../api/endpoints/me/inline-timer/sync';
import { appendTrail, buildExit, DARK_GAP_MS, mergeTrails, offlineCreditEstimate,
  trimSynced, type CheckpointFix, type CheckpointPayload, type OfflineCredit,
  type ServerCreditSummary } from './checkpointCredit';
import { prepareQueuePedometer, readQueueSteps } from './queuePedometer';
import { LINEPLAY_ROUND_QUESTIONS } from '../../games/trivia/config';
import { createNavigationPanel, createNavigationPanelProgress, traceNavigationPanel,
  turnNavigationTile, type NavigationPanelProgress } from './navigationPanel';
import { nextQueueDifficulty, replaySeed, type QueueDifficulty } from './replay';
import { primeTriviaDeck } from './triviaDeck';
import { primeTriviaHistory } from './triviaHistory';

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

/** Why the session is paused. Movement never pauses play; only the guest does. */
export type PauseReason = 'manual';

/** Why a wait is wrapping up. */
export type EndReason = 'manual' | 'left_queue' | 'boarded';

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

/** A location sample as a checkpoint fix on the phone clock. */
export function toCheckpointFix(sample: LocationSample): CheckpointFix {
  return { latitude: sample.latitude, longitude: sample.longitude,
    accuracyMeters: typeof sample.accuracyMeters === 'number' ? sample.accuracyMeters : null,
    at: sample.timestamp ?? Date.now() };
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
  /** A procedural signal-repair circuit themed to the ride's chapter. */
  | { readonly kind: 'circuit'; readonly id: string; readonly seed: number }
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

/** A server-confirmed bonus moment for the screen to celebrate once. */
export type BonusFxEvent =
  | { readonly id: number; readonly kind: 'claim'; readonly claim: LineBonusClaim }
  | { readonly id: number; readonly kind: 'encore'; readonly encore: LineBonusEncore }
  | { readonly id: number; readonly kind: 'perk'; readonly perk: { readonly kind: 'mastery' | 'queue_crew'; readonly parts: number } };

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
  /** Queue Bonus Rounds (0 / null on older servers). */
  readonly bonusRoundParts?: number;
  readonly liveParts?: number | null;
  readonly encoreXp?: number;
  readonly encoreEnergy?: number;
  readonly bonusParkDayUsed?: number | null;
  readonly bonusParkDayCap?: number | null;
}

export type RewardConnectionIssue = 'nearby' | 'network' | 'sign_in';

export interface SessionSnapshot {
  readonly state: LinePlayState;
  readonly ride: RideContext | null;
  readonly chapter: LinePlayChapter | null;
  /** Server session id once started. */
  readonly serverSessionId: string | null;
  /** The server explicitly cannot offer ride rewards for this session. */
  readonly rewardUnavailable: boolean;
  readonly rewardConnectionIssue?: RewardConnectionIssue | null;
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
  readonly navigationPanels?: Readonly<Record<string, NavigationPanelProgress>>;
  readonly crewGridMarks: readonly number[];
  /** Launches per activity id; replays mix this into the seed. Persisted. */
  readonly gamePlays: Readonly<Record<string, number>>;
  /** Difficulty per game id; a 2+ star run steps the next round up. Persisted. */
  readonly gameDifficulty: Readonly<Partial<Record<MiniGameId, QueueDifficulty>>>;
  /** Best stars per game id this wait. Persisted; drives NEW pills and best stars. */
  readonly gameBestStars: Readonly<Partial<Record<MiniGameId, number>>>;
  /** Local time of the last big forward advance of the line. A heads up only; never pauses. */
  readonly queueAdvanceAt: number | null;
  /** Why the wait is ending or ended, once it is. */
  readonly endReason: EndReason | null;
  readonly prediction: { card: PredictionCard; guess: 'beat' | 'miss' } | null;
  /** Guest explicitly said they reached boarding; never inferred from ending a session. */
  readonly boardingConfirmed: boolean;
  /**
   * Ride detection thinks the guest boarded. Only a question for the guest:
   * it never ends the wait, starts a countdown or confirms boarding.
   */
  readonly boardingSuggested: boolean;
  /** A mini-game is open; the wrap-up countdown is held until it closes. */
  readonly gameOpen: boolean;
  readonly boardingAt: number | null;
  readonly crewRelay: CrewRelayProgress | null;
  /** Queue Bonus Rounds block from the server (null while the flag is off). */
  readonly bonus: LineBonusSummary | null;
  /** Server-confirmed claims waiting for their celebration (each plays once). */
  readonly bonusFx: readonly BonusFxEvent[];
  /** The guest is walking with the line. A signal only: nothing pauses for it. */
  readonly moving: boolean;
  /** Sustained 2 m/s for 20 s: they left the line. RESUME brings them back. */
  readonly leftLine: boolean;
  /** The open Current Quest bonus attempt, if any. */
  readonly questAttempt: CurrentQuestAttempt | null;
  /** Wait screen extras from the server (L2); null offline or on older servers. */
  readonly waitScreen?: LineWaitScreenSummary | null;
  /**
   * Checkpoint crediting (L1): what the phone clock carries while GPS or
   * signal is gone, and whether anything is still waiting to sync.
   */
  readonly offlineCredit: OfflineCredit;
  /** The server's credit block (null on servers with the flag off). */
  readonly serverCredit: ServerCreditSummary | null;
}

type Listener = (snap: SessionSnapshot) => void;

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Fixes worse than this cannot count toward a queue heads up. */
const ADVANCE_MAX_ACCURACY_METERS = 20;
/** Net forward distance inside the window that counts as "the line jumped ahead". */
const ADVANCE_MIN_NET_METERS = 15;
const ADVANCE_WINDOW_MS = 90_000;
/** At most one heads up in this span; the guest is playing, not being nagged. */
const ADVANCE_COOLDOWN_MS = 4 * 60_000;
/** Consecutive fresh "not near the ride" answers before a wait is treated as over. */
export const EXIT_AWAY_SAMPLES = 4;
/**
 * ...and they must span at least this long. Indoor queues drift and outdoor
 * overflow switchbacks cross the server radius, so a short streak never ends
 * a wait; three minutes of consistently away answers does.
 */
export const EXIT_AWAY_MIN_MS = 3 * 60_000;
/** Grace window for exit undo. It never runs while a mini-game is open. */
export const EXIT_GRACE_MS = 60_000;
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

/**
 * Free-play rhythm after the chapter: a game, one question, a game, a circuit
 * puzzle. Self-reported prompts no longer take whole pages; they live in one
 * optional Crew Prompts card at the end of the wait.
 */
const ROUND_ROBIN: ReadonlyArray<'minigame' | 'trivia' | 'circuit'> = ['minigame', 'trivia', 'minigame', 'circuit'];
/**
 * Minigames cycled through for 'minigame' slots. Rhythm Tap (silent and
 * mash-proof) and Shark Showdown (merging into Trivia) are out of rotation.
 */
export const MINIGAME_CYCLE: ReadonlyArray<MiniGameId> = ['current', 'trivia', 'shark', 'tap', 'banana', 'memory'];
/** Queue games that must never be offered as a new round. Old checkpoints still render them. */
export const RETIRED_QUEUE_GAMES: ReadonlySet<MiniGameId> = new Set<MiniGameId>(['timing', 'showdown']);
/** A signal-repair circuit takes about a minute. */
const CIRCUIT_ROUND_SECONDS = 60;

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
 * Build a typed activity playlist sized to the remaining wait.
 *
 * A ride chapter opens with its three missions (clue, field note, finale) and
 * the one-phone Crew Relay. Free play then round-robins game, trivia, game,
 * circuit. One wait prediction lands after the first free-play loop, and the
 * optional Crew Prompts card (bingo plus talk prompts) always closes the list.
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
    // A returning flight's navigation repair opens on the bigger 4x4 board.
    { kind: 'trivia', id: `${chapter.id}-trivia`,
      seed: chapter.navigationPanel && chapter.returningFlight ? (openingTriviaSeed | 8) >>> 0 : openingTriviaSeed },
    { kind: 'lore', id: `${chapter.id}-field-note`, seed: featuredLoreSeed },
    { kind: 'minigame', id: `${chapter.id}-${chapter.finale.idSuffix}`,
      gameId: chapter.finale.gameId ?? 'memory', seed: rotation + 2,
      title: chapter.finale.title, preview: chapter.finale.preview },
    { kind: 'crew_relay', id: `${chapter.id}-crew-relay` },
  ] : [];
  const predictionCard = buildPredictionCard(postedWaitMinutes);
  let predictionPlaced = false;
  let budget = waitSeconds;
  let slot = 0;
  let minigameCycle = rotation % MINIGAME_CYCLE.length;
  // Inline trivia cards consume one question; the Trivia+ game consumes five.
  // Share one cursor so neither format immediately repeats the other.
  let triviaSeed = chapter ? openingTriviaSeed + 1 : rotation;
  let circuitSeed = (rotation + 7) >>> 0;

  // Cap the number of slots so a very long wait doesn't build a giant array.
  const MAX_SLOTS = 40;

  while (budget > 0 && items.length < MAX_SLOTS - 1) {
    const kind = ROUND_ROBIN[slot % ROUND_ROBIN.length];
    slot += 1;

    if (kind === 'minigame') {
      const gameId = MINIGAME_CYCLE[minigameCycle % MINIGAME_CYCLE.length];
      minigameCycle += 1;
      const gameSeed = gameId === 'trivia' ? triviaSeed : slot + rotation;
      if (gameId === 'trivia') triviaSeed += LINEPLAY_ROUND_QUESTIONS;
      items.push({ kind: 'minigame', id: `mg-${slot}`, gameId, seed: gameSeed });
      budget -= MINIGAME_ROUND_SECONDS;
    } else if (kind === 'trivia') {
      items.push({ kind: 'trivia', id: `tr-${slot}`, seed: triviaSeed });
      triviaSeed += 1;
      budget -= LIGHT_ROUND_SECONDS;
    } else {
      items.push({ kind: 'circuit', id: `cx-${slot}`, seed: circuitSeed });
      circuitSeed = (circuitSeed + 7919) >>> 0;
      budget -= CIRCUIT_ROUND_SECONDS;
    }

    // One call on the wait, once the guest has played a full loop.
    if (allowPrediction && !predictionPlaced && slot === ROUND_ROBIN.length &&
        budget > 0 && items.length < MAX_SLOTS - 1) {
      predictionPlaced = true;
      items.push({ kind: 'prediction', id: `pred-${slot}`, card: predictionCard });
      budget -= LIGHT_ROUND_SECONDS;
    }
  }

  // Guarantee the prediction is present even on very short waits.
  if (allowPrediction && !predictionPlaced) {
    items.push({ kind: 'prediction', id: 'pred-final', card: predictionCard });
  }

  // Optional talk-and-notice play closes the wait: never a whole early page.
  if (chapter) items.push({ kind: 'crew_grid', id: `${chapter.id}-crew-grid`, seed: rotation + 5 });

  return items;
}

/** Keep the optional Crew Prompts card last when a wait grows new rounds. */
export function appendBeforeCrewPrompts(playlist: readonly ActivityItem[], additions: readonly ActivityItem[]): ActivityItem[] {
  if (additions.length === 0) return [...playlist];
  const last = playlist[playlist.length - 1];
  return last?.kind === 'crew_grid'
    ? [...playlist.slice(0, -1), ...additions, last]
    : [...playlist, ...additions];
}

/** A fresh, optional ten-minute wave after a guest reaches the planned tail. */
export function generateEncoreRounds(startIndex: number, seedOffset: number): ActivityItem[] {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= MAX_SESSION_ACTIVITY_SLOTS) return [];
  const rotation = seedOffset + startIndex * 17;
  return generatePlaylist(10, 10, null, false, rotation)
    .filter(item => item.kind === 'minigame' || item.kind === 'trivia' || item.kind === 'circuit')
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
  private rewardConnectionIssue: RewardConnectionIssue | null = null;
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
  private navigationPanels: Record<string, NavigationPanelProgress> = {};
  private crewGridMarks: number[] = [];
  private gamePlays: Record<string, number> = {};
  private gameDifficulty: Partial<Record<MiniGameId, QueueDifficulty>> = {};
  private gameBestStars: Partial<Record<MiniGameId, number>> = {};
  private queueAdvanceAt: number | null = null;
  private lastAdvanceAt = 0;
  private endReason: EndReason | null = null;
  private awaySamples = 0;
  private firstAwayAt: number | null = null;
  private prediction: { card: PredictionCard; guess: 'beat' | 'miss' } | null = null;
  private boardingConfirmed = false;
  private boardingSuggested = false;
  private gameOpen = false;
  /** Grace left when the countdown was held for an open game. */
  private graceHeldMs: number | null = null;
  private boardingAt: number | null = null;
  private crewRelay: CrewRelayProgress | null = null;
  private bonus: LineBonusSummary | null = null;
  private waitScreen: LineWaitScreenSummary | null = null;
  private bonusSeen: string[] = [];
  private bonusFx: BonusFxEvent[] = [];
  private bonusFxSeq = 0;
  private processedBonus = new WeakSet<object>();
  private questAttempt: CurrentQuestAttempt | null = null;
  private questAttemptRequest: Promise<CurrentQuestAttempt | null> | null = null;
  private bonusQuestProof: CurrentQuestProof | null = null;
  private bonusQuestSubmission: Promise<void> | null = null;
  private lastWalkingAt = 0;
  private sawSpeed = false;
  private clientLeftLine = false;
  private readonly exitDetector = new ExitSpeedDetector();
  private forcedHeartbeatTimers: ReturnType<typeof setTimeout>[] = [];
  private forcedThreshold: number | null = null;
  // Checkpoint crediting (L1).
  /** Entry checkpoint: the first fresh fix of this wait, on the phone clock. */
  private entryFix: CheckpointFix | null = null;
  /** Fixes taken while the server was unreachable, oldest first. */
  private offlineTrail: CheckpointFix[] = [];
  /** A saved wait was reopened at this time (the next-app-open exit). */
  private reopenedAt: number | null = null;
  private nearSinceReopen = false;
  private serverCredit: ServerCreditSummary | null = null;
  private trailSync: Promise<void> | null = null;

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

  // Movement tracking for the non-pausing queue heads up.
  private lastSample: LocationSample | null = null;
  private advanceTrail: LocationSample[] = [];

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
    this.unsubscribeRecovery = subscribeLinePlayRewardRecovery((sessionId, response, startRequestId) => {
      if (this.disposed) return;
      // An offline wait learns its server id only when the late start lands.
      if (this.serverSessionId === sessionId ||
          (startRequestId != null && startRequestId === this.startRequestId)) this.applyServerSnapshot(response);
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
      rewardConnectionIssue: this.rewardConnectionIssue,
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
      navigationPanels: Object.fromEntries(Object.entries(this.navigationPanels).map(([id, progress]) =>
        [id, { ...progress, rotations: [...progress.rotations] }])),
      crewGridMarks: [...this.crewGridMarks],
      gamePlays: { ...this.gamePlays },
      gameDifficulty: { ...this.gameDifficulty },
      gameBestStars: { ...this.gameBestStars },
      queueAdvanceAt: this.queueAdvanceAt,
      endReason: this.endReason,
      prediction: this.prediction,
      boardingConfirmed: this.boardingConfirmed,
      boardingSuggested: this.boardingSuggested,
      gameOpen: this.gameOpen,
      boardingAt: this.boardingAt,
      crewRelay: this.crewRelay,
      bonus: this.bonus,
      bonusFx: this.bonusFx,
      moving: this.isMoving(),
      leftLine: this.clientLeftLine || Boolean(this.bonus?.motion?.left_line),
      questAttempt: this.questAttempt,
      waitScreen: this.waitScreen,
      offlineCredit: offlineCreditEstimate({
        startedAt: this.entryFix?.at ?? this.startedAt,
        endedAt: this.endedAt,
        now: Date.now(),
        postedWaitMinutes: this.entranceWaitMinutes ?? (this.waitSource === 'estimate' ? null : this.plannedWaitMinutes),
        serverCapSeconds: this.serverCredit?.cap_seconds,
        verifiedEligibleSeconds: this.verifiedEligibleSeconds,
        creditedParts: this.creditedParts,
        partIntervalSeconds: this.partIntervalSeconds,
        sessionPartCap: this.sessionPartCap,
        partsRemainingToday: this.partsRemainingToday,
        syncing: this.isSyncing(),
      }),
      serverCredit: this.serverCredit,
    };
  }

  /** Something of this wait has not reached the server yet. */
  private isSyncing(): boolean {
    if (this.state === 'idle' || this.rewardUnavailable || this.ride?.lineRewardsReady === false) return false;
    return this.rewardsPending || this.offlineTrail.length > 0 ||
      (!this.serverSessionId && this.entryFix !== null);
  }

  /** Walking with the line in the last few seconds (OS speed), else the server's view. */
  private isMoving(now = Date.now()): boolean {
    if (this.sawSpeed) return now - this.lastWalkingAt <= 5_000;
    return Boolean(this.bonus?.motion?.moving);
  }

  // -- Queue Bonus Rounds ---------------------------------------------------

  /**
   * Fold a server bonus block in. New claims become celebrations exactly once
   * (seen set in the checkpoint), and the next threshold arms the forced
   * heartbeats that make the gem pop on time.
   */
  private applyBonus(next: LineBonusSummary | null | undefined): void {
    if (next === undefined) return;
    this.bonus = next;
    if (!next) {
      this.clearForcedHeartbeats();
      return;
    }
    const sessionId = this.serverSessionId;
    if (sessionId && !this.processedBonus.has(next)) {
      this.processedBonus.add(next);
      const events = takeNewBonusEvents(sessionId, next, this.bonusSeen);
      this.bonusSeen = [...events.seen];
      for (const claim of events.claims) this.bonusFx.push({ id: ++this.bonusFxSeq, kind: 'claim', claim });
      for (const encore of events.encores) this.bonusFx.push({ id: ++this.bonusFxSeq, kind: 'encore', encore });
      for (const perk of events.perks) this.bonusFx.push({ id: ++this.bonusFxSeq, kind: 'perk', perk });
      this.bonusFx = this.bonusFx.slice(-12);
    }
    this.scheduleForcedHeartbeats();
  }

  /** The screen played (or skipped) a celebration. */
  consumeBonusFx(id: number): void {
    const before = this.bonusFx.length;
    this.bonusFx = this.bonusFx.filter(event => event.id !== id);
    if (this.bonusFx.length !== before) {
      this.persistCheckpoint();
      this.emit();
    }
  }

  /** "Looks like you left the line": RESUME once they are back. */
  resumeAfterLeftLine(): void {
    if (!this.clientLeftLine) return;
    this.clientLeftLine = false;
    this.exitDetector.reset();
    this.emit();
    if (this.lastSample && isRecentQueueSample(this.lastSample)) void this.heartbeat(this.lastSample);
  }

  private clearForcedHeartbeats(): void {
    this.forcedHeartbeatTimers.forEach(clearTimeout);
    this.forcedHeartbeatTimers = [];
    this.forcedThreshold = null;
  }

  /** At the predicted threshold, heartbeat at +2 s and +5 s so the pop lands within about 3 s. */
  private scheduleForcedHeartbeats(): void {
    const next = this.bonus?.enabled ? this.bonus.next_opens_at_eligible_seconds : null;
    if (next == null || (this.state !== 'active' && this.state !== 'paused')) {
      this.clearForcedHeartbeats();
      return;
    }
    if (this.forcedThreshold === next) return;
    this.clearForcedHeartbeats();
    const remaining = nextBonusSeconds(this.bonus, this.verifiedEligibleSeconds,
      this.lastSuccessfulPresenceUpdateAt || null, Date.now());
    if (remaining == null || remaining > 15 * 60) return;
    this.forcedThreshold = next;
    for (const delay of forcedHeartbeatDelaysMs(remaining)) {
      this.forcedHeartbeatTimers.push(setTimeout(() => {
        if (this.disposed || this.state === 'complete') return;
        const sample = this.lastSample;
        if (sample && isRecentQueueSample(sample)) void this.heartbeat(sample);
      }, delay));
    }
  }

  /**
   * Get this round's server seed and tier before Current Quest opens. Walking
   * guests may get the Stroll tier; they are never stopped. Null when bonus
   * rounds are off (the game then plays its usual board).
   */
  async prepareBonusQuest(): Promise<CurrentQuestAttempt | null> {
    if (!this.bonus?.enabled || !this.bonus.sources.current_quest || !this.serverSessionId ||
        this.state !== 'active') return null;
    if (this.questAttemptRequest) return this.questAttemptRequest;
    const sessionId = this.serverSessionId;
    // Replace an unfinished round (the server only does so after 20 s of play),
    // but never one whose proof is still on its way.
    const replace = this.questAttempt != null && this.bonusQuestProof?.attempt_id !== this.questAttempt.attempt_id;
    const request = startCurrentQuestAttempt(sessionId, this.isMoving(), replace)
      .then(attempt => {
        if (this.serverSessionId !== sessionId) return null;
        this.questAttempt = attempt;
        this.emit();
        return attempt;
      })
      .catch(error => {
        console.info('[LinePlaySession] bonus round seed unavailable', (error as { response?: { status?: number } })?.response?.status ?? 'network');
        return null;
      })
      .finally(() => { this.questAttemptRequest = null; });
    this.questAttemptRequest = request;
    return request;
  }

  /** Submit a bonus-round win; the server replays it and pays a slot, a save or Encore. */
  private submitBonusQuest(proof: CurrentQuestProof): void {
    this.bonusQuestProof = proof;
    this.persistCheckpoint();
    if (this.bonusQuestSubmission || !this.serverSessionId) return;
    const sessionId = this.serverSessionId;
    this.bonusQuestSubmission = submitCurrentQuest(sessionId, proof)
      .then(response => {
        if (this.serverSessionId !== sessionId) return;
        if (response?.verified) {
          this.bonusQuestProof = null;
          if (this.questAttempt?.attempt_id === proof.attempt_id) this.questAttempt = null;
        }
        this.applyBonus(response?.bonus);
        this.persistCheckpoint();
        this.emit();
      })
      .catch(error => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        // A refused proof will never verify; a network error retries later.
        if (status === 422 || status === 409 || status === 404) this.bonusQuestProof = null;
        console.warn('[LinePlaySession] bonus round proof pending:', status ?? error);
      })
      .finally(() => { this.bonusQuestSubmission = null; });
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
      navigationPanels: this.navigationPanels,
      crewGridMarks: [...this.crewGridMarks],
      gamePlays: { ...this.gamePlays },
      gameDifficulty: { ...this.gameDifficulty },
      gameBestStars: { ...this.gameBestStars },
      endReason: this.endReason,
      prediction: this.prediction,
      boardingConfirmed: this.boardingConfirmed,
      boardingAt: this.boardingAt,
      crewRelay: this.crewRelay,
      state: this.state === 'complete' ? 'complete' : 'active',
      verifiedEligibleSeconds: this.verifiedEligibleSeconds,
      rewards: this.rewards,
      rewardsPending: this.rewardsPending,
      currentQuestProof: this.currentQuestProof,
      bonusSeen: this.bonusSeen,
      bonusQuestProof: this.bonusQuestProof,
      entryFix: this.entryFix,
      offlineTrail: this.offlineTrail,
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
    // A round finished during the wrap-up still counts in the recap (it is
    // cosmetic; the server's verified wait owns every reward).
    if (this.completedActivityIds.has(id) || (this.state !== 'active' && this.state !== 'ending')) return;
    this.completedActivityIds.add(id);
    this.recordPlayedAdaptiveEpisode(id);
    this.persistCheckpoint();
    this.emit();
  }

  /**
   * Launch a queue round. Returns the seed and difficulty for this play: the
   * first play keeps the playlist board, every replay deals a new one, and
   * the counter survives an app restart through the checkpoint.
   */
  beginGame(item: Extract<ActivityItem, { kind: 'minigame' }>): { seed: number; difficulty: QueueDifficulty; plays: number; tier: CurrentTier } {
    const plays = Math.max(0, this.gamePlays[item.id] ?? 0);
    const difficulty = this.gameDifficulty[item.gameId] ?? 1;
    let seed: number;
    let tier: CurrentTier = 'standard';
    if (item.gameId === 'current' && this.questAttempt && this.bonus?.enabled) {
      // A bonus round replays the server's own seed at the server's tier.
      seed = this.questAttempt.seed;
      tier = this.questAttempt.tier;
    } else if (item.gameId === 'current' && this.currentQuestBonusEnabled && !this.currentQuestVerified &&
        this.currentQuestSeed != null) {
      // The bonus proof must replay the server's own route.
      seed = this.currentQuestSeed;
    } else if (item.gameId === 'trivia') {
      // Trivia keeps a deck cursor: each replay starts after the last round.
      seed = item.seed + plays * LINEPLAY_ROUND_QUESTIONS;
    } else {
      seed = replaySeed(item.seed, plays);
    }
    if (this.state === 'active') {
      this.gamePlays = { ...this.gamePlays, [item.id]: Math.min(999, plays + 1) };
      this.persistCheckpoint();
      this.emit();
    }
    return { seed, difficulty, plays, tier };
  }

  /** A 2+ star finish makes the next round of that game a step harder; the best run is kept. */
  recordGameResult(gameId: MiniGameId, stars: number): void {
    const safeStars = Number.isFinite(stars) ? Math.max(0, Math.min(3, Math.floor(stars))) : 0;
    const next = nextQueueDifficulty(this.gameDifficulty[gameId], safeStars);
    const best = Math.max(this.gameBestStars[gameId] ?? 0, safeStars);
    const difficultyChanged = next !== (this.gameDifficulty[gameId] ?? 1);
    const bestChanged = this.gameBestStars[gameId] !== best;
    if (!difficultyChanged && !bestChanged) return;
    if (difficultyChanged) this.gameDifficulty = { ...this.gameDifficulty, [gameId]: next };
    if (bestChanged) this.gameBestStars = { ...this.gameBestStars, [gameId]: best };
    this.persistCheckpoint();
    this.emit();
  }

  /** The guest saw the heads up; clear it so it cannot replay on a remount. */
  acknowledgeQueueAdvance(): void {
    if (this.queueAdvanceAt == null) return;
    this.queueAdvanceAt = null;
    this.emit();
  }

  /**
   * Ride detection thinks this guest rode. That signal comes from a single
   * fix leaving the ride radius, which indoor queue drift can fake, so it only
   * asks the guest. Play keeps going, nothing counts down, and boarding is
   * recorded only when the guest says so (endNow(true)).
   */
  suggestBoarded(): void {
    if (this.state !== 'active' && this.state !== 'paused') return;
    if (this.boardingSuggested) return;
    this.boardingSuggested = true;
    this.emit();
  }

  /** The guest answered "Still in line" to a ride detection. */
  dismissBoardingSuggestion(): void {
    if (!this.boardingSuggested) return;
    this.boardingSuggested = false;
    this.emit();
  }

  /**
   * A full-screen mini-game opened or closed. While one is open the wrap-up
   * countdown is held (the guest cannot see its sheet), and it resumes with
   * the time it had left when the game closes.
   */
  setGameOpen(open: boolean): void {
    if (this.gameOpen === open) return;
    this.gameOpen = open;
    if (this.state === 'ending') {
      if (open) this.holdGrace();
      else this.releaseGrace();
    }
    this.emit();
  }

  private holdGrace(): void {
    if (this.graceHeldMs != null) return;
    this.graceHeldMs = this.computeGraceRemaining();
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  private releaseGrace(): void {
    if (this.graceHeldMs == null) return;
    const remaining = this.graceHeldMs;
    this.graceHeldMs = null;
    this.armGrace(remaining);
  }

  private armGrace(remainingMs: number): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceStartedAt = Date.now() - (EXIT_GRACE_MS - remainingMs);
    this.graceTimer = setTimeout(() => {
      void this.complete();
    }, remainingMs);
  }

  private recordPlayedAdaptiveEpisode(activityId: string): void {
    const count = this.chapter?.episodeCount ?? 1;
    if (this.adaptiveEpisodeRecorded || !this.chapter || count < 2 || !this.ride ||
        !this.checkpointPlayerId || !activityId.startsWith(`${this.chapter.id}-`)) return;
    const suffix = this.chapter.id.match(/-episode-(\d+)$/);
    // An authored chapter's first episode has no suffix (flight 1 keeps its id).
    const episode = suffix ? Number(suffix[1]) : this.chapter.adaptive ? null : 0;
    if (episode == null) return;
    this.adaptiveEpisodeRecorded = true;
    void recordAdaptiveEpisode(this.checkpointPlayerId, this.ride.parkId, this.ride.rideId, episode, count);
  }

  /** Keep proof through an outage; the completion request carries it again. */
  recordCurrentQuest(meta?: Record<string, unknown>): void {
    const attempt = this.questAttempt;
    if (attempt && this.bonus?.enabled && meta && meta.seed === attempt.seed) {
      const { score, duration, paths } = meta;
      if (!Number.isInteger(score) || !Number.isInteger(duration) || !Array.isArray(paths) ||
          paths.length !== attempt.voyages ||
          !paths.every(path => Array.isArray(path) && path.length >= 7 && path.length <= 100 &&
            path.every(index => Number.isInteger(index) && index >= 0 && index <= 24))) return;
      this.submitBonusQuest({ attempt_id: attempt.attempt_id, seed: attempt.seed, score: score as number,
        duration_seconds: Math.max(1, duration as number), paths: paths as number[][] });
      return;
    }
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

  /** Local story play only; the server's verified wait still owns every reward. */
  rotateNavigationPanel(id: string, index: number): void {
    const item = this.circuitItem(id);
    if (!item) return;
    const current = this.navigationPanels[id] ?? createNavigationPanelProgress(item.seed, 0, this.completedActivityIds.has(id));
    const next = turnNavigationTile(item.seed, current, index);
    if (next === current) return;
    this.navigationPanels = { ...this.navigationPanels, [id]: next };
    if (traceNavigationPanel(createNavigationPanel(item.seed, next.round), next.rotations).solved) {
      this.completedActivityIds.add(id);
      this.recordPlayedAdaptiveEpisode(id);
    }
    this.persistCheckpoint(); this.emit();
  }

  /** The chapter's repair mission or any free-play circuit round. */
  private circuitItem(id: string): { id: string; seed: number } | null {
    if (this.state !== 'active') return null;
    const item = this.playlist.find(entry => entry.id === id);
    if (item?.kind === 'circuit') return item;
    if (item?.kind === 'trivia' && this.chapter?.navigationPanel && id === `${this.chapter.id}-trivia`) return item;
    return null;
  }

  startNextNavigationRound(id: string): void {
    const item = this.circuitItem(id);
    if (!item) return;
    const current = this.navigationPanels[id] ?? createNavigationPanelProgress(item.seed, 0, this.completedActivityIds.has(id));
    if (!traceNavigationPanel(createNavigationPanel(item.seed, current.round), current.rotations).solved) return;
    this.navigationPanels = { ...this.navigationPanels,
      [id]: createNavigationPanelProgress(item.seed, (current.round + 1) % 1000) };
    this.persistCheckpoint(); this.emit();
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
      ).filter(item => item.kind !== 'prediction' && item.kind !== 'crew_grid' && !existingIds.has(item.id))
        .slice(0, 40 - this.playlist.length);
      if (additions.length > 0) {
        this.playlist = appendBeforeCrewPrompts(this.playlist, additions);
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
    this.playlist = appendBeforeCrewPrompts(this.playlist, rounds);
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
    if (this.state !== 'ending') return 0;
    if (this.graceHeldMs != null) return this.graceHeldMs;
    if (this.graceStartedAt == null) return 0;
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
    // Fact-checked server trivia for this ride; the bundled deck covers offline.
    void primeTriviaDeck(ride.parkId, ride.rideId).catch(() => undefined);
    // This player's last 150 trivia cards, so the deck never repeats them.
    void primeTriviaHistory(playerId).catch(() => undefined);
    this.checkpointPlayerId = playerId ?? null;
    this.serverSessionId = null;
    this.backgroundTrackingSessionId = null;
    this.backgroundTrackingAvailable = null;
    this.rewardUnavailable = false;
    this.rewardConnectionIssue = null;
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
    if (!saved && (this.chapter?.episodeCount ?? 1) > 1 && playerId) {
      // Authored chapters start every new player on episode 1 (the original
      // story); returning players move on. Adaptive stories start anywhere.
      const nextEpisode = await selectAdaptiveEpisode(playerId, ride.parkId, ride.rideId,
        this.chapter!.episodeCount!, this.chapter!.adaptive ? playerId * 31 + ride.rideId * 17 : 0);
      if (this.disposed) return;
      this.chapter = getLinePlayChapter(ride.parkId, ride.rideSlug, ride.rideName, nextEpisode);
    }
    this.lastServerStartAttemptAt = 0;
    this.rewards = saved?.rewards ?? null;
    this.rewardsPending = saved?.rewardsPending ?? false;
    this.currentQuestProof = saved?.currentQuestProof ?? null;
    this.bonusSeen = saved?.bonusSeen ?? [];
    this.bonusQuestProof = saved?.bonusQuestProof ?? null;
    this.bonusFx = [];
    this.currentQuestVerified = false;
    this.currentQuestSeed = null;
    this.currentQuestBonusEnabled = false;
    this.endedAt = saved?.endedAt ?? null;
    this.pauseReason = null;
    this.lastSample = null;
    this.completedActivityIds = new Set(saved?.completedActivityIds ?? []);
    if (saved?.completedActivityIds.some(id => id.startsWith(`${this.chapter?.id}-`)))
      this.recordPlayedAdaptiveEpisode(saved.completedActivityIds.find(id =>
        id.startsWith(`${this.chapter?.id}-`))!);
    this.loreChoices = saved?.loreChoices ?? {};
    this.navigationPanels = saved?.navigationPanels ?? {};
    this.crewGridMarks = saved?.crewGridMarks ?? [];
    this.gamePlays = { ...(saved?.gamePlays ?? {}) };
    this.gameDifficulty = { ...(saved?.gameDifficulty ?? {}) };
    this.gameBestStars = { ...(saved?.gameBestStars ?? {}) };
    this.queueAdvanceAt = null;
    this.lastAdvanceAt = 0;
    this.endReason = saved?.endReason ?? null;
    this.awaySamples = 0;
    this.firstAwayAt = null;
    this.boardingSuggested = false;
    this.graceHeldMs = null;
    this.advanceTrail = [];
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
    // Entry checkpoint and offline trail survive an app kill in the checkpoint.
    this.entryFix = saved?.entryFix ?? null;
    this.offlineTrail = saved?.offlineTrail ? [...saved.offlineTrail] : [];
    this.serverCredit = null;
    this.trailSync = null;
    this.reopenedAt = saved && saved.state !== 'complete' ? Date.now() : null;
    this.nearSinceReopen = false;
    if (!saved) void prepareQueuePedometer().catch(() => undefined);
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
    if (!this.entryFix && startLocation && this.state === 'active') this.captureEntry(startLocation);
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
    } else if (this.state === 'complete' && saved && !saved.serverSessionId && saved.rewardsPending) {
      // An offline wait that ended before the app closed: its late start and
      // completion already sit in the reward queue.
      void this.retryQueue.drain();
    }
    if (this.serverSessionId && this.state === 'active') void this.syncTrail();
  }

  /**
   * Entry checkpoint (L1): the first fresh fix of the wait locks where and
   * when it began on the phone clock, so a start the server only hears about
   * later (no signal at the entrance) is still dated from here.
   */
  private captureEntry(sample: LocationSample): void {
    if (this.entryFix || !isRecentQueueSample(sample)) return;
    this.entryFix = toCheckpointFix(sample);
    this.persistCheckpoint();
  }

  /** Keep a fix the server could not take (no signal), for the next sync. */
  private keepOfflineFix(sample: LocationSample): void {
    if (!isRecentQueueSample(sample)) return;
    const before = this.offlineTrail.length;
    this.offlineTrail = appendTrail(this.offlineTrail, toCheckpointFix(sample));
    if (this.offlineTrail.length !== before) this.persistCheckpoint();
  }

  /**
   * Upload the offline trail (this screen's and the background task's).
   * Idempotent on the server; a failure keeps every fix for later.
   */
  private syncTrail(): Promise<void> {
    if (this.trailSync) return this.trailSync;
    const sessionId = this.serverSessionId;
    if (!sessionId || this.state === 'complete' || this.state === 'idle') return Promise.resolve();
    const run = (async () => {
      try {
        const background = await takeBackgroundTrail(sessionId);
        if (background.length) this.offlineTrail = mergeTrails(this.offlineTrail, background);
      } catch { /* background trail unavailable */ }
      if (!this.offlineTrail.length || this.serverSessionId !== sessionId) return;
      const batch = [...this.offlineTrail];
      try {
        const result = await syncLineSession(sessionId, batch);
        this.offlineTrail = trimSynced(this.offlineTrail, batch[batch.length - 1].at);
        if (!this.disposed && this.serverSessionId === sessionId) this.applyServerSnapshot(result);
      } catch (error) {
        console.info('[LinePlaySession] offline trail sync pending',
          (error as { response?: { status?: number } })?.response?.status ?? 'network');
      }
      this.persistCheckpoint();
    })();
    this.trailSync = run.finally(() => { this.trailSync = null; });
    return this.trailSync;
  }

  private applyServerSnapshot(result: LineSessionResponse): void {
    if (!result.success || !result.session_id) return;
    this.serverSnapshotRevision += 1;
    this.serverSessionId = result.session_id;
    this.rewardConnectionIssue = null;
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
    this.applyBonus(result.bonus);
    if (result.wait_screen !== undefined) this.waitScreen = result.wait_screen;
    if (result.credit !== undefined) this.serverCredit = result.credit ?? null;
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
    if (result.status === 'active' && this.bonus?.enabled && this.bonusQuestProof && !this.bonusQuestSubmission) {
      this.submitBonusQuest(this.bonusQuestProof);
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

    // A start sent late uses the entry checkpoint it saved: its own fix and
    // phone-clock time. A fresh start sends the current fix as today.
    if (!this.entryFix) this.captureEntry(sample);
    const entry = this.entryFix && Date.now() - this.entryFix.at > 30_000 ? this.entryFix : null;
    const attempt = (async () => {
      try {
        const result = await startInLineTimer(
          this.ride!.rideId,
          this.startRequestId!,
          entry?.latitude ?? sample.latitude,
          entry?.longitude ?? sample.longitude,
          entry ? { clientStartedAt: entry.at, accuracyMeters: entry.accuracyMeters }
            : { accuracyMeters: sample.accuracyMeters },
        );
        if (result.success && result.session_id) {
          this.lastSuccessfulPresenceUpdateAt = Date.now();
          this.applyServerSnapshot(result);
          if (this.offlineTrail.length) void this.syncTrail();
        }
      } catch (error) {
        const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response;
        if (!response) this.keepOfflineFix(sample);
        if (response?.status === 404 || response?.data?.code === 'LINE_REWARDS_UNAVAILABLE') {
          this.rewardUnavailable = true;
          this.rewardConnectionIssue = null;
        } else {
          this.rewardConnectionIssue = response?.data?.code === 'NOT_NEAR_RIDE' ? 'nearby'
            : response?.status === 401 || response?.status === 403 ? 'sign_in' : 'network';
        }
        this.emit();
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
      // After a dark gap (indoors), steps since the last nearby answer let the
      // server tell a creeping queue from a walk around the park.
      const now = Date.now();
      const darkFrom = this.lastSuccessfulPresenceUpdateAt;
      const steps = darkFrom > 0 && now - darkFrom > DARK_GAP_MS ? await readQueueSteps(darkFrom, now) : null;
      const sessionId = this.serverSessionId;
      if (!sessionId) return;
      const result = await heartbeatInLineTimer(sessionId, sample.latitude, sample.longitude,
        sample.accuracyMeters, steps);
      this.lastSuccessfulPresenceUpdateAt = Date.now();
      this.awaySamples = 0;
      this.firstAwayAt = null;
      this.nearSinceReopen = true;
      this.applyServerSnapshot(result);
      if (this.offlineTrail.length) void this.syncTrail();
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { code?: string; message?: string } } })?.response;
      const status = response?.status;
      // No answer at all: no signal. Keep the fix for the next sync.
      if (!response) this.keepOfflineFix(sample);
      // The server saying this fresh fix is not near the ride (older servers
      // send only the message). Validation 422s never count as leaving.
      if (status === 422 && (response?.data?.code === 'NOT_NEAR_RIDE' ||
          /near the ride/i.test(response?.data?.message ?? ''))) this.recordAwaySample(sample);
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
      this.signalError = data?.message ?? 'Could not save your vote. Check your internet and try again.';
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
      this.projectError = data?.message ?? 'Could not save your chapter vote. Check your internet and try again.';
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
      this.applyBonus(response.bonus ?? undefined);
      this.puzzleRequest = null;
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
      this.puzzleError = response?.data?.message ?? 'Could not check your guess. Tap Retry. You won’t lose it.';
      if (response?.status === 422 || response?.status === 409 || response?.status === 404) {
        this.puzzleRequest = null;
      }
    } finally {
      this.puzzlePending = false;
      this.emit();
    }
  }

  /**
   * The server said a fresh, accurate fix is away from the ride. Several in a
   * row over more than a minute mean the guest left the queue area: start the
   * wrap-up (saving progress and wait credit) instead of silently idling. A
   * single GPS jump or a noisy indoor fix never ends a wait.
   */
  private recordAwaySample(sample: LocationSample): void {
    if (this.state !== 'active' && this.state !== 'paused') return;
    const accuracy = sample.accuracyMeters;
    if (typeof accuracy === 'number' && accuracy > 50) return;
    const at = sample.timestamp ?? Date.now();
    this.awaySamples += 1;
    this.firstAwayAt ??= at;
    if (this.awaySamples >= EXIT_AWAY_SAMPLES && at - this.firstAwayAt >= EXIT_AWAY_MIN_MS) {
      this.beginEnding(false, 'left_queue');
    }
  }

  /** Manual pause. Only from active. Movement never calls this. */
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
    this.emit();
  }

  /**
   * Begin ending with a 60s grace window (exit undo). Called on detected exit
   * or when the user taps "End session". Auto-completes when the grace expires
   * unless undoEnd() is called first.
   */
  beginEnding(boardingConfirmed = false, reason: EndReason = 'manual'): void {
    if (this.state !== 'active' && this.state !== 'paused') return;
    this.endReason = reason;
    this.boardingConfirmed = boardingConfirmed;
    this.boardingSuggested = false;
    this.boardingAt = boardingConfirmed ? Date.now() : null;
    this.state = 'ending';
    this.graceHeldMs = null;
    this.armGrace(EXIT_GRACE_MS);
    // An open mini-game hides the wrap-up sheet: hold the countdown for it.
    if (this.gameOpen) this.holdGrace();
    this.persistCheckpoint();
    this.emit();
    // Keep ticking so graceMsRemaining animates down.
  }

  /** Explicitly confirmed line exits settle now, while the last nearby sample is fresh. */
  async endNow(boardingConfirmed: boolean): Promise<void> {
    if (this.state === 'ending') {
      // Answering the wrap-up sheet: keep the detected reason, record boarding.
      this.boardingConfirmed = boardingConfirmed;
      this.boardingAt = boardingConfirmed ? this.boardingAt ?? Date.now() : null;
      if (boardingConfirmed && this.endReason === 'left_queue') this.endReason = 'boarded';
    } else {
      this.beginEnding(boardingConfirmed, boardingConfirmed ? 'boarded' : 'manual');
    }
    await this.complete();
  }

  /**
   * "Still in line" after the wrap-up already settled (the countdown ran out,
   * or the guest tapped through too fast). The finished server session keeps
   * its rewards; a fresh one starts for the rest of the wait, carrying the
   * playlist, finished rounds, replays, difficulty and the story so far.
   */
  async continueInLine(): Promise<void> {
    if (this.disposed || this.state !== 'complete' || !this.ride || this.completionInFlight) return;
    this.startRequestId =
      `line-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    this.serverSessionId = null;
    this.serverStartInFlight = null;
    this.lastServerStartAttemptAt = 0;
    this.backgroundTrackingSessionId = null;
    this.backgroundTrackingAvailable = null;
    this.rewardConnectionIssue = null;
    this.verifiedEligibleSeconds = 0;
    // The rest of the wait is a new session with its own entry checkpoint.
    this.entryFix = null;
    this.offlineTrail = [];
    this.serverCredit = null;
    this.reopenedAt = null;
    this.creditedParts = null;
    this.rewards = null;
    this.rewardsPending = false;
    this.currentQuestVerified = false;
    this.currentQuestSeed = null;
    this.currentQuestBonusEnabled = false;
    this.endedAt = null;
    this.endReason = null;
    this.boardingConfirmed = false;
    this.boardingSuggested = false;
    this.boardingAt = null;
    this.graceStartedAt = null;
    this.graceHeldMs = null;
    this.awaySamples = 0;
    this.firstAwayAt = null;
    this.pauseReason = null;
    this.state = 'active';
    this.startTicking();
    this.persistCheckpoint();
    this.emit();
    const sample = this.lastSample;
    if (sample) await this.connectServer(sample, true);
  }

  /** Cancel an in-progress ending and return to active. */
  undoEnd(): void {
    if (this.state !== 'ending') return;
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.graceStartedAt = null;
    this.graceHeldMs = null;
    this.boardingConfirmed = false;
    this.boardingAt = null;
    this.endReason = null;
    // "Still in line": forget the away streak so the next check starts fresh.
    this.awaySamples = 0;
    this.firstAwayAt = null;
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
    this.graceHeldMs = null;
    this.boardingSuggested = false;
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
    if (this.bonusQuestSubmission) await this.bonusQuestSubmission;
    this.clearForcedHeartbeats();
    if (!this.serverSessionId && this.lastSample) {
      await this.connectServer(this.lastSample, true);
    }
    const recentSample = this.lastSample && Date.now() - (this.lastSample.timestamp ?? 0) <= 90_000
      ? this.lastSample : null;
    const checkpoint = await this.exitCheckpoint(recentSample);
    const sessionId = this.serverSessionId;
    if (!sessionId) {
      if (this.entryFix && this.startRequestId && this.ride && this.ride.rideId > 0 &&
          this.ride.lineRewardsReady !== false && !this.rewardUnavailable) {
        // The whole wait was offline (airplane mode, a dead zone at the
        // entrance). Its entry checkpoint starts the session late and the
        // exit completes it, from the reward queue, whenever signal returns.
        this.rewardsPending = true;
        this.persistCheckpoint();
        await this.retryQueue.enqueue({ sessionId: '',
          offlineStart: { rideId: this.ride.rideId, startRequestId: this.startRequestId, entry: this.entryFix },
          checkpoint, currentQuestProof: null, storyMemento: this.storyMemento() },
        `offline_${this.startRequestId}`);
        this.emit();
        return;
      }
      // No entry fix ever: nothing the server could credit. Show local elapsed.
      this.rewardsPending = false;
      this.emit();
      return;
    }

    // Attempt the complete immediately; on failure, queue for retry.
    try {
      const res = await completeInLineTimer(
        sessionId,
        recentSample?.latitude,
        recentSample?.longitude,
        this.currentQuestVerified ? undefined : this.currentQuestProof ?? undefined,
        this.storyMemento(),
        checkpoint,
      );
      if (res?.success) {
        this.offlineTrail = [];
        this.applyServerSnapshot(res);
      } else {
        await this.queueComplete(sessionId, checkpoint);
      }
    } catch (e) {
      console.warn('[LinePlaySession] completeInLineTimer failed, queueing:', e);
      await this.queueComplete(sessionId, checkpoint);
    }
    this.emit();
  }

  /**
   * Exit checkpoint (L1): how the wait ended, the offline trail, and steps
   * across the last dark gap. The server ignores it while its flag is off.
   */
  private async exitCheckpoint(recentSample: LocationSample | null): Promise<CheckpointPayload> {
    const sessionId = this.serverSessionId;
    if (sessionId) {
      try {
        const background = await takeBackgroundTrail(sessionId);
        if (background.length) this.offlineTrail = mergeTrails(this.offlineTrail, background);
      } catch { /* background trail unavailable */ }
    }
    const exit = buildExit({
      endReason: this.endReason,
      boardingAt: this.boardingAt,
      endedAt: this.endedAt ?? Date.now(),
      firstAwayAt: this.firstAwayAt,
      reopenedAt: this.reopenedAt,
      nearSinceReopen: this.nearSinceReopen,
      recentFix: recentSample && isRecentQueueSample(recentSample, this.endedAt ?? Date.now())
        ? toCheckpointFix(recentSample) : null,
    });
    const darkFrom = this.lastSuccessfulPresenceUpdateAt || this.entryFix?.at || this.startedAt || exit.at;
    const steps = exit.at - darkFrom > DARK_GAP_MS ? await readQueueSteps(darkFrom, exit.at) : null;
    return { exit, samples: [...this.offlineTrail], steps };
  }

  private async queueComplete(sessionId: string, checkpoint: CheckpointPayload | null = null): Promise<void> {
    this.rewardsPending = true;
    this.persistCheckpoint();
    // Idempotency key = the server session id, so a session is never completed
    // twice even across app restarts.
    await this.retryQueue.enqueue({ sessionId,
      currentQuestProof: this.currentQuestVerified ? null : this.currentQuestProof,
      storyMemento: this.storyMemento(), checkpoint }, `complete_${sessionId}`);
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
      completed_missions: [
        ...(this.completedActivityIds.has(`${chapter.id}-trivia`) ? ['signal' as const] : []),
        ...(this.completedActivityIds.has(`${chapter.id}-field-note`) ? ['observation' as const] : []),
        ...(this.completedActivityIds.has(`${chapter.id}-${chapter.finale.idSuffix}`) ? ['finale' as const] : []),
      ],
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
      bonus_round_parts?: number;
      live_parts?: number;
      encore_xp?: number;
      encore_energy?: number;
      bonus_park_day_used?: number;
      bonus_park_day_cap?: number;
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
      bonusRoundParts: rewards.bonus_round_parts ?? 0,
      liveParts: rewards.live_parts ?? null,
      encoreXp: rewards.encore_xp ?? 0,
      encoreEnergy: rewards.encore_energy ?? 0,
      bonusParkDayUsed: rewards.bonus_park_day_used ?? null,
      bonusParkDayCap: rewards.bonus_park_day_cap ?? null,
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
    this.rewardConnectionIssue = null;
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
    this.graceHeldMs = null;
    this.boardingSuggested = false;
    this.playlist = [];
    this.rewards = null;
    this.rewardsPending = false;
    this.completedActivityIds.clear();
    this.loreChoices = {};
    this.navigationPanels = {};
    this.crewGridMarks = [];
    this.gamePlays = {};
    this.gameDifficulty = {};
    this.gameBestStars = {};
    this.queueAdvanceAt = null;
    this.lastAdvanceAt = 0;
    this.endReason = null;
    this.awaySamples = 0;
    this.firstAwayAt = null;
    this.prediction = null;
    this.crewRelay = null;
    this.lastSample = null;
    this.advanceTrail = [];
    this.clearForcedHeartbeats();
    this.bonus = null;
    this.waitScreen = null;
    this.bonusSeen = [];
    this.bonusFx = [];
    this.questAttempt = null;
    this.questAttemptRequest = null;
    this.bonusQuestProof = null;
    this.bonusQuestSubmission = null;
    this.lastWalkingAt = 0;
    this.sawSpeed = false;
    this.clientLeftLine = false;
    this.exitDetector.reset();
    this.entryFix = null;
    this.offlineTrail = [];
    this.reopenedAt = null;
    this.nearSinceReopen = false;
    this.serverCredit = null;
    this.trailSync = null;
    this.emit();
  }

  /** Full teardown: call when the session controller is discarded. */
  dispose(): void {
    this.disposed = true;
    this.clearForcedHeartbeats();
    this.stopTicking();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.unsubscribeRecovery();
    this.listeners.clear();
  }

  // -- movement: heads up, never a pause ------------------------------------

  /**
   * Feed a location sample from the shared LocationContext stream. The line is
   * always moving, so this never pauses play. It keeps the last fix fresh for
   * the server, and when accurate fixes show the guest moved well forward in a
   * short span it raises a gentle heads up (queueAdvanceAt) the screen shows
   * as a toast.
   *
   * We never create a watcher here: the screen wires this to the context's
   * `location` updates.
   */
  ingestLocation(sample: LocationSample): void {
    const now = sample.timestamp ?? Date.now();
    this.lastSample = { ...sample, timestamp: now };

    if (!this.serverSessionId &&
        (this.state === 'active' || this.state === 'paused' || this.state === 'ending')) {
      void this.connectServer(sample);
    }
    if (this.state !== 'active') return;

    // Walking is a signal for the chip and quieter celebrations, never a pause.
    if (typeof sample.speedMps === 'number' && sample.speedMps >= 0) this.sawSpeed = true;
    if (isWalkingSample({ ...sample, timestamp: now })) this.lastWalkingAt = now;
    if (this.bonus?.enabled && !this.clientLeftLine &&
        this.exitDetector.feed({ timestamp: now, speedMps: sample.speedMps, accuracyMeters: sample.accuracyMeters })) {
      this.clientLeftLine = true;
      this.emit();
    }

    const accuracy = sample.accuracyMeters;
    if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > ADVANCE_MAX_ACCURACY_METERS) return;
    const fix = { ...sample, timestamp: now };
    this.advanceTrail = [...this.advanceTrail.filter(point =>
      now - (point.timestamp ?? 0) <= ADVANCE_WINDOW_MS && now >= (point.timestamp ?? 0)), fix].slice(-30);
    const origin = this.advanceTrail[0];
    if (!origin || origin === fix) return;
    if (haversineMeters(origin, fix) < ADVANCE_MIN_NET_METERS) return;
    if (this.lastAdvanceAt && now - this.lastAdvanceAt < ADVANCE_COOLDOWN_MS) return;
    this.lastAdvanceAt = now;
    this.queueAdvanceAt = now;
    this.advanceTrail = [fix];
    this.emit();
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
