/**
 * hapticPattern.ts: Core Haptics patterns as data (intensity / sharpness
 * events), the AHAP JSON they compile to, and the expo-haptics fallback plan.
 *
 * Whack v4, Rhythm Phase 6 and Boss BossFeel all describe haptics as Core
 * Haptics transients and continuous events. The native player (an AHAP Expo
 * module in WS9's next binary) is not in the app yet, so every pattern also
 * needs a fallback on expo-haptics presets. Two rules from the docs shape it:
 *   - Boss: expo-haptics plays single pulses only; a multi-pulse pattern
 *     spaced under 100 ms only plays its first pulse, so the fallback merges
 *     pulses closer than `minSpacingMs` into the strongest one.
 *   - Rhythm: DRUM is always duller than RIM, so sharpness picks between
 *     soft/medium and rigid/light at the same intensity.
 *
 * Pure data and functions: the same library exports .ahap.json files for the
 * native module (tools/haptics/export-ahap.cjs) and runs under node --test.
 */

import type { HapticPrimitive, HapticStep } from './hapticGrammar';

export interface HapticEvent {
  /** Start, ms from the pattern start (align this to the audio peak). */
  t: number;
  /** 'transient' is a tap; 'continuous' a buzz of `dur` ms. */
  kind: 'transient' | 'continuous';
  /** Intensity 0..1. */
  i: number;
  /** Sharpness 0..1 (0 dull thud, 1 crisp click). */
  s: number;
  /** Continuous only: duration (ms). */
  dur?: number;
  /** Continuous only: intensity at the end (linear ramp), e.g. a Champ crouch 0.2 -> 0.6. */
  iEnd?: number;
  /** Continuous only: sharpness at the end. */
  sEnd?: number;
}

export type HapticPatternDef = readonly HapticEvent[];

const T = (t: number, i: number, s: number): HapticEvent => ({ t, kind: 'transient', i, s });
const C = (t: number, dur: number, i: number, s: number, iEnd?: number, sEnd?: number): HapticEvent => ({
  t, kind: 'continuous', i, s, dur, iEnd, sEnd,
});

/**
 * The studio library (numbers from the design docs). Games can pass their own
 * HapticEvent arrays too; these are the shared ones.
 */
export const AHAP_LIBRARY = {
  // Whack v4
  whackLate: [T(0, 0.4, 0.3)],
  whackGood: [T(0, 0.65, 0.5)],
  whackQuick: [T(0, 0.9, 0.8)],
  whackCrit: [T(0, 0.9, 0.9), T(40, 0.9, 0.9)],
  whackCounter: [T(0, 1, 1), T(35, 1, 1)],
  hatBounce: [T(0, 0.3, 0.7)],
  goldenTell: [T(0, 0.5, 0.5), T(80, 1, 0.5)],
  purrTell: [T(0, 0.45, 0.15), T(50, 0.45, 0.15), T(100, 0.45, 0.15)],
  champCrouch: [C(0, 450, 0.2, 0.3, 0.6, 0.5)],
  anglerHit: [C(0, 180, 0.5, 0.2), T(180, 0.6, 0.2)],
  tierDrop: [T(0, 0.35, 0.2)],
  tierUp: [T(0, 0.8, 0.6), T(60, 1, 0.8)],
  goldenHit: [T(0, 1, 0.8), C(180, 120, 0.4, 0.9, 0.1, 0.9)],
  champSlam: [T(0, 1, 0.4), T(60, 0.4, 0.2)],
  finalBonk: [T(0, 1, 0.6), C(0, 300, 0.8, 0.4, 0, 0.2), T(450, 0.7, 0.9)],
  finaleStar: [T(0, 0.6, 0.7)],
  lookUpResume: [T(0, 0.3, 0.5)],
  teamBonk: [T(0, 1, 0.9)],
  // Rhythm Phase 6 (DRUM always duller than RIM)
  rhythmSharp: [T(0, 1, 0.9)],
  rhythmPerfectDrum: [T(0, 0.8, 0.45)],
  rhythmPerfectRim: [T(0, 0.8, 0.75)],
  rhythmGreatDrum: [T(0, 0.5, 0.25)],
  rhythmGreatRim: [T(0, 0.5, 0.55)],
  rhythmGood: [T(0, 0.3, 0.2)],
  rhythmRollEnd: [T(0, 0.5, 0.4)],
  rhythmBreak: [T(0, 0.4, 0.3)],
  rhythmBig: [T(0, 1, 0.5)],
  rhythmCountIn: [T(0, 0.3, 0.5)],
  // Boss BossFeel
  bossCounterPress: [T(0, 0.4, 0.4)],
  bossPinSlam: [T(0, 0.7, 0.4), C(0, 60, 0.5, 0.3, 0, 0.2)],
  bossPop: [T(0, 1, 0.6)],
  bossPerfect: [T(0, 1, 0.7), T(60, 0.4, 0.5)],
  bossBreak: [T(0, 1, 0.6), T(70, 0.8, 0.6), T(140, 0.8, 0.6)],
  bossEasySlam: [T(0, 0.9, 0.5), T(50, 0.7, 0.5)],
  bossFinalPop: [T(0, 0.4, 0.5), T(90, 0.7, 0.5), T(180, 1, 0.6)],
  bossKnockdown: [C(0, 300, 0.6, 0.3, 0.1, 0.1)],
  bossKo: [T(0, 1, 0.6), T(150, 0.7, 0.5), T(280, 0.4, 0.4), T(400, 0.3, 0.3), T(650, 0.9, 0.8)],
  bossFinRefill: [T(0, 0.3, 0.5), T(80, 0.3, 0.5), T(160, 0.3, 0.5)],
  // Banana Core Haptics request (WS9)
  bananaPufferHit: [T(0, 1, 0.7), C(0, 200, 0.6, 0.2, 0, 0.1)],
  bananaGoldenHour: [C(0, 600, 0.5, 0.2, 0.8, 0.9)],
} satisfies Record<string, HapticPatternDef>;

