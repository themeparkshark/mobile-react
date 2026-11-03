/**
 * useRideDetection: Smart GPS Ride Detection Hook
 * 
 * TWO MODES:
 * 
 * 1. BACKGROUND (phone locked / app not active):
 *    - GPS tracks silently via background location task
 *    - Detections queue to AsyncStorage without any UI
 *    - When user opens app back up, batch confirm screen appears
 *      showing ALL rides detected while away
 * 
 * 2. FOREGROUND (app open and active):
 *    - GPS tracks in real-time
 *    - After each ride detected, single-ride popup appears immediately
 *    - User confirms or dismisses inline
 * 
 * NOTHING is auto-logged. Every detection requires user confirmation.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getRides, RideType } from '../api/endpoints/rides';
import waitFeed from '../services/lineplay/liveStub';
import rideDetectionService, {
  setDetectionRides,
  startDetection,
  stopDetection,
  getPendingDetections,
  DetectedRide,
} from '../services/RideDetectionService';
import { PARK_WIKI_IDS } from '../constants/parkWaitTimes';
import { navigationRef, navigate } from '../RootNavigation';
import { rideDetectionEmitter } from '../services/RideDetectionEmitter';
import { detectionExpired, detectionStillAskable, linePlayRideNow, minRideDwellMs, rideLoggedUntil,
  setDetectionLiveRows } from '../services/RideDetectionService';
import { ensureRideQuestionLedger, lastCoinGameAt, rideQuestionOwner, unaskedLinePlayBoardings,
  visitInLinePlayWait } from '../services/lineplay/rideQuestionLedger';
import { rideLineState, rideLiveStatus, type RideLiveRow } from '../services/lineplay/rideLines';
import { attentionGate } from '../screens/ExploreScreen/mapPresentationQueue';
import { keepForBatch, lastRidePromptAt, noteRidePrompt, ridePromptVerdict, walkingToGuideTarget,
  watchGuideForRidePrompts, type RidePromptVerdict } from '../services/lineplay/ridePromptGate';
import { LocationContext } from '../context/LocationProvider';
import useLivePoll from './useLivePoll';

/** Posted waits sharpen detection confidence: every 5 min on screen, every 15 min in a pocket. */
export const WAIT_TIMES_FOREGROUND_MS = 5 * 60 * 1000;
export const WAIT_TIMES_BACKGROUND_MS = 15 * 60 * 1000;

/** Tracks whether we've already navigated to batch confirm to prevent double navigation (BUG 8 fix) */
let batchConfirmNavigating = false;

/**
 * A ride question that is waiting for a calm moment (the map's attention rules said not now: the first 30 s
 * at a park, walking to the next coin, a game, a win card, or something else already opened by itself).
 * While set, the hook looks again every PENDING_RECHECK_MS with the app in front.
 */
let questionWaiting = false;
export const PENDING_RECHECK_MS = 20_000;

/**
 * May a ride question open by itself now? The map's attention rules decide (core loop 4.3: never in the first
 * 30 s at a park, while walking to the target, during play, within 10 s of a win card, and one automatic open
 * per app open). Asking takes this app open's one automatic open, so call it only right before opening.
 */
export function rideQuestionMayOpen(now = Date.now()): boolean {
  const open = attentionGate.request('ride_question', now);
  if (!open) questionWaiting = true;
  return open;
}

/** The park the guest is in now (ride detection's own), for the batch confirm. */
let currentParkId: number | null = null;

/**
 * Should this waiting detection ever be shown? No when it is stale or broken (another park day, a stay no
 * line explains), when the place has no line (a show the feed never gave a wait), when the ride is closed for
 * repairs, or when the stay was only its coin game (after the game, too short to be a ride).
 */
export function detectionWorthAsking(d: DetectedRide, now = Date.now()): boolean {
  if (detectionExpired(d, now)) return false;
  const line = rideLineState(d.rideId);
  if (line === 'no_line') return false;
  if (line === 'closed' && rideLiveStatus(d.rideId) === 'REFURBISHMENT') return false;
  const ride = rideDetectionService.rideById(d.rideId);
  const game = lastCoinGameAt(ride?.task_id ?? null, now);
  const exit = d.exitedAt ?? d.detectedAt;
  if (game != null && game >= d.enteredAt && game <= exit) {
    const min = minRideDwellMs(d.rideType, ride?.min_dwell_minutes, ride?.ride_duration_minutes);
    if (min == null || exit - game < min) return false;
  }
  return true;
}

