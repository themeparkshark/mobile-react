/**
 * FinalSeconds: the last 5 seconds of a timed mini-game (wow-games lane).
 *
 * A gold drumroll, never a threat: a soft gold edge breathes once a second
 * (never red), each second slams into the open play space at 110 pt with a
 * squash and a hand-drawn rock, a gold ring around it closes like a clock
 * hand over that second, and at 0 a gold TIME! slams down. The 1 holds at full
 * strength until TIME! replaces it. The shell plays the tick, the haptic and
 * the whistle (core/gameMoments finalSecondsBeat); this layer only draws, on
 * the UI thread, from one clock that restarts each second.
 *
 * Reduced motion: no breathing and no stamp travel; the number and TIME!
 * simply appear, the colour shift and the sound stay. Battery Saver (calm
 * with no ambient budget) drops the breathing edge, keeps the numbers.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, Group, Path, Rect, RadialGradient, Skia, Text as SkText, vec } from '@shopify/react-native-skia';
import { useDisplayFont } from './displayFont';
import { cancelAnimation, Easing, ReduceMotion, runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { FINAL_COLOR, FINAL_SECONDS, finalStampPose, finalVignette } from '../core/gameMoments';
import { GOLD_FX, flashPeak } from '../../ui/motion';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';

/** With a UI clock, the canvas mounts only this close to the end (one crossing to React, then nothing per frame before it). */
export const FINAL_MOUNT_MS = 6000;

const NUM_PX = 110;
const TIME_PX = 104;
const RING_R = 70;

export interface FinalSecondsProps {
  secondsLeft: number | null | undefined;
  /**
   * Optional UI-thread clock: ms left on the round. When given, the stamps are drawn straight from
   * it (frame-exact with a timer drawn on the UI thread, no JS lag on a busy phone); secondsLeft
   * still drives the shell's sound and haptics.
   */
  remainingMs?: SharedValue<number> | null;
  /** Draw TIME! at 0 (false when the game ends on its own banner). Default true. */
  timeStamp?: boolean;
  width: number;
  height: number;
  /** Where the second stamps (pt from the top). */
  stampY: number;
  reduced: boolean;
  /** Hide everything (paused, results). */
  active: boolean;
  /** The breathing gold edge may draw (power budget). Default true. */
  edge?: boolean;
}

