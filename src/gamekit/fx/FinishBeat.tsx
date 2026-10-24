/**
 * FinishBeat: the end-of-round stamp a game hands to its results (wow-games lane, round 3).
 *
 * Built like the last-5 numbers so the end reads as the climax of the same
 * drumroll: the label (FINISH!, TIME!) slams from 1.8 at the last-5 size with
 * the SLAM_SQUASH and one hand-drawn rock, a gold shockwave ring and a thin
 * white ring roll out from it, a capped white flash sits on the landing frame
 * (flashPeak: none with Dim Flashing Lights or Reduce Motion), and a burst of
 * gold and white coin sparkles flies out, falls and fades. Then it holds, so
 * the kid reads it, and fades before the results card.
 *
 * Round 4: the house GoldBurst ray fan opens behind the label (0.8 of GO's), so the end is the
 * brightest frame of the run, and the beat hands off at FINISH_HANDOFF_MS (no dead hold).
 * Round 5: the fan is drawn in this same Skia canvas (the house rays-gold-fade and soft-spot art,
 * tinted like GoldBurst) from the same clock as the label, so it can never lag the label or show
 * after it (the r4 ghost beat came from native image views updating a few frames behind the canvas).
 *
 * Two ways to fire. `fireKey` (JS) mounts the canvas for the beat. `trigger` (a shared value the game
 * bumps on the UI frame its clock hits zero) starts the clock on the UI thread with no JS round trip;
 * pass `armed` while the end is near so the canvas is already mounted, drawing nothing, when it fires.
 * One clock on the UI thread drives every piece (core/gameMoments finishPose).
 *
 *   <FinishBeat trigger={runtime.endTick} armed={lastSeconds} label="FINISH!" width={W} height={H} y={stampY} reduced={rm}
 *     sparkles={momentParticles(FINISH_SPARKLES_MAX, budget, rm)} />
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlendColor, BlurMask, Canvas, Circle, Group, Image as SkImage, Path, Skia, Text as SkText, rect, useImage } from '@shopify/react-native-skia';
import {
  cancelAnimation, Easing, ReduceMotion, runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useDisplayFont } from './displayFont';
import { FINISH_BEAT_MS, FINISH_FAN_OF_GO, FINISH_HANDOFF_MS, FINISH_SPARKLES_MAX, finishPose, finishSparkle } from '../core/gameMoments';
import { GOLD_FX } from '../../ui/motion';

/** Dev capture only: hold the beat on this time (ms) for 6 s so a screenshot shows an exact frame. */
const HOLD_MS = __DEV__ ? Number(process.env.EXPO_PUBLIC_FINISH_HOLD_MS || -1) : -1;

/** The house reveal art for the fan (no new art). */
const RAYS_ART = require('../../../assets/images/reveal/rays-gold-fade.webp');
const SOFT_ART = require('../../../assets/images/reveal/soft-spot.webp');

/** The last-5 number size, so FINISH! lands with the same weight. */
const LABEL_PX = 110;
/** Screen gutters the label never crosses (pt), its outline width, and how much of the inner width it rests at. */
export const FINISH_GUTTER = 16;
const LABEL_OUTLINE = 14;
const REST_OF_GUTTER = 0.86;

export interface FinishBeatProps {
  /** Bump to fire (0 never fires). */
  fireKey?: number;
  /** UI-thread fire: the beat starts on the frame this value changes (and is above 0). */
  trigger?: SharedValue<number>;
  /** Keep the canvas mounted (drawing nothing) so a `trigger` fire lands on its own frame. */
  armed?: boolean;
  /**
   * Called on JS once the beat has started (sound, haptic, clearing other callouts), with the wall clock of
   * the UI frame it fired on, so a busy JS thread can still time the next card from the real fire frame.
   */
  onFire?: (firedAt: number) => void;
  label?: string;
  width: number;
  height: number;
  /** Centre of the stamp (pt from the top of this layer). */
  y: number;
  reduced: boolean;
  /** Coin sparkles after the power budget (capped at FINISH_SPARKLES_MAX). */
  sparkles?: number;
  /** Landing flash peak (flashPeak result, 0 for none). */
  flash?: number;
  /** The rings, flash and sparkles stay below this line (the game's HUD band); the label is never clipped. */
  clipTop?: number;
  /** When the beat hands off (FINISH_HANDOFF_MS, or FINISH_HANDOFF_SHORT_MS for a repeat Burst). */
  handoffMs?: number;
}

function sparkleStar() {
  const p = Skia.Path.Make();
  const k = 0.28 * 0.4;
  p.moveTo(0, -1);
  p.quadTo(k, -k, 1, 0);
  p.quadTo(k, k, 0, 1);
  p.quadTo(-k, k, -1, 0);
  p.quadTo(-k, -k, 0, -1);
  p.close();
  return p;
}

/** Dev capture only: how long a capture hold lasts (EXPO_PUBLIC_DEV_HOLD_FOR_MS, default 6 s). */
const CAPTURE_HOLD_FOR = __DEV__ ? Number(process.env.EXPO_PUBLIC_DEV_HOLD_FOR_MS || 6000) : 6000;
const HOLD = HOLD_MS > 0 && HOLD_MS < FINISH_BEAT_MS;