/**
 * Check pending queue and navigate to batch confirm if there are rides.
 * Guards against double navigation and nav-not-ready.
 */
export async function checkAndShowPendingRides(): Promise<boolean> {
  // Prevent double navigation (BUG 8 fix)
  if (batchConfirmNavigating) return false;

  // Check if navigation is ready (ISSUE 9 fix)
  if (!navigationRef.isReady()) return false;

  try {
    // The ride step holds, the prompt clock and the LinePlay waits come back from the phone first, so a
    // relaunch never asks about a ride LinePlay already asked about.
    await ensureRideQuestionLedger().catch(() => undefined);
    // A phone pocketed to board, then the app closed: LinePlay comes back on that wait and asks its own
    // one question. That ride is never a batch confirm.
    if (await reopenLinePlayForRideQuestion()) return true;
    const pending = await getPendingDetections();
    if (pending.length === 0) { questionWaiting = false; return false; }
    // The LinePlay screen is up (a wait, its ride question or its recap): the batch confirm never lands on
    // top of it. The rides wait here until the guest leaves LinePlay.
    if (navigationRef.getCurrentRoute()?.name === 'LinePlay') return false;

    // One ride question (core loop 4.3): rides the ride step logged, shows, transport and walk-bys
    // never come back as a question; the rest wait here while the guest walks to the next coin or
    // another ride question was asked in the last 20 minutes.
    const now = Date.now();
    const verdicts = new Map<string, RidePromptVerdict>(pending.map(d => [d.id, detectionVerdict(d, now)]));
    // Never shown: answered or not a ride (the gate), stale, broken, a show, closed for repairs, or only a coin game.
    const worth = new Map(pending.map(d => [d.id, keepForBatch(verdicts.get(d.id)!) && detectionWorthAsking(d, now)]));
    for (const d of pending) {
      if (!worth.get(d.id)) await rideDetectionService.removePendingDetection(d.id);
    }
    // Rides from another park wait for that park (or the Ride Tracker): the batch here lists this park only.
    const askable = pending.filter(d => worth.get(d.id) && detectionStillAskable(d, now, currentParkId));
    if (askable.length === 0) { questionWaiting = false; return false; }
    questionWaiting = true;
    if (askable.some(d => verdicts.get(d.id) !== 'ask')) return false;
    // Filter to medium/high confidence only
    const meaningful = askable.filter(d => d.confidence !== 'low');
    if (meaningful.length === 0) {
      // Remove low confidence detections individually, not clearAll
      // to prevent race with new detections added between read and clear (ISSUE 10 fix)
      for (const d of pending) {
        await rideDetectionService.removePendingDetection(d.id);
      }
      return false;
    }

    // Check we're not already on the batch confirm screen
    const currentRoute = navigationRef.getCurrentRoute();
    if (currentRoute?.name === 'RideBatchConfirm' || currentRoute?.name === 'RideLog') return false;
    // Only at a calm moment, through the map's attention rules (never in the first 30 s at a park).
    if (!rideQuestionMayOpen(now)) return false;

    questionWaiting = false;
    batchConfirmNavigating = true;
    noteRidePrompt(now);
    navigate('RideBatchConfirm', { detections: meaningful } as any);

    // Reset flag after a short delay to allow re-navigation later
    setTimeout(() => { batchConfirmNavigating = false; }, 2000);
    return true;
  } catch (e) {
    batchConfirmNavigating = false;
    console.warn('Failed to check pending ride detections:', e);
    return false;
  }
}

/**
 * Ride detection kept a boarding signal on a LinePlay wait while the phone slept in a pocket, and the
 * LinePlay that should ask about it is not running (the app was closed, or LinePlay was left). Open
 * LinePlay on that ride: it restores the wait (its checkpoint) and asks "Did you get to the ride?" once,
 * then logs the ride with the timed wait. A wait whose recap was closed with Done is marked answered by
 * LinePlay, so this never opens a new wait. True when it opened LinePlay.
 */
export async function reopenLinePlayForRideQuestion(now = Date.now()): Promise<boolean> {
  if (navigationRef.getCurrentRoute()?.name === 'LinePlay') return false;
  const player = Number(rideQuestionOwner());
  if (!Number.isInteger(player) || player <= 0) return false;
  for (const wait of unaskedLinePlayBoardings(now)) {
    // A LinePlay screen open in this run asks itself; after a relaunch none is, even if detection kept its ride.
    if (wait.rideId === rideDetectionService.linePlayOpenHere() || rideLoggedUntil(wait.rideId, now) != null) continue;
    const ride = rideDetectionService.rideById(wait.rideId);
    if (!ride) continue;
    // LinePlay coming back by itself is an automatic open too: only at a calm moment.
    if (!rideQuestionMayOpen(now)) return false;
    navigate('LinePlay', { ride: { rideId: ride.id, rideName: ride.name, parkId: ride.park_id } } as any);
    return true;
  }
  return false;
}

