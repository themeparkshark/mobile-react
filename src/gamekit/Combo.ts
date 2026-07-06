/**
 * Combo.ts — combo / multiplier state machine.
 *
 * Pure, framework-free logic (no React, no worklets) so it can be unit-tested
 * and driven from either the JS thread or a game's own tick. A React hook
 * wrapper (useCombo) is provided for convenience.
 *
 * Rules (from master plan):
 *   - Streak grows on each hit inside the combo window; a miss or a window
 *     timeout resets it.
 *   - Multiplier tiers: x2 at 3, x3 at 6, x5 at 10.
 *   - Fever mode triggers at a 10-streak and lasts feverMs.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

export interface ComboConfig {
  /** Time allowed between hits before the streak decays (ms). */
  windowMs: number;
  /** How long fever mode lasts once triggered (ms). */
  feverMs: number;
}

export const DEFAULT_COMBO_CONFIG: ComboConfig = {
  windowMs: 1600,
  feverMs: 5000,
};

/** Streak thresholds → multiplier. Ordered ascending; highest match wins. */
const TIERS: ReadonlyArray<{ streak: number; multiplier: number }> = [
  { streak: 0, multiplier: 1 },
  { streak: 3, multiplier: 2 },
  { streak: 6, multiplier: 3 },
  { streak: 10, multiplier: 5 },
];

export const FEVER_STREAK = 10;

export interface ComboState {
  streak: number;
  maxStreak: number;
  multiplier: number;
  fever: boolean;
  /** Timestamp (ms) of the last registered hit. */
  lastHitAt: number;
  /** Timestamp (ms) when fever mode ends, or 0 if not in fever. */
  feverUntil: number;
}

export function createComboState(): ComboState {
  return {
    streak: 0,
    maxStreak: 0,
    multiplier: 1,
    fever: false,
    lastHitAt: 0,
    feverUntil: 0,
  };
}

export function multiplierForStreak(streak: number): number {
  let m = 1;
  for (const tier of TIERS) {
    if (streak >= tier.streak) m = tier.multiplier;
  }
  return m;
}

/**
 * Register a hit. Returns a NEW state (immutable) so React consumers get a
 * stable reference change. Applies window-expiry against `now` first.
 */
export function registerHit(
  state: ComboState,
  now: number,
  config: ComboConfig = DEFAULT_COMBO_CONFIG,
): ComboState {
  const expired = state.streak > 0 && now - state.lastHitAt > config.windowMs;
  const base = expired ? 0 : state.streak;
  const streak = base + 1;
  const multiplier = multiplierForStreak(streak);
  const justHitFever = streak >= FEVER_STREAK;
  const fever = justHitFever || (state.fever && now < state.feverUntil);
  return {
    streak,
    maxStreak: Math.max(state.maxStreak, streak),
    multiplier,
    fever,
    lastHitAt: now,
    feverUntil: justHitFever ? now + config.feverMs : state.feverUntil,
  };
}

/** Register a miss — breaks the streak but preserves maxStreak. */
export function registerMiss(state: ComboState): ComboState {
  return {
    ...state,
    streak: 0,
    multiplier: 1,
    fever: false,
    feverUntil: 0,
  };
}

/**
 * Advance time without a hit. Decays the streak if the window lapsed and
 * clears fever when its timer runs out. Returns the same reference when
 * nothing changed so consumers can skip re-renders.
 */
export function tick(
  state: ComboState,
  now: number,
  config: ComboConfig = DEFAULT_COMBO_CONFIG,
): ComboState {
  const windowLapsed = state.streak > 0 && now - state.lastHitAt > config.windowMs;
  const feverLapsed = state.fever && now >= state.feverUntil;
  if (!windowLapsed && !feverLapsed) return state;
  return {
    ...state,
    streak: windowLapsed ? 0 : state.streak,
    multiplier: windowLapsed ? 1 : state.multiplier,
    fever: feverLapsed ? false : state.fever,
    feverUntil: feverLapsed ? 0 : state.feverUntil,
  };
}

// =============================================================================
// React hook wrapper
// =============================================================================

export interface UseComboResult {
  readonly streak: number;
  readonly maxStreak: number;
  readonly multiplier: number;
  readonly fever: boolean;
  /** Call on a successful hit. */
  hit: () => ComboState;
  /** Call on a miss. */
  miss: () => void;
  /** Call periodically (or on frame) to decay stale streaks / clear fever. */
  poll: () => void;
  /** Reset to a fresh combo (e.g. new round). */
  reset: () => void;
}

export function useCombo(config: ComboConfig = DEFAULT_COMBO_CONFIG): UseComboResult {
  const ref = useRef<ComboState>(createComboState());
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const hit = useCallback((): ComboState => {
    ref.current = registerHit(ref.current, Date.now(), config);
    rerender();
    return ref.current;
  }, [config, rerender]);

  const miss = useCallback(() => {
    ref.current = registerMiss(ref.current);
    rerender();
  }, [rerender]);

  const poll = useCallback(() => {
    const next = tick(ref.current, Date.now(), config);
    if (next !== ref.current) {
      ref.current = next;
      rerender();
    }
  }, [config, rerender]);

  const reset = useCallback(() => {
    ref.current = createComboState();
    rerender();
  }, [rerender]);

  return useMemo(
    () => ({
      streak: ref.current.streak,
      maxStreak: ref.current.maxStreak,
      multiplier: ref.current.multiplier,
      fever: ref.current.fever,
      hit,
      miss,
      poll,
      reset,
    }),
    // ref.current fields are read fresh each render; deps are the stable fns.
    [hit, miss, poll, reset, ref.current.streak, ref.current.multiplier, ref.current.fever, ref.current.maxStreak],
  );
}