export const FinalSeconds = React.memo(function FinalSeconds({ secondsLeft, remainingMs, timeStamp = true, width, height, stampY, reduced, active, edge: edgeOn = true }: FinalSecondsProps) {
  const font = useDisplayFont(NUM_PX);
  const timeFont = useDisplayFont(TIME_PX);
  const ms = useSharedValue(-1);
  const sJs = useSharedValue(-1);
  const s = secondsLeft == null ? null : Math.floor(secondsLeft);
  const ui = !!remainingMs;
  const inWindowJs = active && s != null && s >= 0 && s <= FINAL_SECONDS;
  useEffect(() => {
    if (ui) return;
    if (!inWindowJs || s == null) {
      cancelAnimation(ms);
      ms.value = -1;
      sJs.value = -1;
      return;
    }
    sJs.value = s;
    cancelAnimation(ms);
    ms.value = 0;
    // Always run the clock: Reduce Motion is handled in the drawing (no breathing, no stamp travel).
    ms.value = withTiming(s === 0 ? 1400 : 1000, { duration: s === 0 ? 1400 : 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
  }, [ui, inWindowJs, s, ms, sJs]);
  useEffect(() => () => cancelAnimation(ms), [ms]);
  const activeSv = useSharedValue(active ? 1 : 0);
  useEffect(() => { activeSv.value = active ? 1 : 0; }, [active, activeSv]);
  // UI clock: stay unmounted (no canvas, no per-frame draw) until the round is inside FINAL_MOUNT_MS.
  const [near, setNear] = useState(false);
  useAnimatedReaction(
    () => (remainingMs ? activeSv.value === 1 && remainingMs.value <= FINAL_MOUNT_MS && remainingMs.value > -1500 : false),
    (on, was) => { if (on !== was) runOnJS(setNear)(on); },
    [remainingMs],
  );
  // The breathing gold edge is a soft full-screen glow: off with Reduce Motion, Dim Flashing Lights or Battery Saver.
  const edgeDraws = edgeOn && flashPeak(isDimFlashingLightsEnabled(), reduced) > 0;

  // The second on show and ms into it, from whichever clock drives this game (-1 when hidden).
  const beat = useDerivedValue(() => {
    if (remainingMs) {
      const rem = remainingMs.value;
      if (!activeSv.value || rem > FINAL_SECONDS * 1000 || rem <= -1400) return { sec: -1, t: -1 };
      // A game that ends on its own stamp (Whack's FINISH!): the 1 holds, ring closed, until the game
      // leaves play in the same commit its stamp mounts, so the sky is never empty between them.
      if (rem <= 0 && !timeStamp) return { sec: 1, t: 999 };
      if (rem <= 0) return { sec: 0, t: -rem };
      const sec = Math.ceil(rem / 1000);
      return { sec, t: sec * 1000 - rem };
    }
    return { sec: ms.value < 0 ? -1 : sJs.value, t: ms.value };
  });
  const numMetrics = useMemo(() => {
    const out: number[] = [];
    for (let k = 0; k <= FINAL_SECONDS; k++) {
      try { out.push(font ? font.measureText(`${k}`).width : NUM_PX * 0.6); } catch { out.push(NUM_PX * 0.6); }
    }
    return out;
  }, [font]);
  const timeW = useMemo(() => {
    try { return timeFont ? timeFont.measureText('TIME!').width : TIME_PX * 3; } catch { return TIME_PX * 3; }
  }, [timeFont]);
  const cx = width / 2;
  const timeCx = Math.max(timeW / 2 + 12, Math.min(width - timeW / 2 - 12, width / 2));
  const ring = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, stampY, RING_R);
    return p;
  }, [cx, stampY]);

  const pose = useDerivedValue(() => {
    const b = beat.value;
    return finalStampPose(b.sec < 0 ? -1 : b.t, b.sec === 0, b.sec === 1, reduced);
  });
  const edge = useDerivedValue(() => {
    const b = beat.value;
    if (!edgeDraws || b.sec <= 0) return 0;
    return finalVignette(b.t, 0.12) / 0.12;
  });
  const numText = useDerivedValue(() => (beat.value.sec > 0 ? `${beat.value.sec}` : ''));
  const numOpacity = useDerivedValue(() => (beat.value.sec > 0 ? pose.value.alpha : 0));
  const timeOpacity = useDerivedValue(() => (beat.value.sec === 0 ? pose.value.alpha : 0));
  // The ring closes over the second like a clock hand (gold, starting at 12 o'clock).
  const ringEnd = useDerivedValue(() => (beat.value.sec > 0 ? pose.value.ring : 0));
  const ringOpacity = useDerivedValue(() => (beat.value.sec > 0 ? pose.value.alpha * 0.95 : 0));
  const numT = useDerivedValue(() => {
    const p = pose.value;
    const sec = beat.value.sec;
    const w = numMetrics[sec > 0 && sec <= FINAL_SECONDS ? sec : 0];
    return [
      { translateX: cx }, { translateY: stampY },
      { rotate: p.rot },
      { scaleX: p.scale * p.sx }, { scaleY: p.scale * p.sy },
      { translateX: -w / 2 }, { translateY: NUM_PX * 0.36 },
    ];
  });
  const timeT = useDerivedValue(() => {
    const p = pose.value;
    return [
      { translateX: timeCx }, { translateY: stampY },
      { rotate: p.rot },
      { scaleX: p.scale * p.sx }, { scaleY: p.scale * p.sy },
      { translateX: -timeW / 2 }, { translateY: TIME_PX * 0.36 },
    ];
  });
  const ringT = useMemo(() => [{ translateX: cx }, { translateY: stampY }, { rotate: -Math.PI / 2 }, { translateX: -cx }, { translateY: -stampY }], [cx, stampY]);
  if (!active || (ui ? !near : !inWindowJs)) return null;
  const r = Math.hypot(width, height) * 0.62;
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      {edgeDraws ? (
        <Group opacity={edge}>
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient c={vec(width / 2, height / 2)} r={r}
              colors={['rgba(255,213,74,0)', 'rgba(255,213,74,0)', 'rgba(255,201,60,0.12)', 'rgba(255,201,60,0.34)']}
              positions={[0, 0.55, 0.8, 1]} />
          </Rect>
        </Group>
      ) : null}
      <Group opacity={ringOpacity}>
        <Circle cx={cx} cy={stampY} r={RING_R} color="rgba(5,52,110,0.28)" />
        <Circle cx={cx} cy={stampY} r={RING_R} color="#ffffff" style="stroke" strokeWidth={9} opacity={0.75} />
        <Group transform={ringT}>
          <Path path={ring} color={GOLD_FX.rays} style="stroke" strokeWidth={9} strokeCap="round" start={0} end={ringEnd} />
        </Group>
      </Group>
      {font ? (
        <Group transform={numT} opacity={numOpacity}>
          <SkText x={0} y={6} text={numText} font={font} color="#05346e" style="stroke" strokeWidth={14} strokeJoin="round" opacity={0.5} />
          <SkText x={0} y={0} text={numText} font={font} color="#05346e" style="stroke" strokeWidth={14} strokeJoin="round" />
          <SkText x={0} y={0} text={numText} font={font} color={FINAL_COLOR.hot} />
        </Group>
      ) : null}
      {timeFont && timeStamp ? (
        <Group transform={timeT} opacity={timeOpacity}>
          <SkText x={0} y={6} text="TIME!" font={timeFont} color="#05346e" style="stroke" strokeWidth={14} strokeJoin="round" opacity={0.5} />
          <SkText x={0} y={0} text="TIME!" font={timeFont} color="#7a4300" style="stroke" strokeWidth={14} strokeJoin="round" />
          <SkText x={0} y={0} text="TIME!" font={timeFont} color={GOLD_FX.rays} />
        </Group>
      ) : null}
    </Canvas>
  );
});
