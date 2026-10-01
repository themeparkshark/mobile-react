/**
 * SharkStage.tsx: the barker shark leaning over the awning (design v8 6.9).
 *
 * Alex's classic shark in a striped barker vest and straw boater, drawn through
 * the pipeline. He stands behind the awning's left end (the awning front hides
 * his lower body), so he is clearly in the booth.
 *
 *   Boil       every pose has 2-3 hand-drawn frames cycling at 12 fps with a
 *              random phase; poses whose redraws failed the silhouette gate
 *              boil on twos in code instead (+/-1.2 deg, +/-1.5%)
 *   Secondary  idle bob 1.0 -> 1.02 over 2s; the cane taps on every bar
 *              downbeat; after a first flip he leans toward that card's half
 *              (mirrored for the left half, eased 160ms) until the turn resolves
 *   Pose swap  60ms anticipation squash, an ink puff (3 frames, 120ms) over the
 *              pivot, the incoming pose stretches 1.06 -> 1.0 over 90ms
 *   Hat gag    Showtime / Sudden Death: hatless dance frames alternating on the
 *              beat, the boater layer pops 40pt, spins 360 over 500ms and lands
 *              back on the next downbeat with a squash (reduced motion: a tip)
 *   Tumble     timeout and duel loss: stumble, sit with the boater crooked, sit
 *              dizzy, with a dust cloud and dizzy stars
 */

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type Frames = number[];
const POSES = {
  idle: [require('../../assets/games/memory/studio/barker_idle_cane.png')],
  hmm: [require('../../assets/games/memory/studio/barker_curious.png')],
  fist: [require('../../assets/games/memory/studio/barker_fist_pump.png'), require('../../assets/games/memory/v8/barker/fist_pump_b.png'), require('../../assets/games/memory/v8/barker/fist_pump_c.png')],
  facepalm: [require('../../assets/games/memory/studio/barker_facepalm.png'), require('../../assets/games/memory/v8/barker/facepalm_b.png'), require('../../assets/games/memory/v8/barker/facepalm_c.png')],
  party: [require('../../assets/games/memory/v8/barker/hatless_dance_f0.png'), require('../../assets/games/memory/v8/barker/hatless_dance_f1.png')],
  coin: [require('../../assets/games/memory/studio/barker_coin_overhead.png')],
  gasp: [require('../../assets/games/memory/studio/barker_gasp.png'), require('../../assets/games/memory/v8/barker/gasp_b.png'), require('../../assets/games/memory/v8/barker/gasp_c.png')],
  wave: [require('../../assets/games/memory/studio/barker_wave.png'), require('../../assets/games/memory/v8/barker/wave_b.png'), require('../../assets/games/memory/v8/barker/wave_c.png')],
  tumble: [
    require('../../assets/games/memory/v8/barker/tumble_stumble.png'),
    require('../../assets/games/memory/v8/barker/tumble_sit_crooked.png'),
    require('../../assets/games/memory/v8/barker/tumble_dizzy.png'),
  ],
} satisfies Record<string, Frames>;
/** Poses whose hand redraws passed the 3% silhouette gate boil on art; the rest boil in code. */
const ART_BOIL: Partial<Record<Pose, boolean>> = { fist: true, facepalm: true, gasp: true, wave: true };
/** Frame aspect (w/h) per pose, at 192pt master height. */
const ASPECT: Record<Pose, number> = {
  idle: 0.786, hmm: 0.781, fist: 0.807, facepalm: 0.781, party: 0.87, coin: 0.651, gasp: 0.755, wave: 0.755, tumble: 1.0,
};
const BOATER = require('../../assets/games/memory/v8/barker/boater.png');
const PUFF = [
  require('../../assets/games/memory/v8/fx/ink_puff_1.png'),
  require('../../assets/games/memory/v8/fx/ink_puff_2.png'),
  require('../../assets/games/memory/v8/fx/ink_puff_3.png'),
];
const DUST = require('../../assets/games/memory/v8/fx/cloud_puff_1.png');
const DIZZY = require('../../assets/games/memory/v8/fx/dizzy_star_1.png');
const SWEAT = require('../../assets/games/memory/studio/fx_small_sweat_drop.png');

export type Pose = keyof typeof POSES;

export interface SharkStageHandle {
  pose: (p: Pose, holdMs?: number) => void;
  /** Curious lean toward a card's half (-1 left, +1 right, 0 release). */
  lean: (side: -1 | 0 | 1) => void;
  /** Showtime / Sudden Death hat gag. */
  hatGag: (on: boolean) => void;
  /** Timeout / duel loss: the 3-frame tumble. */
  tumble: () => void;
  /** Barker intro: slide in from the left post and tip the boater. */
  intro: () => void;
}