export type AhapPatternName = keyof typeof AHAP_LIBRARY;

/** Length of a pattern (ms). */
export function patternDurationMs(p: HapticPatternDef): number {
  let end = 0;
  for (const e of p) end = Math.max(end, e.t + (e.kind === 'continuous' ? e.dur ?? 0 : 0));
  return end;
}

/** Strength on the PRIMITIVE_STRENGTH scale (1..6) for bus arbitration. */
export function patternBusStrength(p: HapticPatternDef): number {
  let m = 0;
  for (const e of p) m = Math.max(m, e.i);
  return 1 + Math.round(m * 5);
}

/**
 * The expo-haptics preset closest to one event. Sharpness decides the family
 * (dull = soft/medium/heavy, crisp = light/rigid), intensity the weight.
 */
export function primitiveFor(i: number, s: number): HapticPrimitive {
  if (i < 0.2) return 'selection';
  if (i < 0.45) return s >= 0.5 ? 'light' : 'soft';
  if (i < 0.75) return s >= 0.7 ? 'rigid' : 'medium';
  return s >= 0.75 ? 'rigid' : 'heavy';
}

const FALLBACK_STRENGTH: Record<HapticPrimitive, number> = {
  selection: 1, soft: 2, light: 2, medium: 3, rigid: 4, heavy: 5, warning: 5, success: 6, error: 6,
};

/**
 * expo-haptics fallback: one preset per event (continuous events become one
 * pulse at their start, at their peak intensity), with pulses closer than
 * `minSpacingMs` merged into the strongest (expo-haptics would only play the
 * first anyway). Returns grammar steps for playHaptic / scheduleHaptics.
 */
export function fallbackSteps(p: HapticPatternDef, minSpacingMs = 100): HapticStep[] {
  const sorted = [...p].sort((a, b) => a.t - b.t);
  const out: HapticStep[] = [];
  for (const e of sorted) {
    const peak = e.kind === 'continuous' ? Math.max(e.i, e.iEnd ?? e.i) : e.i;
    const prim = primitiveFor(peak, e.s);
    const last = out[out.length - 1];
    if (last && e.t - last.at < minSpacingMs) {
      if (FALLBACK_STRENGTH[prim] > FALLBACK_STRENGTH[last.p]) last.p = prim;
      continue;
    }
    out.push({ at: e.t, p: prim });
  }
  return out;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export interface AhapJson {
  Version: number;
  Metadata: { Project: string; Created: string; Description: string };
  Pattern: Array<Record<string, unknown>>;
}

/**
 * Compile to Apple's AHAP format (Version 1.0). Times are seconds. A
 * continuous event with iEnd/sEnd gets ParameterCurves for the ramp.
 */
export function toAhap(p: HapticPatternDef, description = ''): AhapJson {
  const pattern: Array<Record<string, unknown>> = [];
  for (const e of p) {
    const params = [
      { ParameterID: 'HapticIntensity', ParameterValue: r3(clamp01(e.i)) },
      { ParameterID: 'HapticSharpness', ParameterValue: r3(clamp01(e.s)) },
    ];
    if (e.kind === 'transient') {
      pattern.push({ Event: { Time: r3(e.t / 1000), EventType: 'HapticTransient', EventParameters: params } });
      continue;
    }
    const dur = Math.max(1, e.dur ?? 100);
    // IntensityControl is a 0..1 multiplier, so a rising ramp sets the event
    // at its peak and starts the curve below 1.
    const peak = Math.max(e.i, e.iEnd ?? e.i);
    params[0] = { ParameterID: 'HapticIntensity', ParameterValue: r3(clamp01(peak)) };
    pattern.push({
      Event: { Time: r3(e.t / 1000), EventType: 'HapticContinuous', EventDuration: r3(dur / 1000), EventParameters: params },
    });
    if (e.iEnd !== undefined && peak > 0) {
      pattern.push({
        ParameterCurve: {
          ParameterID: 'HapticIntensityControl',
          Time: r3(e.t / 1000),
          ParameterCurveControlPoints: [
            { Time: 0, ParameterValue: r3(clamp01(e.i / peak)) },
            { Time: r3(dur / 1000), ParameterValue: r3(clamp01(e.iEnd / peak)) },
          ],
        },
      });
    }
    if (e.sEnd !== undefined) {
      pattern.push({
        ParameterCurve: {
          ParameterID: 'HapticSharpnessControl',
          Time: r3(e.t / 1000),
          ParameterCurveControlPoints: [
            { Time: 0, ParameterValue: 0 },
            { Time: r3(dur / 1000), ParameterValue: r3(Math.max(-1, Math.min(1, e.sEnd - e.s))) },
          ],
        },
      });
    }
  }
  return { Version: 1, Metadata: { Project: 'Theme Park Shark studio', Created: 'gamekit', Description: description }, Pattern: pattern };
}

/** Shift a pattern so its first transient lands `leadMs` later (align to an audio peak). */
export function alignPattern(p: HapticPatternDef, leadMs: number): HapticEvent[] {
  return p.map((e) => ({ ...e, t: e.t + leadMs }));
}
