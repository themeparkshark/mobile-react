/**
 * Fin-ister Nights phases and activation. Pure, unit tested.
 *
 * R3: off / early (early_opens_at..opens_at) / live / last_call (final 30 min)
 *     / after (close + after_grace) / off. No night row = off all day.
 * R4: the server picks "tonight" (a 1:30 AM moment belongs to the night
 *     before); the client only compares absolute instants, so midnight and the
 *     November fall-back hour need no special case.
 * R6: Mode ON = the player's park (LocationContext, same sticky presence as
 *     the server) is the event's park AND the phase is early, live or last_call.
 * R10: just before opening shows early or off with a countdown; just after
 *     close shows after; more than after_grace past close is off.
 */
import type { FrightNightWindow, FrightPhase, FrightTonight } from '../../api/endpoints/fright/types';

const ON_PHASES: readonly FrightPhase[] = ['early', 'live', 'last_call'];

function at(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** The phase at a server-corrected instant. */
export function computePhase(night: FrightNightWindow | null | undefined, now: number): FrightPhase {
  if (!night) return 'off';
  const opens = at(night.opens_at);
  const closes = at(night.closes_at);
  if (opens == null || closes == null || closes <= opens) return 'off';
  const early = at(night.early_opens_at);
  const lastCall = at(night.last_call_at) ?? closes - 30 * 60_000;
  const afterUntil = at(night.after_until) ?? closes + 60 * 60_000;
  if (early != null && early < opens && now >= early && now < opens) return 'early';
  if (now >= opens && now < lastCall) return 'live';
  if (now >= lastCall && now < closes) return 'last_call';
  if (now >= closes && now < afterUntil) return 'after';
  return 'off';
}

/**
 * The phase to show: the client recompute when the night window is known (so
 * edges flip on time between polls), else the server's word.
 */
export function effectivePhase(tonight: FrightTonight | null | undefined, now: number): FrightPhase {
  if (!tonight || !tonight.enabled) return 'off';
  return tonight.night ? computePhase(tonight.night, now) : tonight.phase;
}

/** Every phase edge of the night, ascending. */
export function phaseEdges(night: FrightNightWindow | null | undefined): number[] {
  if (!night) return [];
  return [night.teaser_from, night.early_opens_at, night.opens_at, night.last_call_at, night.closes_at, night.after_until]
    .map(at).filter((ms): ms is number => ms != null).sort((a, b) => a - b);
}

/** The next edge strictly after now (re-evaluate and re-fetch there), or null. */
export function nextPhaseEdge(night: FrightNightWindow | null | undefined, now: number): number | null {
  return phaseEdges(night).find(ms => ms > now) ?? null;
}

/** R10: the countdown target before the gates open (teaser window and early), else null. */
export function countdownTarget(night: FrightNightWindow | null | undefined, now: number): number | null {
  if (!night) return null;
  const opens = at(night.opens_at);
  const teaser = at(night.teaser_from) ?? at(night.early_opens_at) ?? opens;
  if (opens == null || teaser == null) return null;
  return now >= teaser && now < opens ? opens : null;
}

export interface ActivationInput {
  readonly locationParkId: number | null | undefined;
  readonly tonight: FrightTonight | null | undefined;
  readonly now: number;
}

/** R6: the map takeover, haunt sheet and pace chip are on. */
export function isModeOn({ locationParkId, tonight, now }: ActivationInput): boolean {
  if (!tonight?.enabled || !tonight.event || locationParkId == null) return false;
  if (tonight.event.park_id !== locationParkId) return false;
  return ON_PHASES.includes(effectivePhase(tonight, now));
}

export function isOnPhase(phase: FrightPhase): boolean {
  return ON_PHASES.includes(phase);
}

/** Fog strength for the map layer: 40% in early (R7), full while live, fading over 10 min after close (R8). */
export function fogLevel(phase: FrightPhase, night: FrightNightWindow | null | undefined, now: number): number {
  if (phase === 'early') return 0.4;
  if (phase === 'live' || phase === 'last_call') return 1;
  if (phase === 'after' && night) {
    const closes = at(night.closes_at);
    if (closes == null) return 0;
    return Math.max(0, 1 - (now - closes) / (10 * 60_000));
  }
  return 0;
}

export interface PollInput {
  readonly modeOn: boolean;
  readonly focused: boolean;
  readonly foreground: boolean;
  /** The player is in a park that has a Fin-ister event (any phase). */
  readonly eventPark: boolean;
  readonly pollSeconds?: number | null;
}

/**
 * Poll interval: every poll_seconds (default 120) only while the mode is ON,
 * the map is focused and the app is open; every 20 min while in an event park
 * otherwise (foreground only); never elsewhere or in the background.
 */
export function frightPollMs({ modeOn, focused, foreground, eventPark, pollSeconds }: PollInput,
  offPollMs = 20 * 60_000): number | null {
  if (!foreground) return null;
  if (modeOn && focused) return Math.max(30, pollSeconds && pollSeconds > 0 ? pollSeconds : 120) * 1000;
  return eventPark ? offPollMs : null;
}
