/**
 * Shared Golden display logic (design rev 7, 7.1.3), pure so it is testable.
 *
 * One beat after a Shared Golden's window closes, every phone stamps SNATCHED
 * on the seat closest to the downbeat mark that it knows about: its own local
 * offset, rivals' SNATCH/progress whispers, and the house crew's
 * deterministic offsets from the shared seed. It runs the sim's own
 * settleShared over those, so the provisional call uses the exact rule the
 * server applies to the replayed logs (smallest |tap - mark|, ties within
 * 17 ms share). When the server's settle disagrees, the results show an
 * "updated" chip.
 */
import { grid, RISE_EIGHTHS, settleShared, SHARED_EIGHTHS, upFor, type Spawn } from '../../games/party/bonkRace';

/** Board-ms at which Shared Golden n (1-5) is stamped: window close (rise + up) + one beat. */
export function stampAt(sg: number): number {
  const k = SHARED_EIGHTHS[sg - 1];
  return grid(k - RISE_EIGHTHS) + upFor(k) + grid(2);
}

export interface SeatReactions {
  /** seat key: 'me', `u:<id>`, `b:<name>` */
  key: string;
  /** |tap - mark| per Shared Golden known so far (-1 = not hit / unknown) */
  sg: number[] | null;
}

/** The seats that (provisionally) snatched Shared Golden n, by key. Empty = nobody hit it. */
export function provisionalSnatch(sg: number, seats: SeatReactions[]): string[] {
  const s = settleShared(seats.map((x) => x.sg));
  return s.golds[sg - 1].winners.map((i) => seats[i].key);
}

/** Provisional +200s per seat key from every Shared Golden already stamped by `boardMs`. */
export function provisionalBonus(boardMs: number, seats: SeatReactions[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let n = 1; n <= SHARED_EIGHTHS.length; n++) {
    if (boardMs < stampAt(n)) break;
    for (const key of provisionalSnatch(n, seats)) out[key] = (out[key] ?? 0) + 200;
  }
  return out;
}

/** The Shared Golden spawn whose telegraph or window covers `boardMs`, if any. */
export function sharedNow(spawns: Spawn[], boardMs: number): Spawn | null {
  for (const s of spawns) if (s.sg > 0 && boardMs >= s.tell && boardMs < s.at + s.up) return s;
  return null;
}

/** "updated" chip: did the server's settle crown different seats than this phone stamped? */
export function settleDisagrees(stamped: Record<number, string[]>, server: Record<number, string[]>): boolean {
  for (const [sg, keys] of Object.entries(stamped)) {
    const a = [...keys].sort().join(',');
    const b = [...(server[Number(sg)] ?? [])].sort().join(',');
    if (a !== b) return true;
  }
  return false;
}
