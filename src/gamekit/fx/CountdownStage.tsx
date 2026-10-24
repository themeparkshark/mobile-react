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
 * GO is the money frame (round 3): it pops to GO_PEAK over a gold ray fan
 * (the house GoldBurst, 1.3 screen widths), holds one beat at full size with
 * a capped white flash, then bursts: the fan blooms and the sparkles fly out
 * toward the play field. A soft light sits behind each number instead of a
 * dark wash, so the start stays bright.
 *
 * Reduced motion: numbers fade in and out with the same timings, no travel,
 * no ring, no sparkles, no fan. The flash is zero with Dim Flashing Lights.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurMask, Canvas, Circle, Group, Path, RadialGradient, RoundedRect, Skia, Text as SkText, vec, type SkFont } from '@shopify/react-native-skia';
import { useDisplayFont } from './displayFont';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { CONFETTI_COLORS, COUNT_STEPS, PARTICLE_MAX_CONFETTI, RARE_GO_SPARKLES, countPose, goConfetti, goSparkle, type CountStep } from '../core/gameMoments';
import { GOLD_FX } from '../../ui/motion';
import { GoldBurst } from '../../ui/GoldBurst';

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
  /** A rare GO: a second gold ring and a confetti pop. */
  rare?: boolean;
  /** Confetti pieces on a rare GO after the power budget. */
  confetti?: number;
  /** The held-beat flash peak (flashPeak: 0 with Dim Flashing Lights or Reduce Motion). */
  flash?: number;
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

export const CountdownStage = React.memo(function CountdownStage({ clock, width, height, centerY, reduced, calm, sparkles = 8, rare = false, confetti = 0, flash = 0 }: CountdownStageProps) {
  const numFont = useDisplayFont(NUM_PX);
  const goFont = useDisplayFont(GO_PX);
  const pose = useDerivedValue(() => countPose(clock.value, reduced, calm));
  const star = useMemo(sparklePath, []);
  const cx = width / 2;
  const n = Math.max(0, Math.min(RARE_GO_SPARKLES, Math.round(sparkles)));
  const nc = rare && !reduced ? Math.max(0, Math.min(PARTICLE_MAX_CONFETTI, Math.round(confetti))) : 0;
  const rareRingR = useDerivedValue(() => (pose.value.index === 3 ? GO_PX * 0.55 * (0.4 + 2.4 * Math.min(1, pose.value.sparkle * 1.4)) : 0));
  const rareRingA = useDerivedValue(() => (pose.value.index === 3 ? 0.8 * (1 - Math.min(1, pose.value.sparkle * 1.4)) : 0));
  // A soft light behind each number (the scrim is a pale tint, never a dark wash).
  const lightA = useDerivedValue(() => (pose.value.index >= 0 && pose.value.index < 3 ? 0.6 * pose.value.alpha : 0));
  // GO's gold fan and its burst swell, on the UI thread from the same clock.
  const gold = useDerivedValue(() => (pose.value.index === 3 ? pose.value.gold : 0));
  const bloom = useDerivedValue(() => (pose.value.index === 3 ? pose.value.bloom : 0));
  const flashA = useDerivedValue(() => (pose.value.index === 3 ? flash * pose.value.flash : 0));
  const fan = Math.round(width * 1.3);
  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
    {reduced ? null : (
      <View pointerEvents="none" style={{ position: 'absolute', left: cx - fan / 2, top: centerY - fan / 2, width: fan, height: fan }}>
        <GoldBurst size={fan} amount={gold as never} bloom={bloom as never} spin={false} reduced={reduced} />
      </View>
    )}
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Circle cx={cx} cy={centerY} r={NUM_PX * 1.15} opacity={lightA}>
        <RadialGradient c={vec(cx, centerY)} r={NUM_PX * 1.15} colors={['rgba(255,255,255,0.85)', 'rgba(220,242,255,0.35)', 'rgba(220,242,255,0)']} positions={[0, 0.55, 1]} />
      </Circle>
      {flash > 0 ? (
        <Circle cx={cx} cy={centerY} r={GO_PX * 1.1} color="#ffffff" opacity={flashA}>
          <BlurMask blur={34} style="normal" />
        </Circle>
      ) : null}
      {COUNT_STEPS.map((step, i) => (
        <CountGlyph key={step.label} step={step} index={i} font={i === 3 ? goFont : numFont} px={i === 3 ? GO_PX : NUM_PX}
          pose={pose} cx={cx} cy={centerY} glow={flash > 0} />
      ))}
      {rare && !reduced ? <Circle cx={cx} cy={centerY} r={rareRingR} color={GOLD_FX.rays} style="stroke" strokeWidth={6} opacity={rareRingA} /> : null}
      {Array.from({ length: nc }, (_, k) => (
        <GoConfettiPiece key={`c${k}`} k={k} n={nc} pose={pose} cx={cx} cy={centerY} />
      ))}
      {Array.from({ length: n }, (_, k) => (
        <GoSparkle key={k} k={k} n={n} pose={pose} cx={cx} cy={centerY} star={star} />
      ))}
    </Canvas>
    </View>
  );
});

function CountGlyph({ step, index, font, px, pose, cx, cy, glow }: {
  step: CountStep; index: number; font: SkFont | null; px: number;
  pose: SharedValue<ReturnType<typeof countPose>>; cx: number; cy: number;
  /** The white-hot blurred core behind GO (off with Dim Flashing Lights or Reduce Motion). */
  glow: boolean;
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
      { rotate: on ? p.rot : 0 },
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
      {isGo && glow ? (
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

function GoConfettiPiece({ k, n, pose, cx, cy }: {
  k: number; n: number; pose: SharedValue<ReturnType<typeof countPose>>; cx: number; cy: number;
}) {
  const c = useDerivedValue(() => goConfetti(k, n, pose.value.sparkle));
  const opacity = useDerivedValue(() => (pose.value.index === 3 ? c.value.alpha : 0));
  const transform = useDerivedValue(() => [
    { translateX: cx + c.value.x }, { translateY: cy + c.value.y }, { rotate: c.value.rot },
  ]);
  const w = 7 + (k % 3) * 2;
  return (
    <Group transform={transform} opacity={opacity}>
      <RoundedRect x={-w / 2} y={-3} width={w} height={6} r={2} color={CONFETTI_COLORS[k % 3]} />
    </Group>
  );
}
