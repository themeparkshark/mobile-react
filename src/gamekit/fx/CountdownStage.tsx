/**
 * CountdownStage: the 3-2-1-GO every mini-game starts with (wow-games lane).
 *
 * Bubble numbers in the Shark display font (ink drop, thick outline, fill),
 * each slamming down from 1.6 with a squash on landing and a ring blooming
 * behind it; 3 is brand blue, 2 white with a blue outline, 1 gold, and GO
 * pops gold with a white-hot core and eight sparkles. The whole stage is a
 * pure function of one clock shared value (core/gameMoments countPose), so it
 * runs on the UI thread, frame-steps exactly in a clip, and the shell owns the
 * timing (sound, haptics and the frame play opens).
 *
 * Reduced motion: numbers fade in and out with the same timings, no travel,
 * no ring, no sparkles.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { BlurMask, Canvas, Circle, Group, Path, Skia, Text as SkText, type SkFont } from '@shopify/react-native-skia';
import { useDisplayFont } from './displayFont';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { COUNT_STEPS, GO_SPARKLES, countPose, goSparkle, type CountStep } from '../core/gameMoments';
import { GOLD_FX } from '../../ui/motion';

const NUM_PX = 150;
const GO_PX = 136;

export interface CountdownStageProps {
  /** ms since the 3 landed (GO at 2100). Negative hides the stage. */
  clock: SharedValue<number>;
  width: number;
  height: number;
  /** Centre of the numbers (pt from the top of the stage). */
  centerY: number;
  reduced: boolean;
  /** Walking or calm: no kick (the kick itself is applied by the shell). */
  calm: boolean;
  /** Sparkles on GO after the power budget (0 draws none). */
  sparkles?: number;
}

/** A 4-point cartoon sparkle centred on 0,0 with radius 1 (scaled per sparkle). */
function sparklePath() {
  const p = Skia.Path.Make();
  const r = 1;
  const k = 0.28;
  p.moveTo(0, -r);
  p.quadTo(k * 0.4, -k * 0.4, r, 0);
  p.quadTo(k * 0.4, k * 0.4, 0, r);
  p.quadTo(-k * 0.4, k * 0.4, -r, 0);
  p.quadTo(-k * 0.4, -k * 0.4, 0, -r);
  p.close();
  return p;
}

export const CountdownStage = React.memo(function CountdownStage({ clock, width, height, centerY, reduced, calm, sparkles = GO_SPARKLES }: CountdownStageProps) {
  const numFont = useDisplayFont(NUM_PX);
  const goFont = useDisplayFont(GO_PX);
  const pose = useDerivedValue(() => countPose(clock.value, reduced, calm));
  const star = useMemo(sparklePath, []);
  const cx = width / 2;
  const n = Math.max(0, Math.min(GO_SPARKLES, Math.round(sparkles)));
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      {COUNT_STEPS.map((step, i) => (
        <CountGlyph key={step.label} step={step} index={i} font={i === 3 ? goFont : numFont} px={i === 3 ? GO_PX : NUM_PX}
          pose={pose} cx={cx} cy={centerY} />
      ))}
      {Array.from({ length: n }, (_, k) => (
        <GoSparkle key={k} k={k} n={n} pose={pose} cx={cx} cy={centerY} star={star} />
      ))}
    </Canvas>
  );
});

function CountGlyph({ step, index, font, px, pose, cx, cy }: {
  step: CountStep; index: number; font: SkFont | null; px: number;
  pose: SharedValue<ReturnType<typeof countPose>>; cx: number; cy: number;
}) {
  const w = useMemo(() => {
    if (!font) return px * 0.6 * step.label.length;
    try { return font.measureText(step.label).width; } catch { return px * 0.6 * step.label.length; }
  }, [font, px, step.label]);
  const opacity = useDerivedValue(() => (pose.value.index === index ? pose.value.alpha : 0));
  const transform = useDerivedValue(() => {
    const p = pose.value;
    const on = p.index === index;
    const s = on ? p.scale : 1;
    return [
      { translateX: cx }, { translateY: cy },
      { scaleX: s * (on ? p.sx : 1) }, { scaleY: s * (on ? p.sy : 1) },
      { translateX: -w / 2 }, { translateY: px * 0.36 },
    ];
  });
  const ringOpacity = useDerivedValue(() => (pose.value.index === index ? pose.value.ringAlpha : 0));
  const ringR = useDerivedValue(() => (pose.value.index === index ? px * 0.55 * pose.value.ringScale : 0));
  const isGo = index === 3;
  const coreOpacity = useDerivedValue(() => (pose.value.index === index ? pose.value.alpha * 0.85 : 0));
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={ringR} color={step.ring} style="stroke" strokeWidth={10} opacity={ringOpacity} />
      {isGo ? (
        <Circle cx={cx} cy={cy} r={px * 0.62} color={GOLD_FX.core} opacity={coreOpacity}>
          <BlurMask blur={28} style="normal" />
        </Circle>
      ) : null}
      {font ? (
        <Group transform={transform} opacity={opacity}>
          <SkText x={0} y={7} text={step.label} font={font} color={step.ink} style="stroke" strokeWidth={14} strokeJoin="round" opacity={0.5} />
          <SkText x={0} y={0} text={step.label} font={font} color={step.stroke} style="stroke" strokeWidth={14} strokeJoin="round" />
          {isGo ? <SkText x={0} y={0} text={step.label} font={font} color={GOLD_FX.core} style="stroke" strokeWidth={5} strokeJoin="round" /> : null}
          <SkText x={0} y={0} text={step.label} font={font} color={step.fill} />
        </Group>
      ) : null}
    </Group>
  );
}

function GoSparkle({ k, n, pose, cx, cy, star }: {
  k: number; n: number; pose: SharedValue<ReturnType<typeof countPose>>; cx: number; cy: number;
  star: ReturnType<typeof Skia.Path.Make>;
}) {
  const sp = useDerivedValue(() => goSparkle(k, n, pose.value.sparkle));
  const opacity = useDerivedValue(() => (pose.value.index === 3 ? sp.value.alpha : 0));
  const size = 10 + (k % 3) * 4;
  const transform = useDerivedValue(() => [
    { translateX: cx + sp.value.x }, { translateY: cy + sp.value.y },
    { rotate: pose.value.sparkle * 2.4 + k }, { scale: size * sp.value.scale },
  ]);
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={star} color={k % 3 === 0 ? '#ffffff' : GOLD_FX.rays} />
    </Group>
  );
}
