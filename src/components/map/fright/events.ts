/**
 * "Subtle, never noisy" (MAP_FX_SPEC): at most 2 events on screen at once
 * (a critter jump, a lightning strike, a door creak, a ghost pass...). A third
 * one due is put off by 2 to 5 s. Pure apart from the shared app-wide gate.
 */
import { randAt } from './random';

export const MAX_EVENTS = 2;

export interface EventGate {
  /** Start an event now if a slot is free. */
  tryStart(id: string, now: number, durationMs: number): boolean;
  active(now: number): number;
}

export function createEventGate(max = MAX_EVENTS): EventGate {
  let running: { id: string; until: number }[] = [];
  const prune = (now: number) => { running = running.filter(e => e.until > now); };
  return {
    tryStart(id, now, durationMs) {
      prune(now);
      if (running.length >= max || running.some(e => e.id === id)) return false;
      running.push({ id, until: now + Math.max(0, durationMs) });
      return true;
    },
    active(now) {
      prune(now);
      return running.length;
    },
  };
}

/** The one gate the fright map shares (map anchored and screen space). */
export const frightEvents = createEventGate();

export interface AmbientSource {
  readonly id: string;
  /** Gap between runs, ms (uniform in [min, max]). */
  readonly minGapMs: number;
  readonly maxGapMs: number;
  /** How long one run is on screen, ms. */
  readonly durationMs: number;
}

/**
 * Advance every ambient source to `now`. Due sources start when the gate has a
 * slot; otherwise they wait 2 to 5 s. `next` maps id to its next due time;
 * new sources get a first due time spread over their gap.
 */
export function stepAmbient(next: Readonly<Record<string, number>>, sources: readonly AmbientSource[], now: number,
  gate: EventGate, seed: number, n: number): { next: Record<string, number>; started: string[]; n: number } {
  const out: Record<string, number> = {};
  const started: string[] = [];
  let k = n;
  for (const src of sources) {
    const due = next[src.id];
    if (due === undefined) {
      out[src.id] = now + randAt(seed, k++) * src.maxGapMs;
      continue;
    }
    if (due > now) { out[src.id] = due; continue; }
    if (gate.tryStart(src.id, now, src.durationMs)) {
      started.push(src.id);
      out[src.id] = now + src.durationMs + src.minGapMs + randAt(seed, k++) * (src.maxGapMs - src.minGapMs);
    } else {
      out[src.id] = now + 2000 + randAt(seed, k++) * 3000;
    }
  }
  return { next: out, started, n: k };
}
