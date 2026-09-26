/**
 * useWhackEngine.ts — Whack-a-Shark spawn + hit logic.
 *
 * This is a JS-thread CONTROL loop (a spawn scheduler), NOT a rendering loop.
 * All actual animation (hole squash/stretch, pop overshoot, particles) runs on
 * the UI thread in the component via Reanimated + Skia, so the 60fps / "no
 * JS-thread animation loop" quality bar is honored. The engine only decides
 * WHAT is in each hole and WHEN — cheap, low-frequency work.
 *
 * Determinism: spawns are driven by a seeded PRNG so a {seed} replay reproduces
 * the same target sequence (server-authoritative-replay friendly).
 *
 * Responsibilities:
 *   - Ease the spawn interval across the round (pace curve), halved in fever.
 *   - Pick a free hole + a weighted target kind, respecting MAX_ACTIVE.
 *   - Auto-retire a target after its up-time (a missed shark).
 *   - Resolve a whack: shark → score+combo, golden → x5+fever, decoy → penalty.
 *
 * The engine never renders and never touches AsyncStorage — the component owns
 * score/best/results so the shell contract stays in one place.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FEVER_STREAK } from '../../gamekit';
import {
  HOLE_COUNT,
  MAX_ACTIVE,
  PACE,
  SPAWN_WEIGHTS,
  UP_TIME_MS,
  type Difficulty,
  type TargetKind,
} from './constants';

/** One hole's live occupant, or null when empty. */
export interface Occupant {
  /** Monotonic id so React keys + animations don't reuse across spawns. */
  id: number;
  kind: TargetKind;
  /** Wall-clock ms when it popped up (for the up-time timeout). */
  spawnedAt: number;
  /** Wall-clock ms when it should auto-duck if not whacked. */
  expiresAt: number;
  /** True once whacked — freezes it for the "dazed" frame before cleanup. */
  hit: boolean;
}

/** What a resolved whack did — the component turns this into score + juice. */
export interface WhackOutcome {
  kind: TargetKind;
  /** Signed score delta BEFORE the combo multiplier (component applies it). */
  baseDelta: number;
  /** Golden's own multiplier (x5), else 1. Combined with combo by the caller. */
  selfMultiplier: number;
  /** True → this hit advances the combo; false (decoy) → breaks it. */
  advancesCombo: boolean;
  /** True → triggers fever mode (golden). */
  triggersFever: boolean;
}

export interface WhackEngineOptions {
  difficulty: Difficulty;
  roundSeconds: number;
  /** Live fever flag from the combo machine — doubles the spawn rate. */
  fever: boolean;
  /** Fired when a target is successfully whacked. */
  onWhack: (index: number, outcome: WhackOutcome) => void;
  /** Fired when a shark ducks away unwhacked (a miss — breaks the combo). */
  onMiss: (index: number) => void;
}

export interface WhackEngine {
  /** Current occupants, indexed by hole (0..8). null = empty. */
  readonly holes: ReadonlyArray<Occupant | null>;
  /** Begin a round with a seed. Resets holes and the pace clock. */
  start: (seed: number) => void;
  /** Freeze spawns + timeouts (pause). */
  pause: () => void;
  /** Resume spawns + timeouts. */
  resume: () => void;
  /** Stop everything (round over). */
  stop: () => void;
  /**
   * Attempt to whack hole `index`. Returns the outcome if a live target was
   * there, else null (an empty tap — no penalty, no combo change).
   */
  whack: (index: number) => WhackOutcome | null;
}

// --- Tiny seeded PRNG (mulberry32) — deterministic, worklet-free ------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smoothstep easing for the pace curve (0→1). */
function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function pickKind(rng: () => number, w: { shark: number; decoy: number; golden: number }): TargetKind {
  const total = w.shark + w.decoy + w.golden;
  const roll = rng() * total;
  if (roll < w.shark) return 'shark';
  if (roll < w.shark + w.decoy) return 'decoy';
  return 'golden';
}