export const SharkStage = forwardRef<SharkStageHandle, {
  /** Barker rect from layout (bottom hidden by the awning). */
  x: number;
  y: number;
  height: number;
  beat: SharedValue<number>;
  reducedMotion: boolean;
  calm: boolean;
}>(function SharkStage({ x, y, height, beat, reducedMotion, calm }, ref) {
  const [pose, setPose] = useState<Pose>('idle');
  const [frame, setFrame] = useState(0);
  const [hatless, setHatless] = useState(false);
  const [puffFrame, setPuffFrame] = useState(-1);
  const base = useRef<Pose>('idle');
  const back = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const sy = useSharedValue(1);
  const bob = useSharedValue(0);
  const cane = useSharedValue(0);
  const lean = useSharedValue(0);
  const mirror = useSharedValue(1);
  const boil = useSharedValue(0);
  const slide = useSharedValue(0);
  const hatY = useSharedValue(0);
  const hatSpin = useSharedValue(0);
  const hatOn = useSharedValue(0);
  const tip = useSharedValue(0);
  const dust = useSharedValue(0);
  const phase = useMemo(() => Math.floor(Math.random() * 3), []);

  useEffect(() => () => {
    if (back.current) clearTimeout(back.current);
    timers.current.forEach(clearTimeout);
  }, []);

  // Idle bob 1.0 -> 1.02 over 2s.
  useEffect(() => {
    if (reducedMotion) { bob.value = 0; return undefined; }
    bob.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(bob);
  }, [reducedMotion, bob]);

  // Boil at 12 fps with a random phase (art frames), or twos jitter in code.
  useEffect(() => {
    if (reducedMotion) return undefined;
    let n = phase;
    const iv = setInterval(() => {
      n += 1;
      boil.value = n;
      const frames = POSES[pose].length;
      if (pose !== 'party' && pose !== 'tumble' && ART_BOIL[pose] && frames > 1) setFrame(n % frames);
    }, 83);
    return () => clearInterval(iv);
  }, [pose, reducedMotion, phase, boil]);

  // Cane tap on every bar downbeat (and the dance alternates on every beat).
  const lastBeat = useSharedValue(-1);
  const onBeat = (b: number) => {
    if (pose === 'party') setFrame(b % 2);
    if (b % 4 === 0 && pose === 'idle' && !reducedMotion) {
      cane.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 40 }));
    }
  };
  useAnimatedReaction(() => Math.floor(beat.value), (b) => {
    if (b !== lastBeat.value && b >= 0) {
      lastBeat.value = b;
      runOnJS(onBeat)(b);
    }
  }, [pose, reducedMotion]);

  const swap = (p: Pose) => {
    if (reducedMotion) {
      setPose(p);
      setFrame(0);
      return;
    }
    // 60ms anticipation, puff over the pivot, incoming stretch.
    sy.value = withTiming(0.92, { duration: 60 });
    setPuffFrame(0);
    later(40, () => setPuffFrame(1));
    later(80, () => setPuffFrame(2));
    later(120, () => setPuffFrame(-1));
    later(60, () => {
      setPose(p);
      setFrame(0);
      sy.value = withSequence(withTiming(1.06, { duration: 1 }), withTiming(1, { duration: 90 }));
    });
  };

  useImperativeHandle(ref, (): SharkStageHandle => ({
    pose(p, holdMs) {
      if (back.current) clearTimeout(back.current);
      if (holdMs == null) base.current = p;
      if (p !== 'hmm') lean.value = withTiming(0, { duration: 160 });
      swap(p);
      if (holdMs != null) back.current = setTimeout(() => swap(base.current), holdMs);
    },
    lean(side) {
      if (side === 0 || calm) {
        lean.value = withTiming(0, { duration: 160 });
        mirror.value = 1;
        return;
      }
      mirror.value = side < 0 ? -1 : 1;
      lean.value = withTiming(side, { duration: 160, easing: Easing.out(Easing.quad) });
    },
    hatGag(on) {
      setHatless(on);
      if (on) {
        base.current = 'party';
        swap('party');
        if (reducedMotion) { tip.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 160 })); return; }
        hatOn.value = 1;
        hatY.value = withSequence(withTiming(-40, { duration: 250, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 250, easing: Easing.in(Easing.quad) }));
        hatSpin.value = 0;
        hatSpin.value = withTiming(360, { duration: 500 });
      } else {
        hatOn.value = 0;
        base.current = 'idle';
        swap('idle');
      }
    },
    tumble() {
      base.current = 'tumble';
      setHatless(false);
      setPose('tumble');
      setFrame(0);
      if (reducedMotion) { setFrame(2); return; }
      dust.value = withSequence(withTiming(1, { duration: 200 }), withDelay(500, withTiming(0, { duration: 300 })));
      later(160, () => setFrame(1));
      later(420, () => setFrame(2));
    },
    intro() {
      if (reducedMotion) return;
      slide.value = -1;
      slide.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.back(1.3)) });
      tip.value = withDelay(460, withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 180 })));
    },
  }));

  const asp = ASPECT[pose];
  const h = height;
  const w = h * asp;
  const body = useAnimatedStyle(() => {
    const twos = !ART_BOIL[pose] && pose !== 'party' && pose !== 'tumble' && !reducedMotion;
    const k = boil.value;
    const j = twos ? (((k * 7919) % 5) - 2) / 2 : 0; // -1..1 on twos
    return {
      transform: [
        { translateX: slide.value * (w + 20) + lean.value * 6 },
        { translateY: -bob.value * h * 0.01 + cane.value * 2 },
        { rotateZ: `${lean.value * 5 + j * 1.2 - tip.value * 6}deg` },
        { scaleX: mirror.value * (1 / sy.value) * (1 + j * 0.015) },
        { scaleY: sy.value * (1 + bob.value * 0.02) * (1 - cane.value * 0.02) },
      ],
    };
  });
  const hat = useAnimatedStyle(() => ({
    opacity: hatOn.value,
    transform: [{ translateY: hatY.value }, { rotateZ: `${hatSpin.value + (frame % 2 ? 14 : -14)}deg` }],
  }));
  const dustStyle = useAnimatedStyle(() => ({ opacity: dust.value, transform: [{ scale: 0.6 + dust.value * 0.6 }] }));
  const src = POSES[pose][Math.min(frame, POSES[pose].length - 1)];
  const hatW = w * 0.42;
  const hatX = frame % 2 ? w * 0.70 : w * 0.30;
  return (
    <View style={[StyleSheet.absoluteFill]} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', left: x, top: y, width: w, height: h }, body]}>
        <Animated.Image source={src} style={{ width: w, height: h }} resizeMode="contain" />
        {hatless && pose === 'party' ? (
          <Animated.Image source={BOATER} resizeMode="contain"
            style={[{ position: 'absolute', left: hatX - hatW / 2, top: h * 0.02, width: hatW, height: hatW * (59 / 96) }, hat]} />
        ) : null}
        {pose === 'gasp' ? <Sweat size={h * 0.14} /> : null}
        {pose === 'tumble' && frame === 2 ? <DizzyStars size={h * 0.18} w={w} /> : null}
      </Animated.View>
      {puffFrame >= 0 ? (
        <Animated.Image source={PUFF[puffFrame]} resizeMode="contain"
          style={{ position: 'absolute', left: x + w * 0.2, top: y + h * 0.3, width: w * 0.6, height: w * 0.6 }} />
      ) : null}
      <Animated.Image source={DUST} resizeMode="contain"
        style={[{ position: 'absolute', left: x - w * 0.1, top: y + h * 0.55, width: w * 1.2, height: w * 0.6 }, dustStyle]} />
    </View>
  );
});

