/**
 * The ride question, asked once (core loop blueprint 4.3, "The ride question").
 *
 * A ride is asked about one time: LinePlay's "I got to the ride" when the guest
 * played in its line, else the ride detection sheet. The detection sheet asks
 * only when all of this holds:
 *  - the place is a ride with a real queue (never a show, a street vehicle, a
 *    train station walk-by or a walk-through),
 *  - the guest stayed long enough for that kind of ride (a walk past is not a ride),
 *  - LinePlay is not running at that ride, and its ride step did not log it in
 *    the last 30 minutes,
 *  - the guest is not walking toward the guide's next coin,
 *  - no other ride question was asked in the last 20 minutes.
 * Anything held back waits quietly in the Ride Tracker's batch confirm.
 *
 * Pure rules plus one tiny store. The prompt clock, the ride step holds and
 * the LinePlay waits are kept on the phone per player (rideQuestionLedger), so
 * an app relaunch never asks twice; the guide distance trail lives in memory.
 * No React or native imports.
 */
import { guide } from '../guide/nextCoin';
import { ledgerLastPromptAt, setLastRidePromptAt } from './rideQuestionLedger';
import { holdRideAfterRideStep as holdRide, isQueueRideType, minRideDwellMs, MIN_RIDE_DWELL_MS, RIDE_STEP_HOLD_MS,
  rideLoggedUntil } from '../RideDetectionService';

export { isQueueRideType, minRideDwellMs, MIN_RIDE_DWELL_MS, RIDE_STEP_HOLD_MS, rideLoggedUntil };

/** At most one ride question every 20 minutes. */
export const RIDE_PROMPT_GAP_MS = 20 * 60_000;
/** How far back the guide distance trail looks to tell "walking to the target". */
export const WALK_WINDOW_MS = 90_000;
/** Closing in on the target by this much inside the window counts as walking to it. */
export const WALK_CLOSING_METERS = 15;

export interface DistanceSample {
  readonly taskId: number;
  readonly meters: number;
  readonly at: number;
}

/**
 * Is the guest walking toward the guide's target right now? True when, for the
 * same target, the distance fell by WALK_CLOSING_METERS or more within the
 * window and the target is not yet in range.
 */
export function walkingTowardTarget(trail: readonly DistanceSample[], now: number, inRange = false): boolean {
  if (inRange || trail.length < 2) return false;
  const latest = trail[trail.length - 1];
  if (now - latest.at > WALK_WINDOW_MS) return false;
  return trail.some(sample => sample.taskId === latest.taskId && latest.at - sample.at <= WALK_WINDOW_MS &&
    sample.at <= latest.at && sample.meters - latest.meters >= WALK_CLOSING_METERS);
}

export type RidePromptVerdict =
  | 'ask'          // show the one ride question
  | 'lineplay'     // LinePlay is running at this ride: its own "I got to the ride" asks
  | 'lineplay_asked' // the visit was inside a LinePlay wait that already ended: LinePlay asked (or was told)
  | 'logged'       // the ride step logged this ride in the last 30 minutes: never ask again
  | 'not_a_ride'   // a show, transport, street or walk-through: never asked
  | 'too_short'    // a walk past, not a ride
  | 'walking'      // walking to the next coin: it waits in the Ride Tracker
  | 'too_soon';    // another ride question in the last 20 minutes: it waits in the Ride Tracker

export interface RidePromptInput {
  readonly rideId: number;
  readonly rideType: string | null | undefined;
  readonly dwellMs: number;
  readonly now: number;
  readonly rideMinDwellMinutes?: number | null;
  readonly rideDurationMinutes?: number | null;
  /** The ride LinePlay is running at (null when none). */
  readonly linePlayRideId?: number | null;
  /** The visit happened inside a LinePlay wait at this ride (rideQuestionLedger.visitInLinePlayWait). */
  readonly inLinePlayWait?: boolean;
  /** When the ride step's hold for this ride ends (0 or missing: none). */
  readonly loggedUntil?: number | null;
  readonly walking?: boolean;
  /** When the last ride question was asked (null: never). */
  readonly lastPromptAt?: number | null;
}

/** One verdict, first match wins. Only 'ask' and 'lineplay' put a question on screen. */
export function ridePromptVerdict(input: RidePromptInput): RidePromptVerdict {
  if (input.linePlayRideId != null && input.linePlayRideId === input.rideId) return 'lineplay';
  if (input.inLinePlayWait) return 'lineplay_asked';
  if (input.loggedUntil != null && input.loggedUntil > input.now) return 'logged';
  const min = minRideDwellMs(input.rideType, input.rideMinDwellMinutes, input.rideDurationMinutes);
  if (min == null) return 'not_a_ride';
  if (!(input.dwellMs >= min)) return 'too_short';
  if (input.walking) return 'walking';
  if (input.lastPromptAt != null && input.now - input.lastPromptAt < RIDE_PROMPT_GAP_MS) return 'too_soon';
  return 'ask';
}

/** Detections that should stay for the Ride Tracker's batch confirm (never the ones already logged or not rides). */
export function keepForBatch(verdict: RidePromptVerdict): boolean {
  return verdict === 'walking' || verdict === 'too_soon' || verdict === 'ask';
}

// -- the store ----------------------------------------------------------------

let trail: DistanceSample[] = [];
let trailInRange = false;
let unsubscribeGuide: (() => void) | null = null;

/** A ride question was put on screen (the detection sheet, LinePlay's boarding ask or the batch confirm). */
export function noteRidePrompt(now = Date.now()): void {
  setLastRidePromptAt(now);
}

export function lastRidePromptAt(): number | null {
  return ledgerLastPromptAt();
}

/** "I got to the ride": that ride is logged and this was its one question, so nothing asks again for 30 minutes. */
export function holdRideAfterRideStep(rideId: number, now = Date.now()): void {
  holdRide(rideId, now);
  setLastRidePromptAt(now);
}

/** Record where the guide's target is, so "walking to it" can be told apart from standing in a line. */
export function noteGuideDistance(taskId: number, meters: number | null, inRange: boolean, now = Date.now()): void {
  trailInRange = inRange;
  if (meters == null || !Number.isFinite(meters)) return;
  trail = [...trail.filter(sample => sample.taskId === taskId && now - sample.at <= WALK_WINDOW_MS),
    { taskId, meters, at: now }].slice(-12);
}

/** Is the guest walking toward the guide's target right now? */
export function walkingToGuideTarget(now = Date.now()): boolean {
  return walkingTowardTarget(trail, now, trailInRange);
}

/** Follow the guide store (the one pointer) so the gate knows the distance to its target. Idempotent. */
export function watchGuideForRidePrompts(): () => void {
  if (unsubscribeGuide) return unsubscribeGuide;
  const read = () => {
    const target = guide.current();
    if (!target) { trail = []; trailInRange = false; return; }
    noteGuideDistance(target.taskId, target.meters, target.inRange);
  };
  read();
  const off = guide.subscribe(read);
  unsubscribeGuide = () => { off(); unsubscribeGuide = null; };
  return unsubscribeGuide;
}

/** Tests only. */
export function resetRidePromptGateForTests(): void {
  trail = [];
  trailInRange = false;
  unsubscribeGuide?.();
  unsubscribeGuide = null;
}
