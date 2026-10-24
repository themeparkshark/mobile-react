/**
 * Whether a game dive's water is on screen, as a tiny store with no heavy imports, so top layers
 * (the offline chip) can step aside while the water owns the screen and come back once it is gone.
 */
import { useEffect, useState } from 'react';

let active = false;
let endedAt = 0;
const subscribers = new Set<(on: boolean) => void>();

export function setDiveActive(on: boolean): void {
  if (active === on) return;
  active = on;
  if (!on) endedAt = Date.now();
  subscribers.forEach(s => s(on));
}

/** When the last dive's water went away (ms since epoch, 0 if none yet). */
export function lastDiveEndedAt(): number {
  return endedAt;
}

/** The game screen's first beat after a dive belongs to the game: top layers stay quiet this long (ms). */
export const AFTER_DIVE_QUIET_MS = 1800;

/** Whether a dive is on screen or ended under AFTER_DIVE_QUIET_MS ago. Pure given `now` (unit tested). */
export function diveQuiet(now: number): boolean {
  return active || (endedAt > 0 && now - endedAt < AFTER_DIVE_QUIET_MS);
}

export function isDiveActive(): boolean {
  return active;
}

export function useDiveActive(): boolean {
  const [on, setOn] = useState(active);
  useEffect(() => {
    subscribers.add(setOn);
    setOn(active);
    return () => { subscribers.delete(setOn); };
  }, []);
  return on;
}
