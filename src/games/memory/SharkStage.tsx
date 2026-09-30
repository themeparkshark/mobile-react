/**
 * SharkStage.tsx: the barker shark at his carnival booth (design 6.9, 6.7).
 *
 * Alex's shark in the studio pose set stands in front of the pipeline booth.
 * Pose swaps squash and stretch (scaleY 0.92 -> 1.06 -> 1.0 over 90ms, scaleX
 * inverse) on the same frame as the SFX. The awning bulbs chase on 8th notes
 * of the music's measured beat map, never fully off (40-100%), and flash-all
 * on each Showtime match.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Callout, type CalloutHandle } from './Hud';

const BOOTH = require('../../assets/games/memory/studio/booth_frame.png');
const POSES = {
  idle: require('../../assets/games/memory/studio/shark_idle.png'),
  hmm: require('../../assets/games/memory/studio/shark_thinking.png'),
  fist: require('../../assets/games/memory/studio/shark_fist_pump.png'),
  facepalm: require('../../assets/games/memory/studio/shark_facepalm.png'),
  party: require('../../assets/games/memory/studio/shark_cheer.png'),
  coin: require('../../assets/games/memory/studio/shark_coin_overhead.png'),
  dizzy: require('../../assets/games/memory/studio/shark_dizzy.png'),
};
const SWEAT = require('../../assets/games/memory/studio/fx_small_sweat_drop.png');

export type Pose = keyof typeof POSES | 'gasp';

export interface SharkStageHandle {
  pose: (p: Pose, holdMs?: number) => void;
  say: (text: string, color?: string, side?: 'left' | 'right') => void;
  flashAll: () => void;
}

/** Booth frame aspect (299x384 master) and its awning bulb centres (fractions). */
const BOOTH_ASPECT = 299 / 384;
const BULBS = [0.145, 0.265, 0.385, 0.5, 0.615, 0.735, 0.855];
const BULB_Y = 0.29;

export const SharkStage = forwardRef<SharkStageHandle, {
  height: number;
  width: number;
  beat: SharedValue<number>;
  showtime: boolean;
  warmth: SharedValue<number>;
  reducedMotion: boolean;
  calm: boolean;
}>(function SharkStage({ height, width, beat, showtime, warmth, reducedMotion, calm }, ref) {
  const [pose, setPose] = useState<Pose>('idle');
  const base = useRef<Pose>('idle');
  const back = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sy = useSharedValue(1);
  const breathe = useSharedValue(0);
  const tip = useSharedValue(0);
  const flash = useSharedValue(0);
  const dance = useSharedValue(0);
  const left = useRef<CalloutHandle>(null);
  const right = useRef<CalloutHandle>(null);

  useEffect(() => {
    if (reducedMotion) { breathe.value = 0; return; }
    breathe.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [reducedMotion, breathe]);

  useEffect(() => () => { if (back.current) clearTimeout(back.current); }, []);

  useEffect(() => {
    cancelAnimation(dance);
    if (pose === 'party' && !reducedMotion && !calm) {
      dance.value = withRepeat(withSequence(withTiming(1, { duration: 232 }), withTiming(-1, { duration: 232 })), -1, true);
    } else dance.value = withTiming(0, { duration: 120 });
  }, [pose, reducedMotion, calm, dance]);

  useImperativeHandle(ref, () => ({
    pose(p, holdMs) {
      if (back.current) clearTimeout(back.current);
      if (holdMs == null) base.current = p;
      setPose(p);
      tip.value = withTiming(p === 'dizzy' ? 1 : 0, { duration: 220 });
      if (!reducedMotion) {
        sy.value = withSequence(withTiming(0.92, { duration: 30 }), withTiming(1.06, { duration: 30 }), withTiming(1, { duration: 30 }));
      }
      if (holdMs != null) {
        back.current = setTimeout(() => {
          setPose(base.current);
          if (!reducedMotion) sy.value = withSequence(withTiming(0.95, { duration: 40 }), withTiming(1, { duration: 50 }));
        }, holdMs);
      }
    },
    say(text, color, side = 'right') {
      (side === 'left' ? left : right).current?.say(text, color);
    },
    flashAll() {
      flash.value = withSequence(withTiming(1, { duration: 0 }), withTiming(1, { duration: 80 }), withTiming(0, { duration: 200 }));
    },
  }), [reducedMotion, sy, tip, flash]);

  const boothH = height;
  const boothW = boothH * BOOTH_ASPECT;
  const sharkH = height * 0.92;
  const sharkW = sharkH * 0.75;

  const sharkStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -breathe.value * 2 },
      { rotateZ: `${tip.value * -12 + dance.value * 5}deg` },
      { scaleX: 1 / sy.value },
      { scaleY: sy.value * (1 + breathe.value * 0.02) },
    ],
  }));
  const warmStyle = useAnimatedStyle(() => ({ opacity: warmth.value }));

  const sharkSrc = pose === 'gasp' ? POSES.hmm : POSES[pose];
  const cx = width / 2;

  return (
    <View style={[styles.stage, { height }]} pointerEvents="none">
      <Animated.View style={[styles.warm, { width: width * 0.9, height: height * 1.1, left: width * 0.05, borderRadius: height }, warmStyle]} />
      <View style={{ position: 'absolute', left: cx - boothW / 2 + boothW * 0.18, top: 0, width: boothW, height: boothH }}>
        <Image source={BOOTH} style={{ width: boothW, height: boothH }} resizeMode="contain" />
        {BULBS.map((bx, i) => (
          <Bulb key={i} i={i} n={BULBS.length} x={bx * boothW} y={BULB_Y * boothH} r={boothW * 0.05}
            beat={beat} showtime={showtime} flash={flash} still={reducedMotion} />
        ))}
      </View>
      <Animated.View style={[{ position: 'absolute', left: cx - boothW / 2 - sharkW * 0.55, top: height - sharkH, width: sharkW, height: sharkH }, sharkStyle]}>
        <Image source={sharkSrc} style={{ width: sharkW, height: sharkH }} resizeMode="contain" />
        {pose === 'gasp' ? <Sweat size={sharkH * 0.14} /> : null}
      </Animated.View>
      <View style={[styles.calloutLeft, { width: cx - boothW / 2 - sharkW * 0.2 }]}>
        <Callout ref={left} reducedMotion={reducedMotion} align="left" />
      </View>
      <View style={[styles.calloutRight, { left: cx + boothW * 0.72 - 20 }]}>
        <Callout ref={right} reducedMotion={reducedMotion} align="left" />
      </View>
    </View>
  );
});

