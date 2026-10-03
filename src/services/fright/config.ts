/**
 * Fin-ister Nights client constants. The ONE place the mode name lives in the
 * app: every surface reads `frightModeName(event)`, which prefers the server's
 * `event.title` and falls back to this constant (older server, offline card).
 * Pure, no imports: unit tested in tools/tests/fright-*.test.cjs.
 */

export const FRIGHT_MODE_NAME = 'Fin-ister Nights';
/** Tight spaces (pill kicker). */
export const FRIGHT_SHORT_NAME = 'Fin-ister';

export function frightModeName(event?: { readonly title?: string | null } | null): string {
  const title = event?.title?.trim();
  return title ? title : FRIGHT_MODE_NAME;
}

export const FRIGHT_DEFAULTS = {
  /** Poll while the mode is ON, the map is focused and the app is open (DESIGN 7). */
  pollSeconds: 120,
  /** Poll while in an event park but the mode is OFF (countdown, phase edges). */
  offPollMs: 20 * 60_000,
  /** H1: entry needs a fix at least this good. */
  enterAccuracyM: 50,
  /** H1: the server adds min(accuracy, 25) to the radius. */
  enterAccuracySlackM: 25,
  /** H1: default haunt entry radius. */
  hauntRadiusM: 60,
  /** A fix older than this is not "fresh" for an entry. */
  fixFreshMs: 30_000,
  /** H1: the server accepts an entry `at` no older than 20 minutes (offline queue). */
  enterMaxAgeMs: 20 * 60_000,
  /** H3: walk_minutes + this = minimum dwell. */
  minDwellExtraMinutes: 2,
  /** H3: dwell cap; an open run older than this is dropped. */
  runMaxMs: 4 * 60 * 60_000,
  /** H6a: a fix farther than this from the entrance after min dwell finishes the run. */
  exitFarM: 90,
  /** F1: two fixes at least this far apart inside the reef. */
  reefGapMs: 45_000,
  reefRadiusM: 70,
  /** F3: encounter catch distance. */
  encounterRadiusM: 40,
  /** F4a: a park exit after this park-local hour offers the Marquee. */
  recapExitHour: 21,
  /** F4c: next app open within this long after close offers the Marquee. */
  recapWindowMs: 36 * 60 * 60_000,
  /** Tamper guard: wall vs monotonic drift that forces a refetch. */
  clockJumpMs: 2 * 60_000,
  /** Coach marks: never two closer than this. */
  coachGapMs: 20_000,
} as const;
