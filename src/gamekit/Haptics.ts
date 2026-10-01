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
  patternStrength,
  type HapticPatternName,
  type HapticPrimitive,
  type HapticStep,
} from './core/hapticGrammar';
import {
  BUS_FIRE,
  BUS_QUEUED,
  busDue,
  busOffer,
  busShouldCancelTail,
  busStats,
  configureHapticBus,
  createHapticBus,
  type HapticBusConfig,
  type HapticBusPreset,
} from './core/hapticBus';
import {
  AHAP_LIBRARY,
  hapticFallbackFor,
  patternBusStrength,
  toAhap,
  type AhapJson,
  type AhapPatternName,
  type HapticPatternDef,
} from './core/hapticPattern';

export type HapticIntent =
  | 'tapLight'
  | 'hitMedium'
  | 'comboHeavy'
  | 'failBuzz'
  | 'tickSelection'
  | 'success'
  | 'warning'
  | 'hitSoft'
  /** A crisp, short thunk (expo Rigid): the GOOD hit in Line Party. */
  | 'hitRigid'
  /** A soft, dull bump (expo Soft): a gentle error that never reads as failure (a lure, Butterfingers). */
  | 'softBump';

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
  softBump: 60,
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
  softBump: 0,
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
    case 'softBump':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft ?? Haptics.ImpactFeedbackStyle.Light);
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
  softBump: () => haptic('softBump'),
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

/** The priority bus every pattern goes through (core/hapticBus). */
const bus = createHapticBus('default');
let busTimer: ReturnType<typeof setTimeout> | null = null;
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
  bus.cfg.minGapMs = ms;
}

/**
 * Pick the game's density rule: a preset name from HAPTIC_BUS_PRESETS
 * ('whack', 'banana', 'trivia', 'sharky', 'currentQuest', 'rhythm',
 * 'rhythmDense', 'memory', 'boss', 'lineParty') or a partial config.
 * Call it on mount and configureHaptics('default') on unmount.
 */
export function configureHaptics(cfg: HapticBusPreset | Partial<HapticBusConfig>): void {
  if (busTimer) clearTimeout(busTimer);
  busTimer = null;
  configureHapticBus(bus, cfg);
}

/** Bus counters (fired / dropped / queued / preempted) for the dev overlay. */
export function hapticBusStats(): { fired: number; dropped: number; queued: number; preempted: number; tailCuts: number } {
  return { ...busStats(bus), tailCuts };
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
export function playHaptic(pattern: HapticPatternName | HapticStep[], opts: PatternOptions & { input?: boolean } = {}): boolean {
  if (!enabled) return false;
  if (opts.tell && !tellsEnabled) return false;
  const steps: readonly HapticStep[] = typeof pattern === 'string' ? HAPTIC_PATTERNS[pattern] : pattern;
  if (!steps || steps.length === 0) return false;
  const priority = opts.priority ?? (opts.tell ? HP.telegraph : HP.own);
  const lead = opts.alignToAudio ? offsetMs : 0;
  return offerToBus(priority, patternStrength(steps), opts, () => playSteps(steps, lead, priority));
}

/** The pattern whose later pulses are still pending (Whack v5 tail cancel). */
let playing: { priority: number; timers: ReturnType<typeof setTimeout>[]; endsAt: number } | null = null;

function playSteps(steps: readonly HapticStep[], lead: number, priority: number = HP.own): void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let last = 0;
  for (const step of steps) {
    const at = step.at + lead;
    last = Math.max(last, at);
    if (at <= 0) firePrimitive(step.p);
    else timers.push(setTimeout(() => firePrimitive(step.p), at));
  }
  if (timers.length > 0) playing = { priority, timers, endsAt: Date.now() + last };
}

function cutTailFor(priority: number): void {
  const p = playing;
  if (!p || Date.now() > p.endsAt) return;
  if (!busShouldCancelTail(bus, p.priority, priority)) return;
  for (const t of p.timers) clearTimeout(t);
  playing = null;
  tailCuts += 1;
}

let tailCuts = 0;

function offerToBus(priority: number, strength: number, opts: PatternOptions & { input?: boolean }, play: () => void): boolean {
  const now = Date.now();
  const verdict = busOffer(bus, now, { priority, strength, tell: opts.tell, input: opts.input, payload: { play, priority } });
  if (verdict === BUS_FIRE) {
    cutTailFor(priority);
    play();
    return true;
  }
  if (verdict === BUS_QUEUED && bus.queue) {
    if (busTimer) clearTimeout(busTimer);
    busTimer = setTimeout(() => {
      busTimer = null;
      const due = busDue(bus, Date.now());
      const job = due?.payload as { play: () => void; priority: number } | undefined;
      if (job) {
        cutTailFor(job.priority);
        job.play();
      }
    }, Math.max(0, bus.queue.dueAt - now));
    return true;
  }
  return false;
}

// =============================================================================
// Core Haptics patterns (intensity / sharpness) with the expo-haptics fallback
// =============================================================================

/** A native AHAP player (WS9's Core Haptics Expo module) plugs in here. */
export interface NativeHapticPlayer {
  /** Play an AHAP pattern now (or at `delayMs`). Must never throw. */
  play(ahap: AhapJson, delayMs: number): void;
}

let nativePlayer: NativeHapticPlayer | null = null;
const ahapCache = new Map<string, AhapJson>();

/**
 * Register the Core Haptics player when the binary has it. Until then every
 * pattern plays through its expo-haptics fallback (merged under 100 ms).
 */
export function setNativeHapticPlayer(player: NativeHapticPlayer | null): void {
  nativePlayer = player;
}

export function hasNativeHaptics(): boolean {
  return nativePlayer !== null;
}

/**
 * Play a Core Haptics pattern (a name from AHAP_LIBRARY or your own events)
 * under the bus rules. One pattern is one bus event, so a crit double or a
 * purr is never half-swallowed by a debounce.
 */
export function playPattern(
  pattern: AhapPatternName | HapticPatternDef,
  opts: PatternOptions & { input?: boolean; fallback?: HapticStep[] } = {},
): boolean {
  if (!enabled) return false;
  if (opts.tell && !tellsEnabled) return false;
  const def: HapticPatternDef = typeof pattern === 'string' ? AHAP_LIBRARY[pattern] : pattern;
  if (!def || def.length === 0) return false;
  const priority = opts.priority ?? (opts.tell ? HP.telegraph : HP.own);
  const lead = opts.alignToAudio ? offsetMs : 0;
  return offerToBus(priority, patternBusStrength(def), opts, () => {
    const player = nativePlayer;
    if (player) {
      const key = typeof pattern === 'string' ? pattern : '';
      let ahap = key ? ahapCache.get(key) : undefined;
      if (!ahap) {
        ahap = toAhap(def, key);
        if (key) ahapCache.set(key, ahap);
      }
      try {
        player.play(ahap, lead);
        return;
      } catch {
        // Fall through to the preset fallback.
      }
    }
    playSteps(opts.fallback ?? hapticFallbackFor(typeof pattern === 'string' ? pattern : null, def), lead, priority);
  });
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

export { HAPTIC_PATTERNS, HP, PRIMITIVE_STRENGTH, AHAP_LIBRARY };
export type { HapticPatternName, HapticPrimitive, HapticStep, AhapPatternName, HapticPatternDef, HapticBusPreset, HapticBusConfig };
