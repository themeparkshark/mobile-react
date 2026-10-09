/**
 * Is the player idle? No touch anywhere in the app and no walking for a while.
 *
 * The map polls the gym, swords, ride control and the raid (most of all API
 * traffic). A phone lying on a café table with the map open does not need
 * them every 20 to 30 seconds, so idle maps poll less often (idlePollInterval)
 * and the first touch or step refreshes anything that came due at the normal
 * rate. Root reports touches; screens report movement.
 */
import { useEffect, useState } from 'react';

import { IDLE_AFTER_MS } from '../power/powerPolicy';

/** One idle constant app-wide (power budget and idle-aware polls agree). */
export const USER_IDLE_MS = IDLE_AFTER_MS;

let lastActivityAt = Date.now();
const wakeListeners = new Set<() => void>();

/** Record a touch or a step. Cheap: listeners are only told when someone is idle. */
export function markUserActivity(now = Date.now()): void {
  lastActivityAt = now;
  if (wakeListeners.size) wakeListeners.forEach(fn => fn());
  if (activityListeners.size) activityListeners.forEach(fn => fn());
}

/** Hear every touch or step (cheap: one Set). Returns the unsubscribe. */
const activityListeners = new Set<() => void>();
export function onUserActivity(listener: () => void): () => void {
  activityListeners.add(listener);
  return () => { activityListeners.delete(listener); };
}

export function lastUserActivityAt(): number {
  return lastActivityAt;
}

/** The poll interval to use: `factor` times slower while idle. */
export function idlePollInterval(baseMs: number, idle: boolean, factor = 3): number {
  return idle ? baseMs * factor : baseMs;
}

export default function useUserIdle(idleMs = USER_IDLE_MS): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (idle) {
      const wake = () => setIdle(false);
      wakeListeners.add(wake);
      if (Date.now() - lastActivityAt < idleMs) wake();
      return () => { wakeListeners.delete(wake); };
    }
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const quietFor = Date.now() - lastActivityAt;
      if (quietFor >= idleMs) setIdle(true);
      else timer = setTimeout(check, idleMs - quietFor);
    };
    timer = setTimeout(check, Math.max(0, idleMs - (Date.now() - lastActivityAt)));
    return () => clearTimeout(timer);
  }, [idle, idleMs]);
  return idle;
}
