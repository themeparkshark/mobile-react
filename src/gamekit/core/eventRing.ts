/**
 * eventRing: the UI-thread to JS event bridge.
 *
 * Sims and FX run in worklets. Sound, haptics and the proof log run on JS.
 * Games push small numeric events into a preallocated ring on the UI thread,
 * and once per frame the frame callback drains the ring into a plain number
 * array and hands it to JS with a single runOnJS call.
 *
 * Why a plain array: mutating a typed array in place inside a SharedValue does
 * not propagate across threads (the Banana Basket "event bridge" bug). Draining
 * to a fresh plain array per frame is the fix every design asked for.
 *
 * Layout of a drained batch: [kind, a, b, c, t, kind, a, b, c, t, ...]
 * (EVENT_STRIDE numbers per event). `t` is the sim/fx time the pusher passed.
 *
 * Pure and worklet-safe: node-tested and usable from a server verifier.
 */

export const EVENT_STRIDE = 5;

export interface EventRing {
  cap: number;
  kind: number[];
  a: number[];
  b: number[];
  c: number[];
  t: number[];
  /** Next write index. */
  head: number;
  /** Events waiting. */
  size: number;
  /** Events overwritten because the ring was full (dev overlay stat). */
  dropped: number;
}

export function createEventRing(cap = 256): EventRing {
  'worklet';
  const z = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < cap; i++) out.push(0);
    return out;
  };
  return { cap, kind: z(), a: z(), b: z(), c: z(), t: z(), head: 0, size: 0, dropped: 0 };
}

/**
 * Push an event. When the ring is full the OLDEST event is overwritten (a
 * late sound is worse than a missing one) and `dropped` counts it.
 */
export function pushEvent(r: EventRing, kind: number, a = 0, b = 0, c = 0, t = 0): void {
  'worklet';
  const i = r.head;
  r.kind[i] = kind;
  r.a[i] = a;
  r.b[i] = b;
  r.c[i] = c;
  r.t[i] = t;
  r.head = (i + 1) % r.cap;
  if (r.size < r.cap) r.size++;
  else r.dropped++;
}

/** Drain every waiting event, oldest first, into a new plain array. */
export function drainEvents(r: EventRing): number[] {
  'worklet';
  const out: number[] = [];
  if (r.size === 0) return out;
  let i = (r.head - r.size + r.cap) % r.cap;
  for (let n = 0; n < r.size; n++) {
    out.push(r.kind[i], r.a[i], r.b[i], r.c[i], r.t[i]);
    i = (i + 1) % r.cap;
  }
  r.size = 0;
  return out;
}

export interface GameEvent {
  kind: number;
  a: number;
  b: number;
  c: number;
  t: number;
}

/** JS side: walk a drained batch without allocating objects. */
export function forEachEvent(batch: readonly number[], fn: (kind: number, a: number, b: number, c: number, t: number) => void): void {
  for (let i = 0; i + EVENT_STRIDE <= batch.length; i += EVENT_STRIDE) {
    fn(batch[i], batch[i + 1], batch[i + 2], batch[i + 3], batch[i + 4]);
  }
}

/** Convenience for tests and logs. */
export function eventsOf(batch: readonly number[]): GameEvent[] {
  const out: GameEvent[] = [];
  forEachEvent(batch, (kind, a, b, c, t) => out.push({ kind, a, b, c, t }));
  return out;
}
