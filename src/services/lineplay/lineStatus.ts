/**
 * What the server told this wait that the wait card and the recap must say in kid words (Ride Parts fixes,
 * RIDE_PARTS_BUGS 12, 13, 16, 17, 19, 20, 22). LinePlaySession publishes it; WaitCard and SessionRecap read it.
 * A server without the Nov 20 line fixes sends none of these answers, so every field stays at its calm default
 * and both screens read as before. Pure (no React): the hook is useLineStatus.ts.
 */
export interface LineStatus {
  /** This wait's start id, so a status never leaks into the next wait. */
  readonly waitId: string | null;
  /** RIDE_CLOSED on start: the live feed says the ride is closed, so there is no line and no Parts. */
  readonly rideResting: boolean;
  /** parts_stop "coin_at_top": the coin is at its top look, so the line pays no Parts (its Ticket still pays). */
  readonly coinAtTop: boolean;
  /** The server closed this wait because another line started for this player (one line at a time). */
  readonly movedToAnotherLine: boolean;
  /** The app was closed longer than the server bridges (90 s): say once to keep the app open. */
  readonly closedGap: boolean;
  /** Seconds the server counted for this wait (eligible_seconds), or null before it answered. */
  readonly countedSeconds: number | null;
}

export const CALM_LINE_STATUS: LineStatus = {
  waitId: null, rideResting: false, coinAtTop: false, movedToAnotherLine: false, closedGap: false, countedSeconds: null,
};

/** A dark gap longer than this was not counted (the server's line_max_credit_gap_seconds, 90 s). */
export const CLOSED_GAP_MS = 90_000;
/** How long the "keep the app open" line stays up after the gap. */
export const CLOSED_GAP_NOTICE_MS = 90_000;

export const LINE_WORDS = {
  restingTitle: 'This ride is resting right now.',
  restingBody: 'Its coin waits for you.',
  topTitle: 'This coin is at its top look.',
  topBodyTicket: 'Your wait still earns a Ticket.',
  topBodyGames: 'Play the games while you wait.',
  movedTitle: 'Your wait moved to another ride.',
  movedBody: 'Here is what this wait kept.',
  capTitle: 'That’s all the Parts from this ride today.',
  capBody: 'More tomorrow!',
  waitCapTitle: 'That’s all the Parts from this wait.',
  waitCapBody: 'Your time in line still counts.',
  gapTitle: 'Keep the app open to keep earning',
  gapBody: 'Time with the app closed does not count.',
  winOnWayOut: 'Parts are saved for this coin. Win it on your way out.',
  savedInSlot: 'Its Parts are saved in its slot.',
} as const;

/** Can the guest win this ride's coin on the way out? Only when the ride is open and the wait did not end away. */
export function coinPlayableNow(input: { readonly coinMissing: boolean; readonly status: LineStatus;
  readonly lineRewardsReady?: boolean | null; readonly leftLine?: boolean }): boolean {
  return input.coinMissing && !input.status.rideResting && !input.status.movedToAnotherLine &&
    input.lineRewardsReady !== false && !input.leftLine;
}

/** The sentence about an unwon coin's saved Parts: a promise only when the map will offer PLAY. */
export function savedPartsLine(playable: boolean): string {
  return playable ? LINE_WORDS.winOnWayOut : LINE_WORDS.savedInSlot;
}

/**
 * The wait card's one status (headline and subline) when the server said something new, else null (the card
 * keeps its own words). Order: resting, coin at top, the daily cap, the wait cap, the closed-app gap.
 */
export function lineStatusWords(status: LineStatus, input: {
  readonly atDailyCap: boolean;
  readonly atSessionCap: boolean;
  readonly ticketAvailable: boolean | null;
}): { readonly headline: string; readonly subline: string } | null {
  if (status.rideResting) return { headline: LINE_WORDS.restingTitle, subline: LINE_WORDS.restingBody };
  if (status.coinAtTop) {
    return { headline: LINE_WORDS.topTitle,
      subline: input.ticketAvailable === false ? LINE_WORDS.topBodyGames : LINE_WORDS.topBodyTicket };
  }
  if (input.atDailyCap) return { headline: LINE_WORDS.capTitle, subline: LINE_WORDS.capBody };
  if (input.atSessionCap) return { headline: LINE_WORDS.waitCapTitle, subline: LINE_WORDS.waitCapBody };
  if (status.closedGap) return { headline: LINE_WORDS.gapTitle, subline: LINE_WORDS.gapBody };
  return null;
}

/**
 * Minutes on screen are the minutes counted (bug 20): once the server has timed this wait, the recap shows its
 * eligible seconds, never wall time (which includes the app-closed gap and the walk out).
 */
export function countedWaitSeconds(wallSeconds: number, countedSeconds: number | null | undefined): number {
  return countedSeconds != null && Number.isFinite(countedSeconds) && countedSeconds >= 0
    ? Math.floor(countedSeconds) : wallSeconds;
}

let current: LineStatus = CALM_LINE_STATUS;
const listeners = new Set<() => void>();

const same = (a: LineStatus, b: LineStatus) => a.waitId === b.waitId && a.rideResting === b.rideResting &&
  a.coinAtTop === b.coinAtTop && a.movedToAnotherLine === b.movedToAnotherLine && a.closedGap === b.closedGap &&
  a.countedSeconds === b.countedSeconds;

/** LinePlaySession publishes on every change; equal values are ignored so readers never re-render for nothing. */
export function publishLineStatus(next: LineStatus): void {
  if (same(current, next)) return;
  current = next;
  listeners.forEach(listener => { try { listener(); } catch { /* a reader's error never breaks the wait */ } });
}

export function readLineStatus(): LineStatus {
  return current;
}

/** Readers (useLineStatus) subscribe here; returns the unsubscribe. */
export function subscribeLineStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
