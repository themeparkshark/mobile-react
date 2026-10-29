/**
 * The Rewards sheet's doors to rewards that live in other hosts (core loop,
 * October 2026). A row tap asks; the host that owns that reward (TrailHost,
 * EventSheet) listens and opens itself. No polling, no timers: one listener
 * set per kind.
 */
export type RewardsDoor = 'trail' | 'events';

const listeners: Record<RewardsDoor, Set<() => void>> = { trail: new Set(), events: new Set() };

/** Ask the host to open. True when a host was listening (the tap did something). */
export function openRewardsDoor(door: RewardsDoor): boolean {
  const set = listeners[door];
  set.forEach(fn => { try { fn(); } catch { /* one host never stops the rest */ } });
  return set.size > 0;
}

/** Whether a host for this door is mounted right now (a row with no host gets no button: never a dead tap). */
export function rewardsDoorOpen(door: RewardsDoor): boolean {
  return listeners[door].size > 0;
}

/** A host listens while mounted; returns the unsubscribe. */
export function listenRewardsDoor(door: RewardsDoor, fn: () => void): () => void {
  listeners[door].add(fn);
  return () => { listeners[door].delete(fn); };
}