/** The prompt gate's verdict for one detection, from what the phone knows right now. */
export function detectionVerdict(detection: DetectedRide, now = Date.now()): RidePromptVerdict {
  return ridePromptVerdict({
    rideId: detection.rideId,
    rideType: detection.rideType,
    dwellMs: detection.dwellTimeMs,
    now,
    linePlayRideId: linePlayRideNow(),
    inLinePlayWait: visitInLinePlayWait(detection.rideId, detection.enteredAt, detection.exitedAt, now),
    loggedUntil: rideLoggedUntil(detection.rideId, now),
    walking: walkingToGuideTarget(now),
    lastPromptAt: lastRidePromptAt(),
  });
}

export function useRideDetection(enabled: boolean, parkId?: number | null) {
  const { location, latestLocationSampleRef } = useContext(LocationContext);
  currentParkId = enabled ? parkId ?? null : null;

  // A ride question waiting for a calm moment is looked at again while the app is in front (paused in a pocket).
  const recheckWaiting = useCallback(() => questionWaiting ? checkAndShowPendingRides() : undefined, []);
  useLivePoll(recheckWaiting, PENDING_RECHECK_MS, { enabled, immediate: false });
  const ridesRef = useRef<RideType[]>([]);
  const [ridesLoaded, setRidesLoaded] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const initialCheckDoneRef = useRef(false);

  // The map's foreground watcher is already providing raw OS samples. Use its
  // latest fresh fix for ride entry and exit, including after navigating away.
  useEffect(() => {
    if (!enabled || appStateRef.current !== 'active') return;
    const sample = latestLocationSampleRef.current;
    if (!sample || Date.now() - sample.timestamp > 30_000 ||
        sample.timestamp > Date.now() + 5_000) return;
    rideDetectionService.processForegroundLocation(sample.latitude, sample.longitude);
  }, [enabled, location?.latitude, location?.longitude, latestLocationSampleRef]);

  // Handle foreground single-ride detection
  useEffect(() => {
    if (!enabled) return;

    const stopWatchingGuide = watchGuideForRidePrompts();
    const handleForegroundDetection = (detection: DetectedRide) => {
      if (AppState.currentState !== 'active') return;
      const verdict = detectionVerdict(detection);
      // LinePlay at this ride asks its own "I got to the ride" (the one question); the sheet stays quiet.
      // With its screen closed (a footer tab peek), LinePlay comes back to ask at the next calm moment.
      if (verdict === 'lineplay') {
        rideDetectionEmitter.emit('rideDetected', detection);
        if (rideDetectionService.linePlayOpenHere() !== detection.rideId) questionWaiting = true;
        return;
      }
      if (verdict === 'ask' && detectionWorthAsking(detection)) {
        // The sheet over the map is an automatic open: the map's attention rules decide, else it waits.
        if (!rideQuestionMayOpen()) return;
        noteRidePrompt();
        rideDetectionEmitter.emit('rideDetected', detection);
        return;
      }
      if (verdict === 'ask') { void rideDetectionService.removePendingDetection(detection.id).catch(() => undefined); return; }
      if (keepForBatch(verdict)) questionWaiting = true;
      // Logged by the ride step, or not a ride: forget it. Walking or too soon: it waits in the Ride Tracker.
      if (!keepForBatch(verdict)) void rideDetectionService.removePendingDetection(detection.id).catch(() => undefined);
    };

    rideDetectionService.onForegroundDetection = handleForegroundDetection;

    return () => {
      rideDetectionService.onForegroundDetection = null;
      stopWatchingGuide();
    };
  }, [enabled]);

  // AppState listener: check pending rides when coming back to foreground
  useEffect(() => {
    if (!enabled) return;
    // The ref only tracks while enabled; resync so a background stint while
    // disabled is not mistaken for 'active'.
    appStateRef.current = AppState.currentState;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      const wasBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      const nowForeground = nextState === 'active';

      if (wasBackground && nowForeground) {
        // User just opened the app back up
        setTimeout(() => {
          checkAndShowPendingRides();
        }, 500);
      }

      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [enabled]);

  // Initialize detection service
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function init() {
      try {
        const rides = await getRides();
        if (cancelled) return;
        ridesRef.current = rides;
        setDetectionRides(rides);

        await startDetection();
        if (cancelled) return;
        const sample = latestLocationSampleRef.current;
        if (sample && Date.now() - sample.timestamp <= 30_000 &&
            sample.timestamp <= Date.now() + 5_000) {
          rideDetectionService.processForegroundLocation(sample.latitude, sample.longitude);
        }

        // Wait times poll below (useLivePoll) once the rides are known.
        setRidesLoaded(true);

        // On initial mount, check for pending detections from a previous session
        if (!initialCheckDoneRef.current) {
          initialCheckDoneRef.current = true;
          setTimeout(() => {
            checkAndShowPendingRides();
          }, 2000);
        }
      } catch (e) {
        console.error('Failed to initialize ride detection:', e);
      }
    }

    init();

    return () => {
      cancelled = true;
      stopDetection();
      setRidesLoaded(false);
    };
  }, [enabled]);

  // Only the park the guest is in: the themeparks.wiki feed for each park is a
  // large download, and fetching all eleven every 5 minutes cost far more
  // radio and parsing than detection ever used.
  const refreshWaitTimes = useCallback(() => fetchAndSetWaitTimes(ridesRef.current, parkId ?? null), [parkId]);
  useLivePoll(refreshWaitTimes, WAIT_TIMES_FOREGROUND_MS, {
    enabled: enabled && ridesLoaded, backgroundMs: WAIT_TIMES_BACKGROUND_MS, key: parkId ?? null,
  });
}

