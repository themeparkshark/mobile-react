/**
 * "The Stamp Book may be out of date." Set when something that can earn a stamp
 * just happened (a catch that earned stamps, arriving at a new park), so the
 * book skips its 30 s refetch throttle on the next focus and the new stamp
 * slams right away. Pure module state: no React, no storage.
 */
let dirty = false;
let lastParkId: number | null = null;

export function markStampsDirty(): void { dirty = true; }

/** Returns true once after a mark, then clears. */
export function takeStampsDirty(): boolean {
  const was = dirty;
  dirty = false;
  return was;
}

/** Check-ins arrive on every location ping; only a change of park can earn a stamp. */
export function noteCurrentPark(parkId: number | null | undefined): void {
  const id = typeof parkId === 'number' ? parkId : null;
  if (id !== null && id !== lastParkId) dirty = true;
  lastParkId = id;
}
