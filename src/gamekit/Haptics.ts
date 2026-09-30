/**
 * Haptics.ts — semantic haptic map for GameKit.
 *
 * Wraps expo-haptics behind intent-named calls so games never touch raw
 * impact styles. Every call is debounced per-key so rapid-fire game events
 * (e.g. a 20-tap combo) can't machine-gun the taptic engine, which both
 * drains battery and desensitizes the player.
 *
 * Enable/disable is respected via setHapticsEnabled — wire this to the
 * player's setting from wherever the shell mounts.
 */

import * as Haptics from 'expo-haptics';
import {
  HAPTIC_PATTERNS,
  HP,
  PRIMITIVE_STRENGTH,
  admitHaptic,
  createHapticScheduler,
  patternStrength,
  type HapticPatternName,
  type HapticPrimitive,
  type HapticStep,
} from './core/hapticGrammar';

export type HapticIntent =
  | 'tapLight'
  | 'hitMedium'
  | 'comboHeavy'
  | 'failBuzz'
  | 'tickSelection'
  | 'success'
  | 'warning'
  | 'hitSoft'
  | 'hitRigid';

/** Minimum ms between fires of the same intent. Tuned per intent below. */
const DEBOUNCE_MS: Record<HapticIntent, number> = {
  tapLight: 40,
  hitMedium: 55,
  comboHeavy: 90,
  failBuzz: 200,
  tickSelection: 30,
  success: 250,
  warning: 250,
  hitSoft: 45,
  hitRigid: 45,
};

const lastFiredAt: Record<HapticIntent, number> = {
  tapLight: 0,
  hitMedium: 0,
  comboHeavy: 0,
  failBuzz: 0,
  tickSelection: 0,
  success: 0,
  warning: 0,
  hitSoft: 0,
  hitRigid: 0,
};

let enabled = true;

/** Toggle all haptics (respect the player's sound/haptics preference). */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function areHapticsEnabled(): boolean {
  return enabled;
}

function run(intent: HapticIntent): void {
  switch (intent) {
    case 'tapLight':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    case 'hitMedium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    case 'comboHeavy':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      return;
    case 'tickSelection':
      Haptics.selectionAsync();
      return;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    case 'warning':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    case 'failBuzz':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    case 'hitSoft':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft ?? Haptics.ImpactFeedbackStyle.Light);
      return;
    case 'hitRigid':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid ?? Haptics.ImpactFeedbackStyle.Heavy);
      return;
  }
}

/**
 * Fire a semantic haptic. No-ops when disabled or inside the per-intent
 * debounce window. Never throws — a failing taptic engine must not crash a game.
 */
export function haptic(intent: HapticIntent): void {
  if (!enabled) return;
  const now = Date.now();
  if (now - lastFiredAt[intent] < DEBOUNCE_MS[intent]) return;
  lastFiredAt[intent] = now;
  try {
    run(intent);
  } catch {
    // Taptic engine unavailable (e.g. simulator) — silently ignore.
  }
}

/** Convenience object form for ergonomic call sites: Haptic.tapLight(). */
export const Haptic: Record<HapticIntent, () => void> = {
  tapLight: () => haptic('tapLight'),
  hitMedium: () => haptic('hitMedium'),
  comboHeavy: () => haptic('comboHeavy'),
  failBuzz: () => haptic('failBuzz'),
  tickSelection: () => haptic('tickSelection'),
  success: () => haptic('success'),
  warning: () => haptic('warning'),
  hitSoft: () => haptic('hitSoft'),
  hitRigid: () => haptic('hitRigid'),
};

// =============================================================================
// Haptic grammar: patterns + priority scheduling (studio engine)
// =============================================================================

const PRIMITIVE_INTENT: Record<HapticPrimitive, HapticIntent> = {
  selection: 'tickSelection',
  light: 'tapLight',
  medium: 'hitMedium',
  heavy: 'comboHeavy',
  soft: 'hitSoft',
  rigid: 'hitRigid',
  success: 'success',
  warning: 'warning',
  error: 'failBuzz',
};

