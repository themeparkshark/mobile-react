/**
 * A reward claim whose answer was lost (fix round w3, T093 T094).
 *
 * The app gives a request 12 s (api/client.ts), while a busy server can take up to its 30 s PHP limit to
 * pay a chest or a stamp. When the app stops waiting first, the server usually still pays a few seconds
 * later. Reading back once, at once, sees the claim before it commits and calls it a failure: the player was
 * told "could not open" while the prize had landed, and the row vanished with no retry.
 *
 * So a claim that got no answer is read back over the rest of the server's window (about 16 s more, which
 * covers 12 s + 16 s > 30 s), and only then called a failure. A claim the server did answer (an HTTP
 * status, for example "already claimed") is read back once, right away: the server has finished.
 */
import { httpStatus } from '../../api/getRetry';

/** Waits before each read-back of a lost claim. 0 means read now. Sum about 16 s. */
export const LOST_CLAIM_WAITS_MS: readonly number[] = [0, 1500, 2500, 4000, 8000];

/** True when a server really answered the claim (any HTTP status), false for a timeout or a dropped call. */
export function serverAnswered(error: unknown): boolean {
  return httpStatus(error as { response?: { status?: number } } | undefined) !== undefined;
}

export interface ReconcileOptions {
  /** Waits between read-backs (defaults to LOST_CLAIM_WAITS_MS; a server answer reads once). */
  readonly waits?: readonly number[];
  /** Stop early when the screen went away. */
  readonly alive?: () => boolean;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Read back a claim that failed. `readBack` returns the paid result when the server shows it paid, else null
 * (a read that throws counts as null and the next wait runs). Returns the paid result or null.
 */
export async function reconcileClaim<T>(error: unknown, readBack: () => Promise<T | null>, o: ReconcileOptions = {}): Promise<T | null> {
  const waits = serverAnswered(error) ? [0] : (o.waits ?? LOST_CLAIM_WAITS_MS);
  const sleep = o.sleep ?? defaultSleep;
  for (const wait of waits) {
    if (o.alive && !o.alive()) return null;
    if (wait > 0) await sleep(wait);
    if (o.alive && !o.alive()) return null;
    try {
      const paid = await readBack();
      if (paid != null) return paid;
    } catch { /* the next wait reads again */ }
  }
  return null;
}

/**
 * Claim, and when the answer is lost, find out from the server what really happened.
 * `lost` is true when the result came from a read-back (the claim's own answer never arrived).
 */
export async function claimOrReconcile<T>(claim: () => Promise<T>, readBack: () => Promise<T | null>, o: ReconcileOptions = {}):
  Promise<{ readonly paid: T; readonly lost: boolean; readonly answered: boolean } | { readonly paid: null; readonly lost: false; readonly answered: boolean; readonly error: unknown }> {
  try {
    return { paid: await claim(), lost: false, answered: true };
  } catch (error) {
    const answered = serverAnswered(error);
    const paid = await reconcileClaim(error, readBack, o);
    if (paid != null) return { paid, lost: true, answered };
    return { paid: null, lost: false, answered, error };
  }
}
