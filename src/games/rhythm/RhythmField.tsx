/**
 * RhythmField.tsx — the Skia play field + the timing judge.
 *
 * ── HOW MILLISECOND ACCURACY IS ACHIEVED ────────────────────────────────────
 * There is ONE authoritative clock: `clockMs`, a SharedValue advanced every
 * frame inside a useGameLoop update worklet by the loop's FIXED dt. The exact
 * same clock drives (a) each ring's shrinking radius, (b) the metronome beat
 * index, and (c) the tap judgment. Because the ring animation and the judgment
 * read the identical value, "tap when the ring meets the target" is judged
 * against the ring's own animation clock — not wall time.
 *
 * The tap is judged INSIDE the Gesture.Tap worklet, which runs on the UI thread
 * synchronously with rendering. It samples `clockMs.value` at the frame the
 * touch lands and computes `abs(clockMs - target.hitTimeMs)`. No JS-thread
 * Date.now(), no bridge hop, no setState latency between the gesture and the
 * measurement — the number is the true visual/audio offset in ms. Only AFTER
 * the worklet has the verdict does it runOnJS() the result to the score reducer.
 *
 * AUDIO: no music files exist yet, so the beat is delivered as a SILENT
 * METRONOME — Haptic.tickSelection on every beat + a pulsing beat bar. SFX hook
 * points are pre-wired (playSfx('tick' | 'hit' | 'combo' | 'fail')) and no-op
 * silently until audio assets land (src/assets/games/sfx/manifest.ts). When a
 * bundled 100bpm loop drops in, see the HOOK POINT comment on `onBeat` below.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Canvas, Circle, Group, Image, useImage } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useGameLoop } from '../../gamekit';
import {
  APPROACH_MS,
  BEAT_MS,
  JUDGMENT_BY_CODE,
  JUDGMENT_CODE,
  MISS_GRACE_MS,
  RHYTHM_COLORS,
  RING_START_SCALE,
  RING_STROKE,
  TARGET_RADIUS,
  WINDOW,
  type Judgment,
} from './constants';
import type { RoundPlan, Target } from './patterns';
import { RING_IMAGE } from './assets';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** UI-thread mirror of a target: position + timing + hit flag. */
interface FieldTarget {
  id: number;
  hitTimeMs: number;
  spawnMs: number;
  x: number;
  y: number;
  /** 0 = live, 1 = resolved (hit or missed) — mutated in the judge worklet. */
  done: number;
}

interface RhythmFieldProps {
  plan: RoundPlan;
  active: boolean;
  fever: boolean;
  /** Called (JS thread) with the verdict for a tap or an auto-miss. */
  onJudge: (judgment: Judgment, deltaMs: number, targetId: number) => void;
  /** Called (JS thread) once per metronome beat (index from 0). */
  onBeat: (beatIndex: number) => void;
  /** Called (JS thread) when the round's clock passes endMs. */
  onFinished: () => void;
  /** Ref to a ParticleField-style burst callback for hit feedback. */
  emitBurst?: (x: number, y: number, judgment: Judgment) => void;
}

/**
 * Lay targets out across the playable area on a gentle deterministic path so
 * consecutive taps move a little (keeps it lively) but stay in the single
 * one-thumb zone (center band, reachable, portrait).
 */
function layoutTargets(plan: RoundPlan): FieldTarget[] {
  const cx = SCREEN_W / 2;
  const cy = SCREEN_H * 0.46;
  // Keep the full approach ring on-screen, including its first large frame.
  const spreadX = Math.min(SCREEN_W * 0.10,
    Math.max(0, cx - TARGET_RADIUS * RING_START_SCALE - 12));
  const spreadY = SCREEN_H * 0.14;
  return plan.targets.map((t: Target, i: number) => {
    // Lissajous-ish placement keyed to index → smooth, deterministic wandering.
    const a = i * 0.9;
    return {
      id: t.id,
      hitTimeMs: t.hitTimeMs,
      spawnMs: t.spawnMs,
      x: cx + Math.sin(a) * spreadX,
      y: cy + Math.sin(a * 0.6 + 1.1) * spreadY,
      done: 0,
    };
  });
}

