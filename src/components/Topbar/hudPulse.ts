/**
 * The HUD counters' landing signal. Something flying into a counter (a coin from a catch, a ticket)
 * calls holdHud() as it sets off and pulseHud() on the frame it lands, so the chip bumps and its
 * number rolls exactly when the coin arrives (Monopoly GO: the counter waits for the coins). A balance
 * that goes up with nothing flying in rolls at once. No React, no timers per frame: a tiny listener set.
 */
type Listener = (event: { readonly kind: 'hold'; readonly untilMs: number } | { readonly kind: 'land'; readonly gain: number | null }) => void;

const listeners = new Map<string, Set<Listener>>();

export function onHudPulse(target: string, listener: Listener): () => void {
  let set = listeners.get(target);
  if (!set) { set = new Set(); listeners.set(target, set); }
  set.add(listener);
  return () => { set?.delete(listener); };
}

/** A flight to `target` has started: hold its next increase until it lands (at most `ms`). */
export function holdHud(target: string, ms: number): void {
  const untilMs = Date.now() + Math.max(0, Math.min(3000, ms));
  listeners.get(target)?.forEach(l => l({ kind: 'hold', untilMs }));
}

/** The flight landed: bump the chip and roll to the new balance (`gain` shows as "+N" when known). */
export function pulseHud(target: string, gain: number | null = null): void {
  listeners.get(target)?.forEach(l => l({ kind: 'land', gain }));
}
