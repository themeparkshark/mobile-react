/**
 * playMoment.ts: play a named moment from momentMap.ts (wow-sound lane, Oct 24 2026).
 *
 *   playMoment('catch.burst', { haptic: true });          // new choreography
 *   playMoment('catch.count');                             // climbs the coin ladder on its own
 *   if (!studioMoment('catch.count')) playSound(LEGACY);   // keep a legacy call site exact
 *
 * Switch off (studioSwitch.ts, the default): playMoment plays the moment's
 * Chris fallback through GameAudio, and studioMoment returns false so legacy
 * code runs exactly as today. Switch on: the studio primary plays with its
 * layers, ladder rung or round-robin file, trimmed to its loudness class,
 * capped at 3 voices, ducking the music on reveals and stings.
 *
 * Everything goes through GameAudio, so the player's Sound Effects setting,
 * the iOS silent switch (expo-av playsInSilentModeIOS false, audio-api
 * 'ambient' session) and the muted studio env all apply. Never throws.
 */

import { GameAudio } from './GameAudio';
import { CHRIS_CUES, type CueDef } from './chrisBank';
import { studioCueDef } from './studioLibrary';
import { isStudioSoundOn } from './studioSwitch';
import {
  CLASS_BUS,
  MAX_MOMENT_VOICES,
  MOMENTS,
  ladderStep,
  momentHaptic,
  nextRoundRobin,
  parseRef,
  type MomentDef,
  type MomentName,
  type SoundRef,
} from './momentMap';
import {
  HAPTIC_PATTERNS,
  hasNativeHaptics,
  playHaptic,
  playPattern,
  queueHaptic,
  setHapticTraceListener,
  type HapticIntent,
  type HapticPrimitive,
  type HapticStep,
} from '../Haptics';
import { studioTraceOn, traceEvent } from './studioTrace';

export interface MomentOptions {
  /** 0..1 on top of the moment's trim. */
  volume?: number;
  /** Ladder rung (counts, combo tiers, warmer). Omit to climb automatically. */
  step?: number;
  /** Delay the whole moment (ms). */
  delayMs?: number;
  /** Fire the paired haptic on the same frame (aligned to the audio backend latency). */
  haptic?: boolean;
  /** 'app' (default) uses the shared 120 ms gate; 'game' uses the in-game haptic bus. */
  context?: 'app' | 'game';
  /** Walking in a line: the haptic drops one rung. */
  walking?: boolean;
  /** Audition the variant instead of the primary (dev tester, listening checks). */
  useVariant?: boolean;
}

const lastLadder = new Map<MomentName, { at: number; step: number }>();
const lastRr = new Map<MomentName, number>();
const registered = new Set<string>();

/** Dev trace (Metro log + buffer): what each moment played, for beat logs and sync review. */
export const momentTraceBuffer: string[] = [];
function trace(line: string): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const out = `[moment] ${Date.now()} ${line}`;
  if (studioTraceOn()) traceEvent('moment', line);
  else console.log(out);
  if (momentTraceBuffer.length < 2000) momentTraceBuffer.push(out);
}

// Trace mode: every haptic pulse that actually fires is logged next to the sound starts.
if (studioTraceOn()) {
  try { setHapticTraceListener((intent) => traceEvent('haptic', intent)); } catch { /* optional */ }
}

