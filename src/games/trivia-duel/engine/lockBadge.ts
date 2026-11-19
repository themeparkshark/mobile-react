/**
 * The chip on a player's portrait once they answer (hold-fix 3, kid safety). It says what happened in a word,
 * never how many seconds it took: "5.7s" on Gill's badge read as a clock to a kid. Speed still counts in the
 * points; the screen just never shows a time.
 */
export const LOCK_BADGE = {
  /** Answered (a tile, a slider guess or a steal). */
  locked: 'LOCKED',
  /** Rang the bell first. */
  bell: 'BELL',
  /** No answer before the round ended. */
  none: 'NO ANSWER',
} as const;

export type LockBadgeKind = keyof typeof LOCK_BADGE;

export function lockBadge(kind: LockBadgeKind): string {
  return LOCK_BADGE[kind];
}