/** Start the beat's clock (worklet: runs on the trigger frame, or from JS through the shared value). */
function runClock(clock: SharedValue<number>) {
  'worklet';
  cancelAnimation(clock);
  clock.value = 0;
  const lin = { easing: Easing.linear, reduceMotion: ReduceMotion.Never };
  clock.value = HOLD
    ? withSequence(withTiming(HOLD_MS, { duration: HOLD_MS, ...lin }), withTiming(HOLD_MS + 0.01, { duration: CAPTURE_HOLD_FOR, ...lin }),
      withTiming(FINISH_BEAT_MS, { duration: FINISH_BEAT_MS - HOLD_MS, ...lin }))
    : withTiming(FINISH_BEAT_MS, { duration: FINISH_BEAT_MS, ...lin });
}

export const FinishBeat = React.memo(function FinishBeat({
  fireKey = 0, trigger, armed = false, onFire, label = 'FINISH!', width, height, y, reduced, sparkles = 12, flash = 0, clipTop = 0,
  handoffMs = FINISH_HANDOFF_MS,
}: FinishBeatProps) {
  const [live, setLive] = useState(false);
  const clock = useSharedValue(-1);
  const liveFor = FINISH_BEAT_MS + 40 + (HOLD ? CAPTURE_HOLD_FOR : 0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFireRef = React.useRef(onFire);
  onFireRef.current = onFire;
  const fired = React.useCallback((firedAt?: number) => {
    setLive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLive(false), liveFor);
    onFireRef.current?.(typeof firedAt === 'number' ? firedAt : Date.now());
  }, [liveFor]);
  useEffect(() => {
    if (!fireKey) return;
    runClock(clock);
    fired();
  }, [fireKey, clock, fired]);
  // The UI-thread fire: the clock starts on the very frame the game's clock hits zero.
  useAnimatedReaction(
    () => (trigger ? trigger.value : 0),
    (v, prev) => {
      if (prev == null || v === prev || v <= 0) return;
      runClock(clock);
      runOnJS(fired)(Date.now());
    },
    [trigger],
  );
  useEffect(() => () => { cancelAnimation(clock); if (timer.current) clearTimeout(timer.current); }, [clock]);
  if (!live && !armed) return null;
  return <FinishCanvas clock={clock} label={label} width={width} height={height} y={y} reduced={reduced} sparkles={sparkles} flash={flash} clipTop={clipTop} handoff={handoffMs} />;
});

/**
 * Memoized (r5): the fire re-renders FinishBeat (live) and the game (its callouts clear), and a Skia tree
 * re-reconciled on a busy JS thread could drop the label for a few frames mid-beat. With stable props the
 * canvas never re-renders once mounted; every frame of the beat comes from the UI-thread clock.
 */