export function RhythmField({
  plan,
  active,
  fever,
  onJudge,
  onBeat,
  onFinished,
  emitBurst,
}: RhythmFieldProps) {
  // -- Authoritative clock (ms). Advanced by the loop's fixed dt. -------------
  const clockMs = useSharedValue(0);
  // Targets live on the UI thread so the judge worklet can mutate `done`.
  const fieldTargets = useMemo(() => layoutTargets(plan), [plan]);
  const targetsSv = useSharedValue<FieldTarget[]>(fieldTargets);
  // Keep the SharedValue in sync if the plan changes (new round).
  useEffect(() => {
    targetsSv.value = layoutTargets(plan);
    clockMs.value = 0;
    lastBeatSv.value = -1;
    finishedSv.value = 0;
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const endMs = plan.endMs;
  const lastBeatSv = useSharedValue(-1);
  const finishedSv = useSharedValue(0);
  const feverSv = useSharedValue(fever ? 1 : 0);
  useEffect(() => {
    feverSv.value = fever ? 1 : 0;
  }, [fever, feverSv]);

  // -- The fixed-timestep loop advances the clock and auto-misses stragglers. -
  const loop = useGameLoop({
    update: (dt: number) => {
      'worklet';
      clockMs.value += dt * 1000;

      // Auto-miss: any live target whose beat + grace has passed.
      const now = clockMs.value;
      const list = targetsSv.value;
      for (let i = 0; i < list.length; i++) {
        const tg = list[i];
        if (tg.done === 0 && now - tg.hitTimeMs > MISS_GRACE_MS) {
          tg.done = 1;
          runOnJS(onJudge)('miss', now - tg.hitTimeMs, tg.id);
        }
      }

      // End of round.
      if (finishedSv.value === 0 && now >= endMs) {
        finishedSv.value = 1;
        runOnJS(onFinished)();
      }
    },
    autostart: active,
  });

  // Keep the loop's paused state in sync with the shell.
  useEffect(() => {
    if (active) loop.resume();
    else loop.pause();
  }, [active, loop]);

  // -- Metronome: fire onBeat as the clock crosses each beat boundary. --------
  // The FIRST audible/haptic beat is at t=0 (start of the count-in). Targets
  // begin after LEAD_IN_BEATS so players feel the tempo before they must act.
  useAnimatedReaction(
    () => Math.floor(clockMs.value / BEAT_MS),
    (beat, prev) => {
      'worklet';
      if (prev == null || beat === prev) return;
      if (beat < 0) return;
      lastBeatSv.value = beat;
      // HOOK POINT (bundled 100bpm loop): when a music track lands, START it
      // exactly here on beat 0 (or seek it to beat*BEAT_MS on resume) so the
      // metronome and the loop share this same clock. The silent metronome
      // below then becomes a redundant tick you can gate behind a flag.
      runOnJS(onBeat)(beat);
    },
  );

  // -- Tap judge (UI-thread worklet). ----------------------------------------
  const doEmit = useCallback(
    (x: number, y: number, code: number) => {
      const j = JUDGMENT_BY_CODE[code] ?? 'miss';
      emitBurst?.(x, y, j);
    },
    [emitBurst],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(400)
        .onStart(() => {
          'worklet';
          // Sample the SAME clock the rings are drawn from, at tap frame.
          const now = clockMs.value;
          const list = targetsSv.value;

          // Find the live target whose beat is closest to `now`.
          let best = -1;
          let bestAbs = Infinity;
          for (let i = 0; i < list.length; i++) {
            const tg = list[i];
            if (tg.done === 1) continue;
            // Only consider targets currently on screen (ring visible).
            if (now < tg.spawnMs - 20) continue;
            const d = Math.abs(now - tg.hitTimeMs);
            if (d < bestAbs) {
              bestAbs = d;
              best = i;
            }
          }

          if (best < 0) return; // tapped into empty air — ignore, no penalty.

          const tg = list[best];
          const signed = now - tg.hitTimeMs; // + = late, - = early
          let code: number;
          if (bestAbs <= WINDOW.perfect) code = JUDGMENT_CODE.perfect;
          else if (bestAbs <= WINDOW.great) code = JUDGMENT_CODE.great;
          else if (bestAbs <= WINDOW.good) code = JUDGMENT_CODE.good;
          else code = JUDGMENT_CODE.miss;

          if (code === JUDGMENT_CODE.miss) {
            // Too far from any target to count as a hit — ignore the tap so a
            // wild early tap doesn't nuke a streak the player could still land.
            // (Auto-miss in the loop handles genuinely skipped targets.)
            return;
          }

          tg.done = 1;
          const jname = JUDGMENT_BY_CODE[code];
          runOnJS(onJudge)(jname, signed, tg.id);
          runOnJS(doEmit)(tg.x, tg.y, code);
        }),
    [onJudge, doEmit], // clockMs / targetsSv are stable SharedValues
  );

  // Optional bundled ring texture. null while loading / if unavailable → each
  // TargetRing falls back to its crisp procedural Skia stroke, so the field is
  // always fully playable regardless of asset state.
  const ringImage = useImage(RING_IMAGE ?? undefined);

  return (
    <GestureDetector gesture={tap}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          {fieldTargets.map((tg) => (
            <TargetRing
              key={tg.id}
              target={tg}
              clockMs={clockMs}
              feverSv={feverSv}
              ringImage={ringImage}
            />
          ))}
        </Canvas>
      </View>
    </GestureDetector>
  );
}

// =============================================================================
// A single target: a static hit-zone ring + the shrinking approach ring.
// All motion is derived from `clockMs` on the UI thread — no JS re-renders.
// =============================================================================

const RING_START_RADIUS = TARGET_RADIUS * RING_START_SCALE;

function TargetRing({
  target,
  clockMs,
  feverSv,
  ringImage,
}: {
  target: FieldTarget;
  clockMs: SharedValue<number>;
  feverSv: SharedValue<number>;
  ringImage: ReturnType<typeof useImage>;
}) {
  // Approach ring radius: RING_START at spawn → TARGET_RADIUS at hitTime.
  const approachRadius = useDerivedValue(() => {
    const now = clockMs.value;
    const t = (now - target.spawnMs) / APPROACH_MS; // 0 at spawn, 1 at hit
    if (t < 0 || t > 1.35) return 0; // hidden before spawn / well after
    const r = RING_START_RADIUS + (TARGET_RADIUS - RING_START_RADIUS) * Math.min(t, 1);
    return r;
  }, [target]);

  // Textured-ring geometry (Skia <Image> takes x/y/width/height, not r).
  const imgSize = useDerivedValue(() => approachRadius.value * 2, [target]);
  const imgX = useDerivedValue(() => target.x - approachRadius.value, [target]);
  const imgY = useDerivedValue(() => target.y - approachRadius.value, [target]);

  const approachOpacity = useDerivedValue(() => {
    const now = clockMs.value;
    const t = (now - target.spawnMs) / APPROACH_MS;
    if (t < 0) return 0;
    if (t <= 1) return Math.min(1, t * 3); // quick fade-in
    return Math.max(0, 1 - (t - 1) / 0.35); // fade out just after the beat
  }, [target]);

  // Hit-zone target: gentle presence only while its ring is on screen.
  const targetOpacity = useDerivedValue(() => {
    const now = clockMs.value;
    const t = (now - target.spawnMs) / APPROACH_MS;
    if (t < 0 || t > 1.35) return 0;
    return 0.9;
  }, [target]);

  const ringColor = useDerivedValue(() =>
    feverSv.value === 1 ? RHYTHM_COLORS.perfect : RHYTHM_COLORS.ring,
  );

  const fillOpacity = useDerivedValue(() => targetOpacity.value * 0.18, [target]);

  return (
    <Group>
      {/* Static hit zone the ring shrinks down to meet. */}
      <Circle
        cx={target.x}
        cy={target.y}
        r={TARGET_RADIUS}
        color={RHYTHM_COLORS.target}
        style="stroke"
        strokeWidth={3}
        opacity={targetOpacity}
      />
      <Circle
        cx={target.x}
        cy={target.y}
        r={TARGET_RADIUS - 6}
        color={RHYTHM_COLORS.target}
        opacity={fillOpacity}
      />
      {/* Shrinking approach ring — textured when the asset is loaded, else a
          crisp procedural stroke (identical timing feel either way). */}
      {ringImage ? (
        <Image
          image={ringImage}
          x={imgX}
          y={imgY}
          width={imgSize}
          height={imgSize}
          fit="contain"
          opacity={approachOpacity}
        />
      ) : (
        <Circle
          cx={target.x}
          cy={target.y}
          r={approachRadius}
          color={ringColor}
          style="stroke"
          strokeWidth={RING_STROKE}
          opacity={approachOpacity}
        />
      )}
    </Group>
  );
}
