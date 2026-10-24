import { HUD_BOTTOM } from '../../components/map/statusStack';
/**
 * One overlay at a time on the map (WS2). Priority: boss > selected ride >
 * adventure > project, and the daily chest always last: never alongside a find,
 * never before the player's first catch.
 */
export interface MapOverlayState {
  readonly tutorialActive: boolean;
  /** A home find is open or waiting for the tutorial to finish. */
  readonly findOpen: boolean;
  readonly findPending: boolean;
  readonly firstCatchDone: boolean;
  /** Boss raid sheet open, boss presentation on screen, or a boss map moment playing. */
  readonly boss: boolean;
  /** A ride challenge or the Play Ride flow is open. */
  readonly rideOpen: boolean;
  readonly adventureOpen: boolean;
  readonly otherModalOpen: boolean;
}

export function chestMayPresent(state: MapOverlayState): boolean {
  return state.firstCatchDone && !state.tutorialActive && !state.findOpen && !state.findPending &&
    !state.boss && !state.rideOpen && !state.adventureOpen && !state.otherModalOpen;
}

/**
 * Where the suggestion slots sit. The map starts under his header (70 + status bar,
 * minus the map's 8pt tuck) and carries exactly one HUD row at its top (Ride
 * Control, Live Events, the night show and Fin-ister share it as a stack). Every
 * slot, including the Park Project pill that renders outside the map, lines up on
 * the row under it so nothing overlaps, whatever the HUD is showing.
 */
export const MAP_TOP_INSET = 62;
export function suggestionSlotTop(): number {
  return HUD_BOTTOM;
}
/** Screen-space top for a slot drawn outside the map container. */
export function suggestionSlotScreenTop(statusBarHeight: number): number {
  return statusBarHeight + MAP_TOP_INSET + suggestionSlotTop();
}

export type MapSuggestion = 'boss' | 'ride' | 'dwell' | 'adventure' | 'goal' | 'project' | null;

/**
 * Which suggestion chips may show, and which one leads. Only the lead renders at
 * full size; every other suggestion folds into a 56pt stub in its slot, so the
 * map top never stacks two full chips. The left slot holds dwell, adventure or
 * goal; the right slot ride or project.
 */
export function mapSuggestionSlots(state: {
  readonly bossMoment: boolean;
  readonly queueRide: boolean;
  /** Standing in a line (90 s dwell) at a ride that is not already the adventure or selected ride. */
  readonly dwell?: boolean;
  readonly adventure: boolean;
  /** A new stamp is waiting to slam onto the ticket: the adventure leads until it lands. */
  readonly adventureSlam?: boolean;
  readonly goal: boolean;
  readonly project: boolean;
}): {
  left: 'dwell' | 'adventure' | 'goal' | null; right: 'ride' | 'project' | null; lead: MapSuggestion;
  /** True when that slot shows only its 56pt stub. */
  leftStub: boolean; rightStub: boolean;
} {
  // A boss map moment owns the screen until it settles.
  if (state.bossMoment) return { left: null, right: null, lead: 'boss', leftStub: false, rightStub: false };
  // Waiting in a line is the most contextual suggestion: it takes the left slot.
  const left = state.dwell ? 'dwell' : state.adventure ? 'adventure' : state.goal ? 'goal' : null;
  const right = state.queueRide ? 'ride' : state.project ? 'project' : null;
  const lead: MapSuggestion = left === 'adventure' && state.adventureSlam ? 'adventure'
    : state.queueRide ? 'ride' : left ?? (state.project ? 'project' : null);
  return { left, right, lead, leftStub: left != null && lead !== left, rightStub: right != null && lead !== right };
}

/** A player who has caught anything before, or catches now, has had their first catch. */
export function hasFirstCatch(player: { completed_tasks_count?: number; ride_coins_collected?: number; park_coins_count?: number } | null | undefined,
  completedHomeFirstFind: boolean, caughtThisSession: boolean): boolean {
  return completedHomeFirstFind || caughtThisSession || (player?.completed_tasks_count ?? 0) > 0 ||
    (player?.ride_coins_collected ?? 0) > 0 || (player?.park_coins_count ?? 0) > 0;
}

/**
 * The first-time home intro (three quick cards, once per player) waits its
 * turn: after Finn's onboarding, never over a find, a dialog or the daily
 * chest. A player who caught a find this visit is already hunting (Finn just
 * said "Walk around to find more!"), so the cards wait for a later visit
 * instead of putting three pages of reading between the kid and the next find.
 */
export function homeIntroMayPresent(state: {
  readonly homeConfirmed: boolean;
  readonly onboardingDone: boolean;
  readonly tutorialActive: boolean;
  readonly findOpen: boolean;
  readonly findPending: boolean;
  readonly otherModalOpen: boolean;
  readonly chestShowing: boolean;
  readonly caughtThisSession: boolean;
  readonly firstFindLineDone: boolean;
}): boolean {
  if (!state.homeConfirmed || !state.onboardingDone || state.tutorialActive) return false;
  if (state.findOpen || state.findPending || state.otherModalOpen || state.chestShowing) return false;
  // firstFindLineDone is kept in the shape for callers; a catch this visit holds the cards either way.
  return !state.caughtThisSession;
}

/** How long a brand new player hunts freely before the daily chest may pop up by itself. */
export const FIRST_VISIT_CHEST_WAIT_MS = 30_000;

/**
 * A brand new player's first visit: "Let's hunt!" leads to hunting, never to a
 * chest calendar. The chest waits until the second catch, or about 30 s of
 * free hunting after Finn's last line, or the next visit. The map's chest
 * button still opens it any time (chestShouldShow's requested path).
 */
export function firstVisitChestWaits(state: {
  /** This visit started with no catch ever (a brand new player). */
  readonly firstVisit: boolean;
  readonly catchesThisVisit: number;
  /** When Finn's "Let's hunt!" line closed (ms), or null while it is still up. */
  readonly huntStartedAt: number | null;
  readonly now: number;
}): boolean {
  if (!state.firstVisit || state.catchesThisVisit >= 2) return false;
  if (state.huntStartedAt == null) return true;
  return state.now - state.huntStartedAt < FIRST_VISIT_CHEST_WAIT_MS;
}