/** Warm bloom bulb over the booth's own bulb socket. Chase steps on 8th notes. */
function Bulb({ i, n, x, y, r, beat, showtime, flash, still }: {
  i: number; n: number; x: number; y: number; r: number;
  beat: SharedValue<number>; showtime: boolean; flash: SharedValue<number>; still: boolean;
}) {
  const b = useDerivedValue(() => {
    if (still) return 0.7;
    const step = beat.value * 2; // 8th notes
    const head = step % n;
    let d = Math.abs(head - i);
    d = Math.min(d, n - d);
    // smooth envelope, never below 40%
    const env = Math.max(0, 1 - d / 2.2);
    const lit = 0.4 + 0.6 * env * env;
    return Math.max(lit, flash.value);
  });
  const st = useAnimatedStyle(() => ({ opacity: b.value * (showtime ? 1 : 0.85) }));
  return (
    <Animated.View style={[styles.bulb, {
      left: x - r * 2.2, top: y - r * 2.2, width: r * 4.4, height: r * 4.4, borderRadius: r * 2.2,
    }, st]}>
      <View style={[styles.bulbCore, { width: r * 1.7, height: r * 1.7, borderRadius: r }]} />
    </Animated.View>
  );
}

function Sweat({ size }: { size: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.in(Easing.quad) }), -1, false);
    return () => cancelAnimation(y);
  }, [y]);
  const a = useAnimatedStyle(() => ({ opacity: 1 - y.value, transform: [{ translateY: y.value * size * 1.6 }] }));
  const b = useAnimatedStyle(() => ({ opacity: 1 - ((y.value + 0.5) % 1), transform: [{ translateY: ((y.value + 0.5) % 1) * size * 1.6 }] }));
  return (
    <>
      <Animated.Image source={SWEAT} style={[{ position: 'absolute', right: size * 0.2, top: size * 0.6, width: size * 0.7, height: size }, a]} />
      <Animated.Image source={SWEAT} style={[{ position: 'absolute', left: size * 0.6, top: size * 0.9, width: size * 0.55, height: size * 0.8 }, b]} />
    </>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%' },
  warm: { position: 'absolute', top: -10, backgroundColor: '#ffd36b' },
  bulb: { position: 'absolute', backgroundColor: 'rgba(255,236,150,0.55)', alignItems: 'center', justifyContent: 'center' },
  bulbCore: { backgroundColor: '#fff6c8' },
  calloutLeft: { position: 'absolute', left: 8, top: 4 },
  calloutRight: { position: 'absolute', right: 8, top: 18 },
});
