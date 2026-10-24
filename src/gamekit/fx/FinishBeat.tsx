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
 * Mounted only for the beat (about 1.5 s): nothing draws before or after it.
 * One clock on the UI thread drives every piece (core/gameMoments finishPose).
 *
 *   const [finishKey, setFinishKey] = useState(0);
 *   <FinishBeat fireKey={finishKey} label="FINISH!" width={W} height={H} y={stampY} reduced={rm} sparkles={12} />
 *   setFinishKey((k) => k + 1); // fire
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { BlurMask, Canvas, Circle, Group, Path, Skia, Text as SkText } from '@shopify/react-native-skia';
import { cancelAnimation, Easing, ReduceMotion, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useDisplayFont } from './displayFont';
import { FINISH_BEAT_MS, FINISH_SPARKLES_MAX, finishPose, finishSparkle } from '../core/gameMoments';
import { GOLD_FX } from '../../ui/motion';

/** The last-5 number size, so FINISH! lands with the same weight. */
const LABEL_PX = 110;

export interface FinishBeatProps {
  /** Bump to fire (0 never fires). */
  fireKey: number;
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

export const FinishBeat = React.memo(function FinishBeat({ fireKey, label = 'FINISH!', width, height, y, reduced, sparkles = 12, flash = 0 }: FinishBeatProps) {
  const [live, setLive] = useState(false);
  const clock = useSharedValue(-1);
  useEffect(() => {
    if (!fireKey) return undefined;
    setLive(true);
    cancelAnimation(clock);
    clock.value = 0;
    clock.value = withTiming(FINISH_BEAT_MS, { duration: FINISH_BEAT_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    const id = setTimeout(() => setLive(false), FINISH_BEAT_MS + 40);
    return () => clearTimeout(id);
  }, [fireKey, clock]);
  useEffect(() => () => cancelAnimation(clock), [clock]);
  if (!live) return null;
  return <FinishCanvas clock={clock} label={label} width={width} height={height} y={y} reduced={reduced} sparkles={sparkles} flash={flash} />;
});

function FinishCanvas({ clock, label, width, height, y, reduced, sparkles, flash }: {
  clock: SharedValue<number>; label: string; width: number; height: number; y: number; reduced: boolean; sparkles: number; flash: number;
}) {
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
  const n = reduced ? 0 : Math.max(0, Math.min(FINISH_SPARKLES_MAX, Math.round(sparkles)));
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
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
      {font ? (
        <Group transform={labelT} opacity={labelA}>
          <SkText x={0} y={6} text={label} font={font} color="#05346e" style="stroke" strokeWidth={14} strokeJoin="round" opacity={0.5} />
          <SkText x={0} y={0} text={label} font={font} color="#7a4300" style="stroke" strokeWidth={14} strokeJoin="round" />
          <SkText x={0} y={0} text={label} font={font} color={GOLD_FX.core} style="stroke" strokeWidth={5} strokeJoin="round" />
          <SkText x={0} y={0} text={label} font={font} color={GOLD_FX.rays} />
        </Group>
      ) : null}
    </Canvas>
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
