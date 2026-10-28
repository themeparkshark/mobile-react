/**
 * One loss card per lost ride try (core loop blueprint 5.3, must-fix "one
 * loss card, not two").
 *
 * In a paid ride challenge the game's own end card no longer shows on a loss:
 * the shell hands the finished run here and goes straight on, and the
 * challenge's loss card (the one with TRY AGAIN and the Ticket that came back)
 * says how the try went in one honest line:
 *   Whack-a-Shark  "8 of 13 bonks."
 *   Memory Match   "6 of 8 pairs."
 *   Beat the Buzzer "1 of 3 right. 2 wins the coin."  (right answers lead, never points)
 * "So close" is said only when the try really was close (75% of the goal, or
 * one right answer away). Pure apart from the one-slot store. No em dashes.
 */

/** The ride rule the server checks (be-core-loop TaskGameProofService): 3 questions, 2 right wins. */
export const RIDE_TRIVIA_QUESTIONS = 3;
export const RIDE_TRIVIA_WIN = 2;
/** Whack-a-Shark's ride meter: 13 bonks fill it (waves.ts, "13 BONKS TO WIN"). */
export const RIDE_WHACK_BONKS = 13;
/** "So close" means at least this share of the goal. */
export const NEAR_SHARE = 0.75;

export interface RideTrySummary {
  readonly game: string;
  /** The try reached 75% of its goal (or was one right answer away). */
  readonly near: boolean;
  /** One short line, or null when the game said nothing we can trust. */
  readonly line: string | null;
}

interface RunLike {
  readonly stars?: number;
  readonly score?: number;
  readonly meta?: Record<string, unknown> | null;
}

const int = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;

export function rideTrySummary(run: RunLike | null | undefined): RideTrySummary | null {
  const meta = (run?.meta ?? {}) as Record<string, unknown>;
  const correct = int(meta.correctCount);
  if (correct !== null && (meta.mode === 'task' || meta.game === 'trivia')) {
    const right = Math.min(RIDE_TRIVIA_QUESTIONS, correct);
    return {
      game: 'trivia',
      near: right === RIDE_TRIVIA_WIN - 1,
      line: `${right} of ${RIDE_TRIVIA_QUESTIONS} right. ${RIDE_TRIVIA_WIN} wins the coin.`,
    };
  }
  if (meta.game === 'memory') {
    const pairs = int(meta.pairs);
    const total = int(meta.pairsTotal);
    if (pairs === null || !total) return { game: 'memory', near: false, line: null };
    const got = Math.min(pairs, total);
    return { game: 'memory', near: got / total >= NEAR_SHARE, line: `${got} of ${total} pairs.` };
  }
  if (meta.game === 'tap') {
    const pct = int(meta.ridePercent);
    if (pct === null) return { game: 'tap', near: false, line: null };
    const bonks = Math.min(RIDE_WHACK_BONKS, Math.floor((Math.min(100, pct) * RIDE_WHACK_BONKS) / 100));
    return { game: 'tap', near: pct >= NEAR_SHARE * 100, line: `${bonks} of ${RIDE_WHACK_BONKS} bonks.` };
  }
  return null;
}

let last: { at: number; summary: RideTrySummary | null } | null = null;

/** The shell notes a lost ride try as it skips the game's own card. */
export function noteRideTry(run: RunLike | null | undefined, now: number = Date.now()): void {
  last = { at: now, summary: rideTrySummary(run) };
}

/** The loss card reads the try once (a stale note, over 2 minutes old, is dropped). */
export function takeRideTry(now: number = Date.now(), maxAgeMs = 120_000): RideTrySummary | null {
  const note = last;
  last = null;
  if (!note || now - note.at > maxAgeMs) return null;
  return note.summary;
}

/** Tests only. */
export function resetRideTryForTests(): void {
  last = null;
}
