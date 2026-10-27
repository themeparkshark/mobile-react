/**
 * The HUD counters' landing signal. Something flying into a counter (a coin from a catch, a ticket)
 * calls holdHud() as it sets off and pulseHud() on the frame it lands, so the chip bumps and its
 * number rolls exactly when the coin arrives (Monopoly GO: the counter waits for the coins). A balance
 * that goes up with nothing flying in rolls at once. No React, no timers per frame: a tiny listener set.
 */
import { makeMutable } from 'react-native-reanimated';

export interface HudStream {
  /** Matches hudStreamId while this stream is the live one. */
  readonly id: number;
  readonly gain: number;
  /** Clock times (ms, on hudClock) when each coin lands; the roll starts on the first. */
  readonly lands: readonly number[];
}

type Listener = (event: { readonly kind: 'hold'; readonly untilMs: number } | { readonly kind: 'land'; readonly gain: number | null }
  | { readonly kind: 'punch'; readonly last: boolean } | { readonly kind: 'stream'; readonly stream: HudStream }) => void;

/**
 * Round 3: the catch's UI-thread clock, shared with the counter. The catch drives hudClock with one
 * withTiming; the chip's digits, punches, glow and "+N" are worklets of the same clock, so the number
 * starts rolling on the exact frame the first coin touches the chip, however busy the JS thread is.
 */
export const hudClock = makeMutable(0);
export const hudStreamId = makeMutable(0);
let streamSeq = 0;
/** A new stream id (the old stream's columns rest at their final digits from this frame). */
export function nextHudStreamId(): number {
  streamSeq += 1;
  return streamSeq;
}

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

/**
 * One more coin of a stream landed (after the first, which called pulseHud): the icon punches a little,
 * and the last coin of the stream punches full size. The number is already rolling.
 */
export function punchHud(target: string, last: boolean): void {
  listeners.get(target)?.forEach(l => l({ kind: 'punch', last }));
}

/** Coins are on their way on the shared clock: the chip plans its roll, punches and "+N" from it. */
export function streamHud(target: string, stream: HudStream): boolean {
  const set = listeners.get(target);
  if (!set || set.size === 0) return false;
  set.forEach(l => l({ kind: 'stream', stream }));
  return true;
}
