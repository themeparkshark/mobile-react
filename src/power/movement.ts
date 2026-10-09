/**
 * When the player last really moved. LocationProvider calls markMoved() each
 * time a fix passes the jitter filter (standing still publishes nothing), so
 * the power budget can tell "in line or on a bench" from "walking".
 */
let lastMoveAt: number | null = null;
const listeners = new Set<() => void>();

export function markMoved(now = Date.now()): void {
  lastMoveAt = now;
  if (listeners.size) listeners.forEach(fn => fn());
}

export function lastMovedAt(): number | null { return lastMoveAt; }

export function onMoved(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test hook. */
export function resetMovement(): void { lastMoveAt = null; }