export function useWhackEngine(options: WhackEngineOptions): WhackEngine {
  const { difficulty, roundSeconds, fever, onWhack, onMiss } = options;

  const [holes, setHoles] = useState<Array<Occupant | null>>(() =>
    new Array<Occupant | null>(HOLE_COUNT).fill(null),
  );
  // Mirror for synchronous reads inside timers/whack without stale closures.
  const holesRef = useRef<Array<Occupant | null>>(holes);
  holesRef.current = holes;

  const running = useRef(false);
  const startedAt = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const nextId = useRef(1);
  const rng = useRef<() => number>(mulberry32(1));
  const spawnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-hole auto-duck timers so a missed shark retires itself.
  const duckTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // Latest fever flag, read inside the spawn scheduler without re-arming it.
  const feverRef = useRef(fever);
  feverRef.current = fever;

  const setHole = useCallback((index: number, value: Occupant | null) => {
    setHoles((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }, []);

  const clearDuck = useCallback((index: number) => {
    const t = duckTimers.current.get(index);
    if (t) {
      clearTimeout(t);
      duckTimers.current.delete(index);
    }
  }, []);

  // --- Pace: current spawn interval eased across the round, halved in fever.
  const currentIntervalMs = useCallback((): number => {
    const elapsed = (Date.now() - startedAt.current) / 1000;
    const frac = smoothstep(elapsed / roundSeconds);
    const base = PACE.intervalFromMs + (PACE.intervalToMs - PACE.intervalFromMs) * frac;
    return feverRef.current ? base * PACE.feverIntervalScale : base;
  }, [roundSeconds]);

  // --- One spawn attempt, then re-arm for the next. ------------------------
  const scheduleNext = useCallback(() => {
    if (!running.current) return;
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
    spawnTimer.current = setTimeout(() => {
      if (!running.current) return;
      spawnOne();
      scheduleNext();
    }, currentIntervalMs());
  }, [currentIntervalMs]);

  const spawnOne = useCallback(() => {
    const list = holesRef.current;
    const activeCount = list.reduce((n, h) => (h && !h.hit ? n + 1 : n), 0);
    if (activeCount >= MAX_ACTIVE[difficulty]) return;

    // Collect free holes and pick one via the seeded PRNG.
    const free: number[] = [];
    for (let i = 0; i < list.length; i++) if (list[i] === null) free.push(i);
    if (free.length === 0) return;
    const index = free[Math.floor(rng.current() * free.length)];

    const kind = pickKind(rng.current, SPAWN_WEIGHTS[difficulty]);
    const now = Date.now();
    const up = kind === 'shark' ? UP_TIME_MS[difficulty].shark : UP_TIME_MS[difficulty].special;
    const occupant: Occupant = {
      id: nextId.current++,
      kind,
      spawnedAt: now,
      expiresAt: now + up,
      hit: false,
    };
    setHole(index, occupant);

    // Arm the auto-duck. Sharks that duck unwhacked count as a miss; decoys and
    // golden ducking away are neutral (no penalty for NOT tapping a decoy).
    clearDuck(index);
    const t = setTimeout(() => {
      duckTimers.current.delete(index);
      const cur = holesRef.current[index];
      if (!cur || cur.id !== occupant.id || cur.hit) return;
      setHole(index, null);
      if (kind === 'shark') onMiss(index);
    }, up);
    duckTimers.current.set(index, t);
  }, [difficulty, setHole, clearDuck, onMiss]);

  // --- Public: whack a hole. -----------------------------------------------
  const whack = useCallback(
    (index: number): WhackOutcome | null => {
      const cur = holesRef.current[index];
      if (!cur || cur.hit) return null; // empty or already-hit tap → no-op

      clearDuck(index);
      // Freeze it as "hit" so the dazed frame can show, then clean up shortly.
      const hitOccupant: Occupant = { ...cur, hit: true };
      setHole(index, hitOccupant);
      const cleanupId = hitOccupant.id;
      setTimeout(() => {
        const now = holesRef.current[index];
        if (now && now.id === cleanupId) setHole(index, null);
      }, 260);

      let outcome: WhackOutcome;
      switch (cur.kind) {
        case 'golden':
          outcome = {
            kind: 'golden',
            baseDelta: 100,
            selfMultiplier: 5,
            advancesCombo: true,
            triggersFever: true,
          };
          break;
        case 'decoy':
          outcome = {
            kind: 'decoy',
            baseDelta: -150,
            selfMultiplier: 1,
            advancesCombo: false,
            triggersFever: false,
          };
          break;
        case 'shark':
        default:
          outcome = {
            kind: 'shark',
            baseDelta: 100,
            selfMultiplier: 1,
            advancesCombo: true,
            triggersFever: false,
          };
          break;
      }
      onWhack(index, outcome);
      return outcome;
    },
    [setHole, clearDuck, onWhack],
  );

  // --- Lifecycle -----------------------------------------------------------
  const clearAllTimers = useCallback(() => {
    if (spawnTimer.current) {
      clearTimeout(spawnTimer.current);
      spawnTimer.current = null;
    }
    duckTimers.current.forEach((t) => clearTimeout(t));
    duckTimers.current.clear();
  }, []);

  const start = useCallback(
    (seed: number) => {
      clearAllTimers();
      rng.current = mulberry32(seed >>> 0);
      startedAt.current = Date.now();
      pausedAt.current = null;
      nextId.current = 1;
      running.current = true;
      setHoles(new Array<Occupant | null>(HOLE_COUNT).fill(null));
      scheduleNext();
    },
    [clearAllTimers, scheduleNext],
  );

  const pause = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    pausedAt.current = Date.now();
    clearAllTimers();
    // Retire visible targets without counting a miss. They would otherwise
    // remain on screen after their duck timers are cancelled.
    const empty = new Array<Occupant | null>(HOLE_COUNT).fill(null);
    holesRef.current = empty;
    setHoles(empty);
  }, [clearAllTimers]);

  const resume = useCallback(() => {
    if (running.current) return;
    if (pausedAt.current != null) {
      startedAt.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    }
    running.current = true;
    scheduleNext();
  }, [scheduleNext]);

  const stop = useCallback(() => {
    running.current = false;
    pausedAt.current = null;
    clearAllTimers();
  }, [clearAllTimers]);

  // Unmount safety — never leak timers.
  useEffect(() => clearAllTimers, [clearAllTimers]);

  return useMemo<WhackEngine>(
    () => ({ holes, start, pause, resume, stop, whack }),
    [holes, start, pause, resume, stop, whack],
  );
}

// Re-export for any consumer that wants the fever threshold constant.
export { FEVER_STREAK };