const scheduler = createHapticScheduler(60);
let tellsEnabled = true;
let offsetMs = 0;

/** 'Feel the tells' toggle (telegraph haptics for eyes-off, muted players). */
export function setTellHapticsEnabled(value: boolean): void {
  tellsEnabled = value;
}

export function areTellHapticsEnabled(): boolean {
  return tellsEnabled;
}

/**
 * Delay pattern playback to land with the audio (measured per platform: the
 * backend's output latency). 0 for audio-api, ~60-80 for expo-av.
 */
export function setHapticAudioOffsetMs(ms: number): void {
  offsetMs = Math.max(0, ms);
}

/** Minimum gap between in-play haptics (the stronger wins a collision). */
export function setHapticGapMs(ms: number): void {
  scheduler.minGapMs = ms;
}

export function firePrimitive(p: HapticPrimitive): void {
  if (!enabled) return;
  try {
    run(PRIMITIVE_INTENT[p]);
  } catch {
    // Simulator / no taptic engine.
  }
}

export interface PatternOptions {
  /** HP.telegraph for tells, HP.critical for P0 (never dropped), HP.rival drops. */
  priority?: number;
  /** Align with an audio cue that starts after its output latency. */
  alignToAudio?: boolean;
  /** Is this a telegraph/tell (respects the 'Feel the tells' toggle)? */
  tell?: boolean;
}

/**
 * Play a named pattern (or custom steps) under the grammar rules. Returns
 * false when it was dropped (disabled, rival-caused, or out-ranked in the gap).
 */
export function playHaptic(pattern: HapticPatternName | HapticStep[], opts: PatternOptions = {}): boolean {
  if (!enabled) return false;
  if (opts.tell && !tellsEnabled) return false;
  const steps: readonly HapticStep[] = typeof pattern === 'string' ? HAPTIC_PATTERNS[pattern] : pattern;
  if (!steps || steps.length === 0) return false;
  const priority = opts.priority ?? (opts.tell ? HP.telegraph : HP.own);
  if (!admitHaptic(scheduler, Date.now(), patternStrength(steps), priority)) return false;
  const lead = opts.alignToAudio ? offsetMs : 0;
  for (const step of steps) {
    const at = step.at + lead;
    if (at <= 0) firePrimitive(step.p);
    else setTimeout(() => firePrimitive(step.p), at);
  }
  return true;
}

/**
 * Schedule a haptic sequence from ONE start timestamp (Date.now() ms), e.g. a
 * Current Quest carry: ticks at 60 + 75k ms from the stroke start. Each step's
 * delay is computed from the shared start, so JS timer drift never piles up
 * across the sequence. Steps already in the past fire immediately; steps more
 * than `lateDropMs` late are skipped (a late buzz reads as a bug).
 * Returns a cancel function (call it on pause or wrap-up).
 */
export function scheduleHaptics(
  steps: readonly HapticStep[],
  opts: PatternOptions & { startAt?: number; lateDropMs?: number } = {},
): () => void {
  if (!enabled || steps.length === 0) return () => {};
  if (opts.tell && !tellsEnabled) return () => {};
  const priority = opts.priority ?? (opts.tell ? HP.telegraph : HP.own);
  if (priority <= HP.rival) return () => {};
  const start = opts.startAt ?? Date.now();
  const lead = opts.alignToAudio ? offsetMs : 0;
  const lateDrop = opts.lateDropMs ?? 40;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const now = Date.now();
  for (const step of steps) {
    const due = start + step.at + lead;
    const delay = due - now;
    if (delay < -lateDrop) continue;
    if (delay <= 0) firePrimitive(step.p);
    else timers.push(setTimeout(() => firePrimitive(step.p), delay));
  }
  return () => {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
  };
}

export { HAPTIC_PATTERNS, HP, PRIMITIVE_STRENGTH };
export type { HapticPatternName, HapticPrimitive, HapticStep };
