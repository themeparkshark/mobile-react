/**
 * modes/mode.ts: which Memory Match mode a call opens (design v8 13, 4.0a).
 *
 *   party            -> race (Line Party round)
 *   explicit mode    -> that mode
 *   difficulty === 0 -> warmup (the legacy contract TutorialProvider uses for
 *                       Finn's free warm-up; never Ride Sprint)
 *   otherwise        -> timeAttack (queue play)
 *
 * The paid Ride Challenge always passes mode="ride" (MiniGameSelector).
 */

export type MemoryMode = 'warmup' | 'ride' | 'timeAttack' | 'daily' | 'race';

export const MEMORY_MODES: MemoryMode[] = ['warmup', 'ride', 'timeAttack', 'daily', 'race'];

export function resolveMemoryMode(p: { party?: unknown; devMode?: string | null; mode?: MemoryMode | null; difficulty?: number | null }): MemoryMode {
  if (p.party) return 'race';
  if (p.devMode && (MEMORY_MODES as string[]).indexOf(p.devMode) >= 0) return p.devMode as MemoryMode;
  if (p.mode) return p.mode;
  if (p.difficulty === 0) return 'warmup';
  return 'timeAttack';
}

/** Persona timing for the Ride Sprint handoff (6.4, 4.1). */
export const RIDE_HANDOFF_MS = 350;
/** Last tap to Coin Catch, unskipped / skipped budgets (acceptance 18). */
export const FINAL_BUDGET_MS = 3900;
export const FINAL_SKIP_MS = 1500;
export const FINAL_SKIP_AFTER_MS = 600;

/** 129 BPM grid. */
export const EIGHTH_MS = 232;
export const SIXTEENTH_MS = 116;

/**
 * Final Pair schedule (ms after the last tap), beat-locked (6.4):
 *   0     riser starts, the music low-passes, the scene pushes 1.06
 *   630   the slowed face swap lands; board clear beat 1
 *   862   beat 2; 1094 beat 3
 *   1330  cash-out coins on 16ths (max 8)
 *   +350  merge into the edition coin; +250 anticipation shake; then Coin Catch
 */
export function finalPairSchedule(cashCoins: number): { swap: number; beat1: number; beat2: number; beat3: number; cash: number; merge: number; shake: number; handoff: number } {
  const swap = 630;
  const beat1 = swap;
  const beat2 = beat1 + EIGHTH_MS;
  const beat3 = beat2 + EIGHTH_MS;
  const cash = beat3 + EIGHTH_MS;
  const merge = cash + Math.min(8, Math.max(0, cashCoins)) * SIXTEENTH_MS;
  const shake = merge + 350;
  const handoff = shake + 250 + RIDE_HANDOFF_MS;
  return { swap, beat1, beat2, beat3, cash, merge, shake, handoff };
}

/** A tap after FINAL_SKIP_AFTER_MS jumps straight to the merge. */
export function finalSkipSchedule(): { merge: number; shake: number; handoff: number } {
  const merge = 0;
  const shake = 350;
  return { merge, shake, handoff: shake + 250 + RIDE_HANDOFF_MS };
}
