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
 * Battery Saver (and Low Power Mode, once a binary can read it: the same
 * powerPolicy input) keeps every moment but makes it cheaper: the primary cue
 * only (no layers), and one pulse on the beat instead of a shaped pattern.
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
  type MomentLayer,
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
  type HapticPatternName,
  type HapticPrimitive,
  type HapticStep,
} from '../Haptics';
import { captureLine, captureTraceOn, studioTraceOn, traceEvent } from './studioTrace';
import { isBatterySaverOn } from '../../power/batterySaver';

/** Battery Saver: the primary sound and one pulse only. Never throws. */
export function momentSaver(): boolean {
  try { return isBatterySaverOn(); } catch { return false; }
}

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
  /**
   * Semitones on a one-shot (primary, round-robin and its layers, so they stay in tune). Ignored by
   * ladder rungs (pre-rendered) and by the switch-off fallback (today's sound is never re-pitched).
   */
  pitch?: number;
  /** Wave 5: the everyday burst's round-robin tail (MomentDef.voicings); omitted = the moment's own layers. */
  voicing?: number;
  /**
   * Wave 5 round 2: a different shaped buzz for this call (a surface with its own beats right after, like the level
   * chest's reward rows, takes the moment's short form so nothing stacks). Omitted = the moment's own pattern.
   */
  hapticPattern?: HapticPatternName;
}

/** Output latencies up to this (ms) fire the paired haptic in the same call as the sound. */
export const HAPTIC_LEAD_FREE_MS = 30;

const lastLadder = new Map<MomentName, { at: number; step: number }>();
const lastRr = new Map<MomentName, number>();
const registered = new Set<string>();

/**
 * Dev trace: what each moment played, for beat logs and sync review. Only a sound trace build
 * (EXPO_PUBLIC_STUDIO_TRACE=1) writes it to Metro; an ordinary dev build keeps it in this buffer
 * only (round 5: a console.log per moment is a bridge message the JS thread pays for mid-catch).
 */
export const momentTraceBuffer: string[] = [];
function trace(line: string): void {
  if (captureTraceOn()) captureLine(`[moment] ${Date.now()} ${line}`);
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (studioTraceOn()) traceEvent('moment', line);
  if (momentTraceBuffer.length < 2000) momentTraceBuffer.push(`[moment] ${Date.now()} ${line}`);
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
 *  - app context: every pulse goes through the one shared gate, after the
 *    moment's delayMs; a cue on the slow expo-av route (about 80 ms) also waits
 *    its output latency, a fast audio-api cue (about 20 ms) does not (no timer);
 *  - game context: the in-game bus, after delayMs, with alignToAudio (the game
 *    sets the backend offset once with setHapticAudioOffsetMs);
 *  - Core Haptics: when the binary has the native player (NATIVE_QUEUE), a
 *    moment with an `ahap` plays its shaped pattern instead (not while walking:
 *    the walking rung-down uses the simpler pattern).
 */
function fireHaptic(name: MomentName, opts: MomentOptions, leadMs: number): void {
  const def = MOMENTS[name] as MomentDef;
  const pattern = opts.hapticPattern ?? momentHaptic(name, { walking: opts.walking });
  if (!pattern) return;
  const game = opts.context === 'game';
  // An output latency at or under HAPTIC_LEAD_FREE_MS (audio-api, about 20 ms) is below what a hand
  // can tell from the Taptic Engine's own start-up, so the buzz fires in this call: no timer hop that
  // a busy JS thread could stretch. Only the slow expo-av route (about 80 ms) still waits.
  const lead = game || leadMs <= HAPTIC_LEAD_FREE_MS ? 0 : leadMs;
  const wait = Math.max(0, (opts.delayMs ?? 0) + lead);
  const later = (fn: () => void, at: number) => { if (at <= 0) fn(); else setTimeout(fn, at); };
  try {
    // Battery Saver: one pulse on the beat (the pattern's first step), no shaped tail, no extra timers.
    if (momentSaver()) {
      const first = (HAPTIC_PATTERNS[pattern] as HapticStep[])[0];
      if (!first) return;
      trace(`haptic ${name} saver ${first.p} +${wait}ms`);
      later(() => { if (game) playHaptic([{ ...first, at: 0 }], { alignToAudio: true }); else queueHaptic(PRIMITIVE_INTENT[first.p]); }, wait + (first.at ?? 0));
      return;
    }
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
  const pitch = opts.pitch !== undefined && Number.isFinite(opts.pitch) ? Math.max(-12, Math.min(12, opts.pitch)) : undefined;

  if (!studioReady(name, opts.useVariant)) {
    // Switch off (or not approved yet): Chris's sound, with the ladder as a pitch climb.
    trace(`fallback ${name} ${def.fallback}${step !== undefined ? ` step=${step}` : ''}${delayMs ? ` +${Math.round(delayMs)}ms` : ''}`);
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
    trace(`studio ${name} ${def.primary} step=${step}${delayMs ? ` +${Math.round(delayMs)}ms` : ''}`);
    id = GameAudio.playLadder(k, step, { volume, delayMs });
  } else if (def.rr?.length) {
    const pool = (GameAudio.cue(k)?.variants?.length ?? 0) + 1;
    const rr = nextRoundRobin(pool, lastRr.get(name));
    lastRr.set(name, rr);
    trace(`studio ${name} ${def.primary} rr=${rr}${pitch ? ` pitch=${pitch}` : ''}${delayMs ? ` +${Math.round(delayMs)}ms` : ''}`);
    id = GameAudio.play(k, { volume, delayMs, variant: rr, pitch });
  } else {
    trace(`studio ${name} ${def.primary}${pitch ? ` pitch=${pitch}` : ''}${opts.voicing !== undefined ? ` v${opts.voicing}` : ''}${delayMs ? ` +${Math.round(delayMs)}ms` : ''}`);
    id = GameAudio.play(k, { volume, delayMs, pitch });
  }
  // Battery Saver: the primary alone carries the moment.
  const v = voicingIndex(def, opts.voicing);
  if (!momentSaver()) layersFor(def, v)?.forEach((layer, i) => {
    if (!refPlayable(layer.ref)) return;
    const lk = ensureCue(name, layerSlot(v, i), layer.ref, layer.db ?? 0, false);
    if (!lk) return;
    if (layer.step !== undefined) GameAudio.playLadder(lk, layer.step, { volume, delayMs: delayMs + layer.delayMs });
    else GameAudio.play(lk, { volume, delayMs: delayMs + layer.delayMs, pitch });
  });
  return { id, cue: k };
}

/** Which voicing's tail plays (0 = the moment's own layers). */
function voicingIndex(def: MomentDef, voicing: number | undefined): number {
  const n = def.voicings?.length ?? 0;
  if (!n || voicing === undefined || !Number.isFinite(voicing)) return 0;
  return ((Math.floor(voicing) % n) + n) % n;
}
function layersFor(def: MomentDef, v: number): readonly MomentLayer[] | undefined {
  return v > 0 && def.voicings ? def.voicings[v] : def.layers;
}
function layerSlot(v: number, i: number): string {
  return v > 0 ? `v${v}layer${i}` : `layer${i}`;
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
    const sets = def.voicings?.length ? def.voicings.map((_, v) => v) : [0];
    for (const v of sets) {
      layersFor(def, v)?.forEach((layer, i) => {
        const lk = refPlayable(layer.ref) ? ensureCue(name, layerSlot(v, i), layer.ref, layer.db ?? 0, false) : null;
        if (lk) keys.push(lk);
      });
    }
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