const FinishCanvas = React.memo(function FinishCanvas({ clock, label, width, height, y, reduced, sparkles, flash, clipTop, handoff }: {
  clock: SharedValue<number>; label: string; width: number; height: number; y: number; reduced: boolean; sparkles: number; flash: number; clipTop: number; handoff: number;
}) {
  const clip = useMemo(() => rect(0, clipTop, width, Math.max(0, height - clipTop)), [clipTop, width, height]);
  const font = useDisplayFont(LABEL_PX);
  const star = useMemo(sparkleStar, []);
  const raw = useMemo(() => {
    try { return font ? font.measureText(label).width : LABEL_PX * 0.62 * label.length; } catch { return LABEL_PX * 0.62 * label.length; }
  }, [font, label]);
  // Never cut off (r6): the word rests at REST_OF_GUTTER of the width inside the 16 pt gutters, and the slam's
  // overshoot is capped so the whole word plus its 14 pt outline stays inside them on every frame (r5 showed a
  // clipped FNISH for 2 frames). The extra energy goes into the ray fan's swell instead.
  const inner = Math.max(1, width - 2 * FINISH_GUTTER);
  const fit = Math.min(1, (inner * REST_OF_GUTTER) / Math.max(1, (raw + LABEL_OUTLINE) * 1.12));
  const maxK = inner / Math.max(1, raw + LABEL_OUTLINE);
  const cx = width / 2;
  const pose = useDerivedValue(() => finishPose(clock.value, reduced, handoff));
  const labelT = useDerivedValue(() => {
    const p = pose.value;
    const kx = p.scale * p.sx * fit;
    const cap = kx > maxK ? maxK / kx : 1;
    return [
      { translateX: cx }, { translateY: y }, { rotate: p.rot },
      { scaleX: kx * cap }, { scaleY: p.scale * p.sy * fit * cap },
      { translateX: -raw / 2 }, { translateY: LABEL_PX * 0.36 },
    ];
  });
  const labelA = useDerivedValue(() => pose.value.alpha);
  const ringR = useDerivedValue(() => pose.value.ringR);
  const ringA = useDerivedValue(() => pose.value.ringA);
  const ring2R = useDerivedValue(() => pose.value.ring2R);
  const ring2A = useDerivedValue(() => pose.value.ring2A);
  const flashA = useDerivedValue(() => flash * pose.value.flash);
  const raysImg = useImage(RAYS_ART);
  const softImg = useImage(SOFT_ART);
  // The fan, glow and core on the canvas's own clock (always in step with the label). r6: the landing swell
  // (bloom, the first 320 ms) pushes the rays to full and the core bloom up to GO's strength, so FINISH! is the
  // brightest still of the run; Dim Flashing Lights and Reduce Motion (flash 0) keep a softer swell.
  const swell = flash > 0 ? 1 : 0.4;
  const glowA = useDerivedValue(() => Math.min(1, 0.95 * pose.value.gold + 0.35 * swell * pose.value.bloom));
  const raysA = useDerivedValue(() => Math.min(1, pose.value.gold + 0.25 * swell * pose.value.bloom));
  const coreA = useDerivedValue(() => Math.min(1, 0.7 * pose.value.gold + 0.9 * swell * pose.value.bloom));
  const glowT = useDerivedValue(() => [{ translateX: cx }, { translateY: y }, { scale: 0.55 + 0.45 * pose.value.gold + 0.35 * pose.value.bloom }]);
  const raysT = useDerivedValue(() => [{ translateX: cx }, { translateY: y }, { scale: 0.5 + 0.5 * pose.value.gold + 0.22 * pose.value.bloom }]);
  const coreT = useDerivedValue(() => [{ translateX: cx }, { translateY: y }, { scale: 0.8 + 0.6 * pose.value.bloom }]);
  const n = reduced ? 0 : Math.max(0, Math.min(FINISH_SPARKLES_MAX, Math.round(sparkles)));
  // GO's fan is 1.3 screen widths; FINISH!'s is 0.8 of that, clipped below the HUD like the rings.
  const fan = Math.round(width * 1.3 * FINISH_FAN_OF_GO);
  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Group clip={clip}>
      {!reduced && font && raysImg && softImg ? (
        <Group>
          <Group transform={glowT} opacity={glowA}>
            <SkImage image={softImg} x={-fan / 2} y={-fan / 2} width={fan} height={fan} fit="fill">
              <BlendColor color={GOLD_FX.glow} mode="srcIn" />
            </SkImage>
          </Group>
          <Group transform={raysT} opacity={raysA}>
            <SkImage image={raysImg} x={-fan / 2} y={-fan / 2} width={fan} height={fan} fit="fill">
              <BlendColor color={GOLD_FX.rays} mode="srcIn" />
            </SkImage>
          </Group>
          <Group transform={coreT} opacity={coreA}>
            <SkImage image={softImg} x={-fan * 0.21} y={-fan * 0.21} width={fan * 0.42} height={fan * 0.42} fit="fill">
              <BlendColor color={GOLD_FX.core} mode="srcIn" />
            </SkImage>
          </Group>
        </Group>
      ) : null}
      {flash > 0 ? (
        <Circle cx={cx} cy={y} r={120} color="#ffffff" opacity={flashA}>
          <BlurMask blur={36} style="normal" />
        </Circle>
      ) : null}
      {reduced ? null : (
        <Group>
          <Circle cx={cx} cy={y} r={ringR} color={GOLD_FX.rays} style="stroke" strokeWidth={10} opacity={ringA} />
          <Circle cx={cx} cy={y} r={ring2R} color="#ffffff" style="stroke" strokeWidth={4} opacity={ring2A} />
        </Group>
      )}
      {Array.from({ length: n }, (_, k) => <Spark key={k} k={k} n={n} clock={clock} cx={cx} cy={y} star={star} handoff={handoff} />)}
      </Group>
      {font ? (
        <Group transform={labelT} opacity={labelA}>
          <SkText x={0} y={6} text={label} font={font} color="#05346e" style="stroke" strokeWidth={14} strokeJoin="round" opacity={0.5} />
          <SkText x={0} y={0} text={label} font={font} color="#7a4300" style="stroke" strokeWidth={14} strokeJoin="round" />
          <SkText x={0} y={0} text={label} font={font} color={GOLD_FX.core} style="stroke" strokeWidth={5} strokeJoin="round" />
          <SkText x={0} y={0} text={label} font={font} color={GOLD_FX.rays} />
        </Group>
      ) : null}
    </Canvas>
    </View>
  );
});

function Spark({ k, n, clock, cx, cy, star, handoff }: {
  k: number; n: number; clock: SharedValue<number>; cx: number; cy: number; star: ReturnType<typeof Skia.Path.Make>; handoff: number;
}) {
  const sp = useDerivedValue(() => finishSparkle(k, n, clock.value, handoff));
  const size = 9 + (k % 3) * 4;
  const transform = useDerivedValue(() => [
    { translateX: cx + sp.value.x }, { translateY: cy + sp.value.y }, { rotate: sp.value.rot }, { scale: size * sp.value.scale },
  ]);
  const opacity = useDerivedValue(() => sp.value.alpha);
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={star} color={k % 3 === 0 ? '#ffffff' : GOLD_FX.rays} />
    </Group>
  );
}
