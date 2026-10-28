/**
 * The ride step (core loop blueprint 2, step 6): "I got to the ride" is the one
 * ride record.
 *
 * Saying it in LinePlay (the end sheet, the boarding ask, or the wrap-up)
 *  - logs the ride once, through the ride journal outbox, with the wait LinePlay
 *    timed (never "Like 45" typed by hand),
 *  - opens the Ride Journal already filled in (the ride and the timed wait) when
 *    the guest wants to add stars, a face or a note, saving into the same row,
 *  - covers that ride for 30 minutes so ride detection never asks again,
 *  - stamps today's Adventure when this is its ride and its line story is done.
 *
 * Pure helpers; the screen does the calls. No React or native imports.
 */
import type { LogRidePayload } from '../../api/endpoints/player-rides';

/** The outbox keeps the ride step's ride unsent this long, so the journal can add its memory to the same row. */
export const RIDE_STEP_JOURNAL_HOLD_MS = 15 * 60_000;

/** One stable id per wait, so a retry or a journal save never makes a second ride row. */
export function rideStepLogId(rideId: number, startedAt: number | null, sessionId?: string | null): string {
  const key = sessionId && /^[A-Za-z0-9_-]{1,60}$/.test(sessionId) ? sessionId : String(Math.max(0, Math.round(startedAt ?? 0)));
  return `lineplay-${rideId}-${key}`.slice(0, 100);
}

/** Whole minutes from joining the line to the ride (null when either end is unknown). */
export function timedWaitMinutes(startedAt: number | null | undefined, boardingAt: number | null | undefined): number | null {
  if (startedAt == null || boardingAt == null || !Number.isFinite(startedAt) || !Number.isFinite(boardingAt)) return null;
  // Whole minutes, the same way the recap counts them (a 34:50 wait is "34 min" everywhere).
  const minutes = Math.floor((boardingAt - startedAt) / 60_000);
  return minutes >= 0 && minutes <= 600 ? minutes : null;
}

export interface RideStepInput {
  readonly rideId: number;
  readonly rideName: string;
  readonly parkId: number | null;
  readonly playerId: number;
  readonly startedAt: number | null;
  readonly boardingAt: number | null;
  readonly sessionId?: string | null;
  readonly now?: number;
}

/** What the outbox keeps for the ride step: the ride, its timed wait and when it was ridden. */
export function rideStepLog(input: RideStepInput): {
  payload: LogRidePayload & { source_detection_id: string };
  ride_name: string; park_id: number | null; player_id: number; queued_at: number; hold_until: number;
} {
  const now = input.now ?? Date.now();
  const wait = timedWaitMinutes(input.startedAt, input.boardingAt);
  const rodeAt = new Date(input.boardingAt ?? now).toISOString();
  return {
    payload: {
      ride_id: input.rideId,
      source_detection_id: rideStepLogId(input.rideId, input.startedAt, input.sessionId),
      ...(wait != null ? { wait_time_minutes: wait } : {}),
      rode_at: rodeAt,
    },
    ride_name: input.rideName,
    park_id: input.parkId,
    player_id: input.playerId,
    queued_at: now,
    hold_until: now + RIDE_STEP_JOURNAL_HOLD_MS,
  };
}

/** The Ride Journal's route params for the ride step: the ride and the timed wait, filled in. */
export function rideStepJournalParams(input: RideStepInput & { rideType?: string | null }): Record<string, unknown> {
  const wait = timedWaitMinutes(input.startedAt, input.boardingAt);
  return {
    rideId: input.rideId,
    rideName: input.rideName,
    rideType: input.rideType ?? 'attraction',
    parkId: input.parkId ?? undefined,
    autoDetected: true,
    fromRideStep: true,
    detectionId: rideStepLogId(input.rideId, input.startedAt, input.sessionId),
    rodeAt: new Date(input.boardingAt ?? input.now ?? Date.now()).toISOString(),
    waitMinutes: wait ?? undefined,
  };
}

/**
 * "Sign said 20, you waited 11." Only when the sign's number was a real posted
 * wait and the guest got to the ride (a game estimate is never called "the sign").
 */
export function signSaidLine(input: {
  postedMinutes: number | null | undefined;
  waitSource: 'posted' | 'last_known' | 'estimate' | null | undefined;
  waitedMinutes: number | null | undefined;
}): string | null {
  const { postedMinutes, waitSource, waitedMinutes } = input;
  if (waitedMinutes == null || !Number.isFinite(waitedMinutes) || waitedMinutes < 0) return null;
  const waited = Math.round(waitedMinutes);
  const unit = waited === 1 ? 'minute' : 'minutes';
  if (postedMinutes == null || !(postedMinutes > 0) || waitSource == null || waitSource === 'estimate') {
    return `You waited ${waited} ${unit}`;
  }
  return `Sign said ${Math.round(postedMinutes)}, you waited ${waited}`;
}

export interface AdventureTicketLike {
  readonly id: number;
  readonly phase: 'discover' | 'play' | 'celebrate' | 'complete';
  readonly ride: { readonly ride_id: number };
}

/** Is this ride today's Adventure ride with its last stamp (celebrate the ride) waiting? */
export function adventureRideStampDue(ticket: AdventureTicketLike | null | undefined, rideId: number): boolean {
  return ticket != null && ticket.phase === 'celebrate' && ticket.ride?.ride_id === rideId;
}

/** "Two Parts are waiting", in words a kid reads, for the recap GO. */
export function partsWaitingWords(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? '1 Part is waiting' : `${n} Parts are waiting`;
}

/** The recap's one GO: `label` is the sentence ("Win Jungle Cruise's coin: 1 Part is waiting"), `button` the word on it. */
export type RecapGo =
  | { readonly kind: 'win_coin'; readonly label: string; readonly button: string; readonly taskId: number | null }
  | { readonly kind: 'level_up'; readonly label: string; readonly button: string }
  | { readonly kind: 'next_coin'; readonly label: string; readonly button: string; readonly taskId: number | null }
  | { readonly kind: 'shelf'; readonly label: string; readonly button: string };

/**
 * The recap's one GO. A coin you do not own yet: win it (its Parts wait in its
 * slot). A coin ready to level up: level it up. Otherwise the guide's next coin,
 * or the park shelf when the guide has none.
 */
export function recapGo(input: {
  rideName: string;
  coinState: 'idle' | 'loading' | 'owned' | 'unowned' | 'unavailable';
  partsEarned: number;
  rideTaskId: number | null;
  upgradeReady: boolean;
  nextCoin: { taskId: number; name: string } | null;
}): RecapGo {
  if (input.coinState === 'unowned') {
    return {
      kind: 'win_coin', taskId: input.rideTaskId, button: 'GO',
      label: input.partsEarned > 0
        ? `Win ${input.rideName}’s coin: ${partsWaitingWords(input.partsEarned)}`
        : `Win ${input.rideName}’s coin`,
    };
  }
  if (input.coinState === 'owned' && input.upgradeReady) {
    return { kind: 'level_up', label: `Level up ${input.rideName}’s coin`, button: 'LEVEL UP' };
  }
  if (input.nextCoin) return { kind: 'next_coin', label: `Next coin: ${input.nextCoin.name}`, button: 'GO', taskId: input.nextCoin.taskId };
  return { kind: 'shelf', label: 'See your park shelf', button: 'SHELF' };
}
