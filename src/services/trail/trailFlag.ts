/**
 * The trail_boxes server flag, cached and refreshed every 10 minutes. A failed
 * check (no signal in a queue) never turns the feature off: it keeps the last
 * answer, so walking keeps being recorded. Only a real answer from the server
 * changes it. Pure and injectable for tests (tools/tests/trail-model.test.cjs).
 */
export const FLAG_TTL_MS = 10 * 60_000;

export function createTrailFlag(read: () => Promise<boolean>, now: () => number = Date.now) {
  let cache: boolean | null = null;
  let at = 0;
  /** true / false from the server, or null when there is no answer yet (caller keeps its state). */
  return async function trailFlag(): Promise<boolean | null> {
    if (cache !== null && now() - at < FLAG_TTL_MS) return cache;
    try {
      cache = await read();
      at = now();
    } catch {
      // No answer: no change.
    }
    return cache;
  };
}
