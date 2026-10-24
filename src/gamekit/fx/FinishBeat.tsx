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
import { BlurMask, Canvas, Circle, Group, Path, Skia, Text as SkText, rect } from '@shopify/react-native-skia';
import {
  cancelAnimation, Easing, ReduceMotion, runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useDisplayFont } from './displayFont';
import { FINISH_BEAT_MS, FINISH_FAN_OF_GO, FINISH_SPARKLES_MAX, finishPose, finishSparkle } from '../core/gameMoments';
import { GOLD_FX } from '../../ui/motion';
import { GoldBurst } from '../../ui/GoldBurst';

/** Dev capture only: hold the beat on this time (ms) for 6 s so a screenshot shows an exact frame. */
const HOLD_MS = __DEV__ ? Number(process.env.EXPO_PUBLIC_FINISH_HOLD_MS || -1) : -1;

/** The last-5 number size, so FINISH! lands with the same weight. */
const LABEL_PX = 110;

export interface FinishBeatProps {
  /** Bump to fire (0 never fires). */
  fireKey?: number;
  /** UI-thread fire: the beat starts on the frame this value changes (and is above 0). */
  trigger?: SharedValue<number>;
  /** Keep the canvas mounted (drawing nothing) so a `trigger` fire lands on its own frame. */
  armed?: boolean;
  /** Called on JS once the beat has started (sound, haptic, clearing other callouts). */
  onFire?: () => void;
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
}: FinishBeatProps) {
  const [live, setLive] = useState(false);
  const clock = useSharedValue(-1);
  const liveFor = FINISH_BEAT_MS + 40 + (HOLD ? CAPTURE_HOLD_FOR : 0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFireRef = React.useRef(onFire);
  onFireRef.current = onFire;
  const fired = React.useCallback(() => {
    setLive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLive(false), liveFor);
    onFireRef.current?.();
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
      runOnJS(fired)();
    },
    [trigger],
  );
  useEffect(() => () => { cancelAnimation(clock); if (timer.current) clearTimeout(timer.current); }, [clock]);
  if (!live && !armed) return null;
  return <FinishCanvas clock={clock} label={label} width={width} height={height} y={y} reduced={reduced} sparkles={sparkles} flash={flash} clipTop={clipTop} />;
});

function FinishCanvas({ clock, label, width, height, y, reduced, sparkles, flash, clipTop }: {
  clock: SharedValue<number>; label: string; width: number; height: number; y: number; reduced: boolean; sparkles: number; flash: number; clipTop: number;
}) {
  const clip = useMemo(() => rect(0, clipTop, width, Math.max(0, height - clipTop)), [clipTop, width, height]);
  const font = useDisplayFont(LABEL_PX);
  const star = useMemo(sparkleStar, []);
  const raw = useMemo(() => {
    try { return font ? font.measureText(label).width : LABEL_PX * 0.62 * label.length; } catch { return LABEL_PX * 0.62 * label.length; }
  }, [font, label]);
  // Never cut off: shrink to fit with room for the overshoot and the outline.
  const fit = Math.min(1, (width - 32) / Math.max(1, raw * 1.12));
  const cx = width / 2;
  const pose = useDerivedValue(() => finishPose(clock.value, reduced));
  const labelT = useDerivedValue(() => {
    const p = pose.value;
    return [
      { translateX: cx }, { translateY: y }, { rotate: p.rot },
      { scaleX: p.scale * p.sx * fit }, { scaleY: p.scale * p.sy * fit },
      { translateX: -raw / 2 }, { translateY: LABEL_PX * 0.36 },
    ];
  });
  const labelA = useDerivedValue(() => pose.value.alpha);
  const ringR = useDerivedValue(() => pose.value.ringR);
  const ringA = useDerivedValue(() => pose.value.ringA);
  const ring2R = useDerivedValue(() => pose.value.ring2R);
  const ring2A = useDerivedValue(() => pose.value.ring2A);
  const flashA = useDerivedValue(() => flash * pose.value.flash);
  const gold = useDerivedValue(() => pose.value.gold);
  const bloom = useDerivedValue(() => pose.value.bloom);
  const n = reduced ? 0 : Math.max(0, Math.min(FINISH_SPARKLES_MAX, Math.round(sparkles)));
  // GO's fan is 1.3 screen widths; FINISH!'s is 0.8 of that, clipped below the HUD like the rings.
  const fan = Math.round(width * 1.3 * FINISH_FAN_OF_GO);
  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
    {reduced ? null : (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: clipTop, bottom: 0, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: cx - fan / 2, top: y - clipTop - fan / 2, width: fan, height: fan }}>
          <GoldBurst size={fan} amount={gold as never} bloom={bloom as never} spin={false} reduced={reduced} />
        </View>
      </View>
    )}
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Group clip={clip}>
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
      {Array.from({ length: n }, (_, k) => <Spark key={k} k={k} n={n} clock={clock} cx={cx} cy={y} star={star} />)}
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
}

function Spark({ k, n, clock, cx, cy, star }: {
  k: number; n: number; clock: SharedValue<number>; cx: number; cy: number; star: ReturnType<typeof Skia.Path.Make>;
}) {
  const sp = useDerivedValue(() => finishSparkle(k, n, clock.value));
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
