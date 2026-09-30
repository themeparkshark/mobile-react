/**
 * hapticGrammar.ts: the studio haptic language (pure data + scheduling rules).
 *
 * Primitives map 1:1 to expo-haptics calls. Patterns are short timed
 * sequences of primitives (crit = rigid x2 40ms apart, KO = heavy then a
 * decaying roll). The scheduler enforces the grammar rules every design
 * shares:
 *   - one haptic per `minGapMs` in play (the stronger wins a collision)
 *   - telegraphs/tells outrank reactions (walking players feel tells first)
 *   - P0 events (incoming attack on you, your win, VERIFIED) always fire
 *   - rival-caused haptics are dropped entirely
 */

export type HapticPrimitive =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'soft'
  | 'rigid'
  | 'success'
  | 'warning'
  | 'error';

/** Relative strength for collision resolution. */
export const PRIMITIVE_STRENGTH: Record<HapticPrimitive, number> = {
  selection: 1,
  soft: 2,
  light: 2,
  medium: 3,
  rigid: 4,
  heavy: 5,
  warning: 5,
  success: 6,
  error: 6,
};

export interface HapticStep {
  at: number;
  p: HapticPrimitive;
}

/** Named patterns used across the designs. */
export const HAPTIC_PATTERNS = {
  tap: [{ at: 0, p: 'light' }],
  tick: [{ at: 0, p: 'selection' }],
  lateHit: [{ at: 0, p: 'soft' }],
  goodHit: [{ at: 0, p: 'medium' }],
  quickHit: [{ at: 0, p: 'rigid' }],
  crit: [{ at: 0, p: 'rigid' }, { at: 40, p: 'rigid' }],
  golden: [{ at: 0, p: 'heavy' }, { at: 180, p: 'success' }],
  tierUp: [{ at: 0, p: 'heavy' }],
  comboBreak: [{ at: 0, p: 'warning' }],
  feverStart: [{ at: 0, p: 'heavy' }, { at: 90, p: 'medium' }],
  hurt: [{ at: 0, p: 'error' }],
  punish: [{ at: 0, p: 'error' }],
  dizzy: [{ at: 0, p: 'soft' }, { at: 120, p: 'soft' }],
  breakPart: [{ at: 0, p: 'heavy' }, { at: 70, p: 'rigid' }, { at: 140, p: 'rigid' }],
  finisher: [{ at: 0, p: 'light' }, { at: 90, p: 'medium' }, { at: 180, p: 'heavy' }],
  ko: [{ at: 0, p: 'heavy' }, { at: 150, p: 'medium' }, { at: 280, p: 'light' }, { at: 400, p: 'soft' }, { at: 650, p: 'success' }],
  winRoll: [{ at: 0, p: 'light' }, { at: 80, p: 'medium' }, { at: 160, p: 'heavy' }],
  incoming: [{ at: 0, p: 'light' }, { at: 70, p: 'medium' }],
  surge: [{ at: 0, p: 'medium' }],
  pop: [{ at: 0, p: 'rigid' }],
  /** Lane signatures: 1/2/3 ticks, 80ms apart (eyes-free lane read). */
  lane1: [{ at: 0, p: 'selection' }],
  lane2: [{ at: 0, p: 'selection' }, { at: 80, p: 'selection' }],
  lane3: [{ at: 0, p: 'selection' }, { at: 80, p: 'selection' }, { at: 160, p: 'selection' }],
  goldenTell: [{ at: 0, p: 'selection' }, { at: 80, p: 'selection' }],
  anglerTell: [{ at: 0, p: 'soft' }, { at: 50, p: 'soft' }, { at: 100, p: 'soft' }],
  starSlam: [{ at: 0, p: 'medium' }],
  bigStarSlam: [{ at: 0, p: 'heavy' }],
  resumeBeat: [{ at: 0, p: 'selection' }],
  win: [{ at: 0, p: 'success' }],
  lose: [{ at: 0, p: 'warning' }],
} satisfies Record<string, HapticStep[]>;

export type HapticPatternName = keyof typeof HAPTIC_PATTERNS;

/** Priority classes. */
export const HP = {
  /** Rival-caused: never fires. */
  rival: -1,
  reaction: 1,
  own: 2,
  telegraph: 3,
  critical: 4,
} as const;

export interface HapticSchedulerState {
  minGapMs: number;
  lastAt: number;
  lastStrength: number;
  lastPriority: number;
  fired: number;
  dropped: number;
}

export function createHapticScheduler(minGapMs = 60): HapticSchedulerState {
  return { minGapMs, lastAt: -1e9, lastStrength: 0, lastPriority: 0, fired: 0, dropped: 0 };
}

/**
 * Should a haptic of `strength` and `priority` fire at `now`? Inside the
 * gap, it fires only if it outranks the previous one (critical always does).
 */
export function admitHaptic(s: HapticSchedulerState, now: number, strength: number, priority: number): boolean {
  if (priority < 0) {
    s.dropped += 1;
    return false;
  }
  const inGap = now - s.lastAt < s.minGapMs;
  if (inGap && priority < HP.critical) {
    const outranks = priority > s.lastPriority || (priority === s.lastPriority && strength > s.lastStrength);
    if (!outranks) {
      s.dropped += 1;
      return false;
    }
  }
  s.lastAt = now;
  s.lastStrength = strength;
  s.lastPriority = priority;
  s.fired += 1;
  return true;
}

/** Strength of a pattern (its strongest step). */
export function patternStrength(steps: readonly HapticStep[]): number {
  let m = 0;
  for (const st of steps) m = Math.max(m, PRIMITIVE_STRENGTH[st.p]);
  return m;
}

/**
 * Steps on a regular grid from one start: `count` pulses at firstAt + k*every.
 * `alt` swaps every other pulse (Current Quest: tick, then light on 4+ tiles).
 */
export function gridSteps(count: number, firstAt: number, every: number, p: HapticPrimitive, alt?: HapticPrimitive): HapticStep[] {
  const out: HapticStep[] = [];
  for (let k = 0; k < count; k++) out.push({ at: firstAt + k * every, p: alt && k % 2 === 1 ? alt : p });
  return out;
}
