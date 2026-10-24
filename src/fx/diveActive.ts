/**
 * Whether a game dive's water is on screen, as a tiny store with no heavy imports, so top layers
 * (the offline chip) can step aside while the water owns the screen and come back once it is gone.
 */
import { useEffect, useState } from 'react';

let active = false;
const subscribers = new Set<(on: boolean) => void>();

export function setDiveActive(on: boolean): void {
  if (active === on) return;
  active = on;
  subscribers.forEach(s => s(on));
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