function DizzyStars({ size, w }: { size: number; w: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: Math.cos(t.value * Math.PI * 2) * w * 0.25 }, { translateY: Math.sin(t.value * Math.PI * 2) * size * 0.3 }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ translateX: Math.cos(t.value * Math.PI * 2 + Math.PI) * w * 0.25 }, { translateY: Math.sin(t.value * Math.PI * 2 + Math.PI) * size * 0.3 }] }));
  return (
    <>
      <Animated.Image source={DIZZY} style={[{ position: 'absolute', left: w / 2 - size / 2, top: size * 0.2, width: size, height: size }, a]} />
      <Animated.Image source={DIZZY} style={[{ position: 'absolute', left: w / 2 - size / 2, top: size * 0.2, width: size, height: size }, b]} />
    </>
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
  const c = useAnimatedStyle(() => ({ opacity: 1 - ((y.value + 0.25) % 1), transform: [{ translateY: ((y.value + 0.25) % 1) * size * 1.4 }] }));
  return (
    <>
      <Animated.Image source={SWEAT} style={[{ position: 'absolute', right: size * 0.2, top: size * 0.6, width: size * 0.7, height: size }, a]} />
      <Animated.Image source={SWEAT} style={[{ position: 'absolute', left: size * 0.6, top: size * 0.9, width: size * 0.55, height: size * 0.8 }, b]} />
      <Animated.Image source={SWEAT} style={[{ position: 'absolute', right: size * 0.9, top: size * 0.3, width: size * 0.5, height: size * 0.7 }, c]} />
    </>
  );
}