export function waitTimeParkIds(rides: readonly RideType[], parkId: number | null): number[] {
  const ids = parkId != null ? [parkId] : Array.from(new Set(rides.map(r => r.park_id)));
  return ids.filter(pid => PARK_WIKI_IDS[pid]);
}

async function fetchAndSetWaitTimes(rides: RideType[], parkId: number | null) {
  if (!rides.length) return;
  try {
    const parkIds = waitTimeParkIds(rides, parkId);
    const allEntries: { name: string; queue?: { STANDBY?: { waitTime: number | null } } }[] = [];

    // Fetch all parks in parallel (ISSUE 11 fix)
    const results = await Promise.allSettled(parkIds.map(pid => waitFeed(pid)));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allEntries.push(...result.value);
      }
    }

    if (allEntries.length > 0) {
      const parkRides = parkId != null ? rides.filter(r => r.park_id === parkId) : rides;
      const waitTimeMap = buildWaitTimeMap(allEntries, parkRides);
      rideDetectionService.setCurrentWaitTimes(waitTimeMap);
      // Open, closed and show-like answers: no ride question, in-line offer or line story where there is no line.
      setDetectionLiveRows(parkId, liveRowsFor(allEntries, parkRides));
    }
  } catch (e) {
    console.warn('Failed to fetch wait times for detection:', e);
  }
}

/** The feed's status and posted wait for every catalog ride it names (matched by plain name). */
export function liveRowsFor(
  wikiEntries: readonly { name: string; status?: string; queue?: { STANDBY?: { waitTime: number | null } } }[],
  rides: readonly RideType[],
): RideLiveRow[] {
  const nameToRide = new Map<string, RideType>();
  for (const ride of rides) nameToRide.set(ride.name.toLowerCase().trim(), ride);
  const rows: RideLiveRow[] = [];
  for (const entry of wikiEntries) {
    const match = nameToRide.get(entry.name.toLowerCase().trim());
    if (!match || typeof entry.status !== 'string') continue;
    const wait = entry.queue?.STANDBY?.waitTime;
    rows.push({ rideId: match.id, status: entry.status, wait: typeof wait === 'number' && wait >= 0 ? wait : null });
  }
  return rows;
}

function buildWaitTimeMap(
  wikiEntries: { name: string; queue?: { STANDBY?: { waitTime: number | null } } }[],
  rides: RideType[],
): Map<number, number> {
  const map = new Map<number, number>();
  const nameToRide = new Map<string, RideType>();

  for (const ride of rides) {
    nameToRide.set(ride.name.toLowerCase().trim(), ride);
  }

  for (const entry of wikiEntries) {
    const waitTime = entry.queue?.STANDBY?.waitTime;
    if (waitTime == null || waitTime < 0) continue;

    const match = nameToRide.get(entry.name.toLowerCase().trim());
    if (match) {
      map.set(match.id, waitTime);
    }
  }

  return map;
}

export default useRideDetection;