function isDev(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function studioDef(ref: SoundRef): CueDef | undefined {
  const p = parseRef(ref);
  if (p.kind === 'chris') return (CHRIS_CUES as Record<string, CueDef>)[p.cue];
  return studioCueDef(p.game, p.id);
}

/** Would this studio ref actually play here (approved, or a dev build)? Chris refs always can. */
function refPlayable(ref: SoundRef): boolean {
  if (parseRef(ref).kind === 'chris') return !!studioDef(ref);
  const def = studioDef(ref);
  return !!def && (def.approved === true || isDev());
}

/** True when the moment's studio sound can play right now (switch on and its cue playable). */
export function studioReady(name: MomentName, useVariant = false): boolean {
  const def = MOMENTS[name] as MomentDef | undefined;
  if (!def || !isStudioSoundOn()) return false;
  return refPlayable(useVariant ? def.variant : def.primary);
}

function key(name: MomentName, slot: string): string {
  return `moment:${name}:${slot}`;
}

/** Register one engine cue for a moment slot (primary, variant or a layer) under its own key. */
function ensureCue(name: MomentName, slot: string, ref: SoundRef, extraDb: number, isPrimary: boolean): string | null {
  const k = key(name, slot);
  if (registered.has(k)) return k;
  const def = MOMENTS[name] as MomentDef;
  const base = studioDef(ref);
  if (!base) return null;
  const chris = parseRef(ref).kind === 'chris';
  const cue: CueDef = {
    ...base,
    gainDb: chris ? base.gainDb : (slot === 'variant' ? def.variantGainDb ?? 0 : def.gainDb) + extraDb,
    bus: CLASS_BUS[def.mix],
    maxVoices: Math.min(MAX_MOMENT_VOICES, def.maxVoices),
    cooldownMs: def.cooldownMs ?? base.cooldownMs,
    duck: isPrimary || slot === 'variant' ? def.duck : undefined,
    fallback: def.fallback,
  };
  if (isPrimary && def.rr?.length) {
    const files = def.rr.map((r) => studioDef(r)?.src).filter((s): s is number => typeof s === 'number');
    if (files.length) cue.variants = files;
  }
  GameAudio.registerCues({ [k]: cue });
  registered.add(k);
  return k;
}

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

/**
 * The paired haptic, landing with the sound:
 *  - app context: every pulse goes through the one shared gate, delayed by the
 *    moment's delayMs plus the cue's output latency (`leadMs`, 20 ms audio-api,
 *    80 ms expo-av), so the buzz is felt when the sound is heard, not before;
 *  - game context: the in-game bus, after delayMs, with alignToAudio (the game
 *    sets the backend offset once with setHapticAudioOffsetMs);
 *  - Core Haptics: when the binary has the native player (NATIVE_QUEUE), a
 *    moment with an `ahap` plays its shaped pattern instead (not while walking:
 *    the walking rung-down uses the simpler pattern).
 */
function fireHaptic(name: MomentName, opts: MomentOptions, leadMs: number): void {
  const def = MOMENTS[name] as MomentDef;
  const pattern = momentHaptic(name, { walking: opts.walking });
  if (!pattern) return;
  const game = opts.context === 'game';
  const wait = Math.max(0, (opts.delayMs ?? 0) + (game ? 0 : leadMs));
  const later = (fn: () => void, at: number) => { if (at <= 0) fn(); else setTimeout(fn, at); };
  try {
    const shaped = def.ahap && !opts.walking && hasNativeHaptics() ? def.ahap : null;
    trace(`haptic ${name} ${shaped ? `ahap ${shaped}` : pattern} +${wait}ms`);
    if (shaped) {
      later(() => { playPattern(shaped, { alignToAudio: game, fallback: HAPTIC_PATTERNS[pattern] as HapticStep[] }); }, wait);
      return;
    }
    if (game) {
      later(() => { playHaptic(pattern, { alignToAudio: true }); }, wait);
      return;
    }
    // Outside games: every pulse goes through the one shared gate (at most one per 120 ms).
    for (const step of HAPTIC_PATTERNS[pattern]) {
      const intent = PRIMITIVE_INTENT[step.p];
      later(() => queueHaptic(intent), step.at + wait);
    }
  } catch {
    // Haptics are decoration.
  }
}

/** The sound half of a moment: returns the voice id and the engine cue it started (for latency). */
function playSound(name: MomentName, def: MomentDef, opts: MomentOptions): { id: number; cue: string | null } {
  if (!GameAudio.isSfxEnabled()) return { id: 0, cue: null };
  const now = Date.now();
  const step = def.ladder ? ladderStep(def, opts.step, lastLadder.get(name), now) : undefined;
  if (step !== undefined) lastLadder.set(name, { at: now, step });
  const volume = opts.volume;
  const delayMs = opts.delayMs ?? 0;

  if (!studioReady(name, opts.useVariant)) {
    // Switch off (or not approved yet): Chris's sound, with the ladder as a pitch climb.
    trace(`fallback ${name} ${def.fallback}${step !== undefined ? ` step=${step}` : ''}`);
    return { id: GameAudio.play(def.fallback, { volume, delayMs, pitch: step !== undefined ? Math.min(12, step) : undefined }), cue: def.fallback };
  }

  if (opts.useVariant) {
    const k = ensureCue(name, 'variant', def.variant, 0, false);
    trace(`studio ${name} variant ${def.variant}`);
    if (!k) return { id: GameAudio.play(def.fallback, { volume, delayMs }), cue: def.fallback };
    const id = step !== undefined && GameAudio.cue(k)?.ladder?.length ? GameAudio.playLadder(k, step, { volume, delayMs }) : GameAudio.play(k, { volume, delayMs });
    return { id, cue: k };
  }

  const k = ensureCue(name, 'primary', def.primary, 0, true);
  if (!k) return { id: GameAudio.play(def.fallback, { volume, delayMs }), cue: def.fallback };
  let id: number;
  if (step !== undefined) {
    trace(`studio ${name} ${def.primary} step=${step}`);
    id = GameAudio.playLadder(k, step, { volume, delayMs });
  } else if (def.rr?.length) {
    const pool = (GameAudio.cue(k)?.variants?.length ?? 0) + 1;
    const rr = nextRoundRobin(pool, lastRr.get(name));
    lastRr.set(name, rr);
    trace(`studio ${name} ${def.primary} rr=${rr}`);
    id = GameAudio.play(k, { volume, delayMs, variant: rr });
  } else {
    trace(`studio ${name} ${def.primary}`);
    id = GameAudio.play(k, { volume, delayMs });
  }
  def.layers?.forEach((layer, i) => {
    if (!refPlayable(layer.ref)) return;
    const lk = ensureCue(name, `layer${i}`, layer.ref, layer.db ?? 0, false);
    if (!lk) return;
    if (layer.step !== undefined) GameAudio.playLadder(lk, layer.step, { volume, delayMs: delayMs + layer.delayMs });
    else GameAudio.play(lk, { volume, delayMs: delayMs + layer.delayMs });
  });
  return { id, cue: k };
}

/**
 * Play a moment. Returns the engine voice id (>0), or 0 when muted, merged,
 * dropped or loading. Never throws.
 */
export function playMoment(name: MomentName, opts: MomentOptions = {}): number {
  const def = MOMENTS[name] as MomentDef | undefined;
  if (!def) return 0;
  let played: { id: number; cue: string | null } = { id: 0, cue: null };
  try {
    played = playSound(name, def, opts);
  } catch {
    played = { id: 0, cue: null };
  }
  if (opts.haptic) {
    let lead = 0;
    try { lead = played.cue ? GameAudio.latencyFor(played.cue) : 0; } catch { lead = 0; }
    fireHaptic(name, opts, lead);
  }
  return played.id;
}

/**
 * For legacy call sites: plays the studio moment and returns true only when
 * the switch is on and the cue can play. False means "do exactly what you did
 * before" (nothing here played).
 */
export function studioMoment(name: MomentName, opts: MomentOptions = {}): boolean {
  try {
    if (!GameAudio.isSfxEnabled() || !studioReady(name, opts.useVariant)) return false;
    playMoment(name, opts);
    return true;
  } catch {
    return false;
  }
}

/** Decode a set of moments ahead of time (no-op while the switch is off: Chris's bank is preloaded elsewhere). */
export function preloadMoments(names: readonly MomentName[]): Promise<void> {
  if (!isStudioSoundOn() || !GameAudio.isSfxEnabled()) return Promise.resolve();
  const keys: string[] = [];
  for (const name of names) {
    const def = MOMENTS[name] as MomentDef | undefined;
    if (!def || !refPlayable(def.primary)) continue;
    const k = ensureCue(name, 'primary', def.primary, 0, true);
    if (k) keys.push(k);
    def.layers?.forEach((layer, i) => {
      const lk = refPlayable(layer.ref) ? ensureCue(name, `layer${i}`, layer.ref, layer.db ?? 0, false) : null;
      if (lk) keys.push(lk);
    });
  }
  return GameAudio.preload(keys).catch(() => undefined);
}

/** Tests only. */
export function resetMomentsForTests(): void {
  lastLadder.clear();
  lastRr.clear();
  registered.clear();
  momentTraceBuffer.length = 0;
}
