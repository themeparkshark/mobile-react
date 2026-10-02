import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, ColorMatrix, FractalNoise, Group, Paint, Rect, RoundedRect, Shadow, LinearGradient as SkLinearGradient,
  useImage, vec, Blur } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { PrepItemType } from '../../../models/prep-item-type';
import type { RedeemCatchDetails } from '../../../api/endpoints/me/prep-items/redeem';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { queueHaptic, type HapticIntent } from '../../../gamekit/Haptics';
import { playLimited, SFX_PRIORITY } from '../../../audio/sfxLimiter';
import { FxStage, type FxStageHandle } from '../../../gamekit/fx/FxStage';
import { StampLayer, type StampLayerHandle } from '../../../gamekit/fx/StampLayer';
import { brightnessMatrix, desaturateMatrix } from '../../../gamekit/fx/shaders';
import { SPRING } from '../../../gamekit/fx/motion';
import { BRAND } from '../../../ui';
import RideScene, { type SceneArt } from './RideScene';
import { buildTrack, sampleTrack } from './rideTrack';
import {
  GRADE_LABEL, RIDE_START, frameHalfAfterMisses, gradeShot, isGoodShot, photoPayload, returnDelayMs, rideProgress,
  rideSpec, rideStep, REDUCED_MOTION_GRADE, type PhotoGrade, type RideState,
} from '../ridePhoto';

const ART = {
  far: require('../../../../assets/images/ride-photo/scene-far.webp'),
  near: require('../../../../assets/images/ride-photo/scene-near.webp'),
  car: require('../../../../assets/images/ride-photo/car.webp'),
  camera: require('../../../../assets/images/ride-photo/camera.webp'),
};
const SHUTTER_ART = require('../../../../assets/images/ride-photo/shutter.webp');
const HAND_ART = require('../../../../assets/images/ride-photo/tap-hand.webp');

const CUES = ['ui.select', 'fx.coinTick', 'fx.whoosh', 'fx.whooshRev', 'fx.hit', 'ui.button', 'fx.coin', 'fx.reveal',
  'fx.reward', 'fx.nopeShort', 'fx.firework'];
function cue(name: string, opts: { volume?: number; pitch?: number; priority?: number } = {}) {
  playLimited(`ride-${name}`, { priority: opts.priority ?? SFX_PRIORITY.tap, durationMs: 400 }, () => {
    void (async () => {
      try {
        if (!GameAudio.backend) await GameAudio.init();
        GameAudio.play(name, { volume: opts.volume, pitch: opts.pitch });
      } catch {
        // Sound is decoration; never break the catch.
      }
    })();
  });
}
function buzz(intent: HapticIntent, priority = 2) { queueHaptic(intent, priority); }

/** Grade feel: stamp colour, frame colours, sound and haptic, rising with quality. */
const GRADE_FEEL: Record<PhotoGrade, { stamp: string; frame: [string, string]; cue: string; haptic: HapticIntent; burst: 'stars' | 'sparkles' | 'confetti' | 'puff' }> = {
  blurry: { stamp: '#cbd5e1', frame: ['#f1f5f9', '#e2e8f0'], cue: 'fx.nopeShort', haptic: 'softBump', burst: 'puff' },
  good: { stamp: '#ffffff', frame: ['#ffffff', '#eef2f7'], cue: 'fx.coin', haptic: 'hitMedium', burst: 'stars' },
  great: { stamp: '#bfe5ff', frame: ['#f4f8fc', '#b8c6d6'], cue: 'fx.reveal', haptic: 'success', burst: 'sparkles' },
  frame_it: { stamp: '#ffcf3b', frame: ['#fff2b3', '#e2a400'], cue: 'fx.reward', haptic: 'comboHeavy', burst: 'confetti' },
};

const PRINT_W = 176;
const PHOTO_W = PRINT_W - 16;
const PHOTO_H = 118;
const PRINT_H = PHOTO_H + 8 + 30;

export interface RidePhotoProps {
  readonly item: PrepItemType;
  readonly art: { uri: string } | number | null;
  /** The find's spot in the layer, for the open and close. */
  readonly from: { x: number; y: number } | null;
  readonly layer: { width: number; height: number };
  readonly reducedMotion: boolean;
  /** First Ride Photo ever: a tapping finger shows on the shutter. */
  readonly showHint: boolean;
  /** The final good shot: start the server call now, while the photo develops. */
  readonly onCaught: (details: RedeemCatchDetails, grade: PhotoGrade) => void;
  /** Develop and stamp are done; the print sits here (layer points) for the fly to the badge. */
  readonly onPrintReady: (at: { x: number; y: number }) => void;
  readonly onRodeOff: () => void;
  /** The parent is closing the view (after the fly, or on an error). */
  readonly closing: boolean;
  /** Development recordings: shot offsets per pass (fraction of the frame's half width; -1.6 is early). */
  readonly autoShots?: number[] | null;
}

/**
 * Ride Photo, the catch for Uncommon and rarer finds. The find rides a coaster
 * car through a little park vignette; tap as the car hits the flash frame.
 * The car position is read on the UI thread at touch-down, the photo develops
 * in suspense beats, and a grade stamps on. See CATCH_PSYCHOLOGY.md.
 */
export default function RidePhotoCatch({ item, art, from, layer, reducedMotion, showHint, onCaught, onPrintReady,
  onRodeOff, closing, autoShots }: RidePhotoProps) {
  const spec = useMemo(() => rideSpec(item.rarity), [item.rarity]);
  const cardW = Math.min(layer.width - 24, 400);
  const sceneW = cardW - 16;
  const sceneH = Math.round(sceneW * 0.66);
  const cardH = sceneH + 16 + 58;
  const cardX = (layer.width - cardW) / 2;
  const cardY = Math.max(24, layer.height * 0.47 - cardH / 2);
  const lut = useMemo(() => buildTrack(spec.track, sceneW, sceneH), [spec.track, sceneW, sceneH]);
  const uAtFrame = useMemo(() => {
    let best = 0;
    for (let k = 1; k < lut.xs.length; k++) if (Math.abs(lut.xs[k] - lut.frameX) < Math.abs(lut.xs[best] - lut.frameX)) best = k;
    return best / (lut.xs.length - 1);
  }, [lut]);

  const far = useImage(ART.far), near = useImage(ART.near), car = useImage(ART.car), camera = useImage(ART.camera);
  const rider = useImage(typeof art === 'number' ? art : art?.uri ?? null);
  const sceneArt: SceneArt = useMemo(() => ({ far, near, car, camera, rider }), [far, near, car, camera, rider]);

  const [ride, setRide] = useState<RideState>(RIDE_START);
  const rideRef = useRef(ride);
  rideRef.current = ride;
  const [misses, setMisses] = useState(0);
  const frameHalfPx = frameHalfAfterMisses(spec, misses) * sceneW;
  const [print, setPrint] = useState<{ grade: PhotoGrade; key: number } | null>(null);
  const [hint, setHint] = useState(showHint);
  const fx = useRef<FxStageHandle>(null);
  const stamps = useRef<StampLayerHandle>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, run: () => void) => { timers.current.push(setTimeout(run, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // ── Shared values: all motion on the UI thread ────────────────────────
  const open = useSharedValue(0);
  const t = useSharedValue(0);
  const armed = useSharedValue(false);
  const parked = useSharedValue(reducedMotion);
  const shotU = useSharedValue(0);
  const flash = useSharedValue(0);
  const bright = useSharedValue(1);
  const press = useSharedValue(1);
  const iris = useSharedValue(0);
  const printIn = useSharedValue(0);
  const develop = useSharedValue(0);
  const shake = useSharedValue(0);
  const blurAmt = useSharedValue(0);
  const track = spec.track;
  const u = useDerivedValue(() => (parked.value ? uAtFrame : rideProgress(track, t.value)));
  const frameGlow = useDerivedValue(() => {
    const p = sampleTrack(lut, u.value);
    return Math.max(0, 1 - Math.abs(p.x - lut.frameX) / (frameHalfPx * 2.4));
  });
  const shotUValue = useDerivedValue(() => shotU.value);
  const noFlash = useSharedValue(0);
  const noGlow = useSharedValue(0.6);

  // ── A pass of the car ─────────────────────────────────────────────────
  const shotThisPass = useRef(false);
  const startPass = useCallback(() => {
    shotThisPass.current = false;
    armed.value = true;
    if (reducedMotion) { parked.value = true; return; }
    t.value = 0;
    t.value = withTiming(1, { duration: spec.passMs, easing: Easing.linear }, finished => {
      if (finished) runOnJS(passEnd)();
    });
    // Click-clack up the lift hill, then the whoosh down the drop.
    if (track === 'hill' || track === 'dark') {
      const climb = spec.passMs * 0.45;
      for (let at = 80; at < climb; at += 115) later(at, () => { if (!shotThisPass.current) cue('fx.coinTick', { volume: 0.55, pitch: (at / climb) * 3 }); });
      later(climb, () => { if (!shotThisPass.current) { cue('fx.whoosh', { priority: SFX_PRIORITY.whoosh }); buzz('hitSoft', 1); } });
    } else {
      later(60, () => cue('fx.whoosh', { volume: 0.6, priority: SFX_PRIORITY.whoosh }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, reducedMotion, track]);

  const passEnd = useCallback(() => {
    armed.value = false;
    let missed = true;
    if (!shotThisPass.current) {
      const next = rideStep(spec, rideRef.current, { type: 'pass_end' });
      setRide(next);
      if (next.outcome === 'rode_off') { onRodeOff(); return; }
      setMisses(count => count + 1);
    } else {
      missed = rideRef.current.outcome === 'riding' && rideRef.current.misses > 0;
    }
    if (rideRef.current.outcome === 'riding') later(returnDelayMs(spec, missed), startPass);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, onRodeOff, startPass]);

  // ── Open: the map blurs (parent), the card springs out of the find ────
  useEffect(() => {
    cue('fx.whooshRev', { volume: 0.7, priority: SFX_PRIORITY.whoosh });
    buzz('tapLight', 1);
    void GameAudio.preload(CUES).catch(() => undefined);
    open.value = reducedMotion ? withTiming(1, { duration: 160 }) : withSpring(1, { damping: 14, stiffness: 240, mass: 0.8 });
    later(reducedMotion ? 200 : 520, startPass);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!closing) return;
    armed.value = false;
    cancelAnimation(t);
    open.value = withTiming(0, { duration: reducedMotion ? 120 : 280, easing: Easing.in(Easing.cubic) });
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The shot ──────────────────────────────────────────────────────────
  const developPrint = useCallback((grade: PhotoGrade) => {
    const key = Date.now();
    setPrint({ grade, key });
    printIn.value = 0;
    develop.value = 0;
    blurAmt.value = grade === 'blurry' ? 7 : 0;
    // The print slides out of the camera with an overshoot.
    printIn.value = reducedMotion ? withTiming(1, { duration: 120 }) : withSpring(1, SPRING.settle);
    if (grade === 'blurry') {
      develop.value = withTiming(1, { duration: 200 });
      later(120, () => {
        stamps.current?.push(GRADE_LABEL.blurry, { x: layer.width / 2, y: cardY + 64, color: GRADE_FEEL.blurry.stamp, size: 30 });
        cue('fx.nopeShort');
        buzz('softBump', 2);
      });
      later(760, () => { printIn.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }); });
      later(1000, () => setPrint(current => (current?.key === key ? null : current)));
      return;
    }
    // Suspense beats: shake, tick, a little more colour each beat.
    const beats = spec.developBeats;
    const beatMs = 380;
    for (let i = 0; i < beats; i++) {
      later(260 + i * beatMs, () => {
        develop.value = withTiming((i + 1) / (beats + 1), { duration: beatMs - 60, easing: Easing.out(Easing.quad) });
        shake.value = reducedMotion ? 0 : withSequence(withTiming(1, { duration: 50 }), withTiming(-1, { duration: 70 }),
          withTiming(0.5, { duration: 60 }), withTiming(0, { duration: 60 }));
        cue('ui.select', { pitch: i * 2, volume: 0.8 });
        buzz('tickSelection', 1);
      });
    }
    const reveal = 260 + beats * beatMs;
    const feel = GRADE_FEEL[grade];
    later(reveal, () => {
      develop.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
      bright.value = withSequence(withTiming(1.5, { duration: 50 }), withTiming(1, { duration: 260 }));
      stamps.current?.push(GRADE_LABEL[grade], { x: layer.width / 2, y: cardY + 58, color: feel.stamp,
        size: grade === 'frame_it' ? 40 : 34, priority: 3 });
      fx.current?.burst(feel.burst, layer.width / 2, cardY + PRINT_H / 2 + 20);
      if (grade !== 'good') fx.current?.ring(layer.width / 2, cardY + PRINT_H / 2 + 20, { color: feel.stamp, from: 40, to: 150, ms: 420 });
      cue(feel.cue, { priority: SFX_PRIORITY.land });
      if (grade === 'frame_it') later(90, () => cue('fx.firework', { volume: 0.6 }));
      buzz(feel.haptic, 4);
    });
    later(reveal + 700, () => onPrintReady({ x: layer.width / 2, y: cardY + 12 + PRINT_H / 2 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, reducedMotion, layer.width, cardY, onPrintReady]);

  const onShot = useCallback((grade: PhotoGrade, remaining: number) => {
    shotThisPass.current = true;
    setHint(false);
    // Shutter: a crisp click layered with the flash pop, the scene flares.
    cue('fx.hit', { priority: SFX_PRIORITY.land, pitch: 2 });
    later(30, () => cue('ui.button', { volume: 0.9 }));
    buzz('hitRigid', 3);
    const next = rideStep(spec, rideRef.current, { type: 'shot', grade });
    setRide(next);
    if (!isGoodShot(grade)) setMisses(count => count + 1);
    if (next.outcome === 'caught') onCaught(photoPayload(spec, next), grade);
    developPrint(grade);
    // Hit-stop, then the car rolls on out of the scene.
    later(130, () => {
      if (reducedMotion) { if (next.outcome === 'riding') later(900, startPass); return; }
      t.value = withTiming(1, { duration: Math.max(200, remaining), easing: Easing.linear }, finished => {
        if (finished) runOnJS(passEnd)();
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, onCaught, developPrint, reducedMotion, passEnd, startPass]);

  const frameX = lut.frameX;
  const halfPx = frameHalfPx;
  const passMs = spec.passMs;
  const reducedGrade = REDUCED_MOTION_GRADE;
  const shoot = () => {
    'worklet';
    if (!armed.value) return;
    armed.value = false;
    // Read the car where it is at touch-down, not a frame later.
    const uNow = u.value;
    shotU.value = uNow;
    const grade: PhotoGrade = parked.value ? reducedGrade
      : gradeShot((sampleTrack(lut, uNow).x - frameX) / halfPx);
    const remaining = (1 - t.value) * passMs;
    cancelAnimation(t);
    flash.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) }));
    bright.value = withSequence(withTiming(1.8, { duration: 40 }), withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }));
    iris.value = withSequence(withTiming(1, { duration: 55 }), withTiming(0, { duration: 140 }));
    runOnJS(onShot)(grade, remaining);
  };
  const tap = Gesture.Tap().maxDuration(100_000).onBegin(() => {
    'worklet';
    press.value = withSequence(withTiming(0.86, { duration: 60 }), withSpring(1, SPRING.press));
    shoot();
  });

  // Development recordings only: shoot automatically at a scripted offset per pass.
  const autoPass = useSharedValue(0);
  const script = autoShots ?? null;
  useAnimatedReaction(() => (armed.value && script ? (sampleTrack(lut, u.value).x - frameX) / halfPx : null), offset => {
    if (offset == null || !script) return;
    const target = script[Math.min(script.length - 1, autoPass.value)];
    if (offset >= target) {
      autoPass.value += 1;
      press.value = withSequence(withTiming(0.86, { duration: 60 }), withSpring(1, SPRING.press));
      shoot();
    }
  });

  // ── Styles ────────────────────────────────────────────────────────────
  const fromX = from?.x ?? layer.width / 2, fromY = from?.y ?? layer.height / 2;
  const cardStyle = useAnimatedStyle(() => {
    const o = open.value;
    return {
      opacity: Math.min(1, o * 1.6),
      transform: [
        { translateX: (fromX - (cardX + cardW / 2)) * (1 - o) },
        { translateY: (fromY - (cardY + cardH / 2)) * (1 - o) },
        { scale: 0.18 + 0.82 * o },
      ],
    };
  });
  const brightMatrix = useDerivedValue(() => brightnessMatrix(bright.value));
  const sceneLayer = useMemo(() => <Paint><ColorMatrix matrix={brightMatrix} /></Paint>, [brightMatrix]);
  const irisTop = useDerivedValue(() => (sceneH / 2) * iris.value);
  const irisBottomY = useDerivedValue(() => sceneH - (sceneH / 2) * iris.value);
  const shutterStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const handStyle = useAnimatedStyle(() => ({ opacity: 1 }));
  const tapLoop = useSharedValue(0);
  useEffect(() => {
    if (!hint || reducedMotion) return;
    tapLoop.value = withRepeat(withSequence(withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 540, easing: Easing.inOut(Easing.quad) })), -1, false);
    return () => cancelAnimation(tapLoop);
  }, [hint, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const handMove = useAnimatedStyle(() => ({
    transform: [{ translateY: -14 + 14 * tapLoop.value }, { scale: 1 - 0.08 * tapLoop.value }],
  }));
  const ripple = useAnimatedStyle(() => ({ opacity: tapLoop.value > 0.85 ? 0.6 : 0.6 * tapLoop.value, transform: [{ scale: 0.6 + 0.8 * tapLoop.value }] }));

  // Print: slides up out of the camera slot, shakes while it develops.
  const printStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, printIn.value * 2) * Math.min(1, open.value * 1.4),
    transform: [{ translateY: (1 - printIn.value) * 120 }, { scale: 0.55 + 0.45 * printIn.value },
      { rotate: `${-4 + shake.value * 3}deg` }],
  }));
  const whiteOut = useDerivedValue(() => 1 - develop.value);
  const grainOpacity = useDerivedValue(() => 0.08 + 0.4 * (1 - develop.value));
  const desat = useDerivedValue(() => desaturateMatrix(1 - develop.value));
  const photoLayer = useMemo(() => <Paint><ColorMatrix matrix={desat} /></Paint>, [desat]);
  const blurValue = useDerivedValue(() => blurAmt.value);
  // The print is framed on the flash frame, so a centred car fills it and an off shot does not.
  const cropW = sceneW * 0.46;
  const cropScale = PHOTO_W / cropW;
  const cropX = lut.frameX - cropW / 2;
  const cropY = Math.max(0, lut.frameY - (PHOTO_H / cropScale) * 0.66);
  const golden = item.golden_hour === true;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={tap}>
        <Animated.View style={[styles.card, { left: cardX, top: cardY, width: cardW, height: cardH }, cardStyle]}>
          <LinearGradient colors={['#0d4f99', '#073a74']} style={[StyleSheet.absoluteFill, styles.cardFill]} />
          <View style={[styles.sceneWrap, { width: sceneW, height: sceneH }]}>
            <Canvas style={{ width: sceneW, height: sceneH }}>
              <Group layer={sceneLayer}>
                <RideScene width={sceneW} height={sceneH} lut={lut} art={sceneArt} u={u} frameHalfPx={frameHalfPx}
                  frameGlow={frameGlow} flash={flash} golden={golden} />
              </Group>
              {/* Shutter blink */}
              <Rect x={0} y={0} width={sceneW} height={irisTop} color="#05213f" />
              <Rect x={0} y={irisBottomY} width={sceneW} height={sceneH} color="#05213f" />
              {/* Inner glass: a soft top sheen and an edge shade for depth */}
              <Rect x={0} y={0} width={sceneW} height={sceneH * 0.35}>
                <SkLinearGradient start={vec(0, 0)} end={vec(0, sceneH * 0.35)} colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']} />
              </Rect>
            </Canvas>
          </View>
          <View style={styles.controls} pointerEvents="none">
            <Animated.View style={[styles.shutter, shutterStyle]}>
              <Image source={SHUTTER_ART} style={styles.shutterArt} contentFit="contain" transition={0} />
            </Animated.View>
            {hint && <>
              <Animated.View style={[styles.ripple, ripple]} />
              <Animated.View style={[styles.hand, handMove, handStyle]}>
                <Image source={HAND_ART} style={styles.handArt} contentFit="contain" transition={0} />
              </Animated.View>
            </>}
          </View>
        </Animated.View>
      </GestureDetector>

      {print && <Animated.View pointerEvents="none" style={[styles.print, { left: (layer.width - PRINT_W) / 2, top: cardY + 12 }, printStyle]}>
        <LinearGradient colors={GRADE_FEEL[print.grade].frame} style={[StyleSheet.absoluteFill, styles.printFill]} />
        <View style={styles.photo}>
          <Canvas style={{ width: PHOTO_W, height: PHOTO_H }}>
            <Group layer={photoLayer}>
              <Group transform={[{ scale: cropScale }, { translateX: -cropX }, { translateY: -cropY }]}>
                <Group>
                  {print.grade === 'blurry' && <Blur blur={blurValue} />}
                  <RideScene width={sceneW} height={sceneH} lut={lut} art={sceneArt} u={shotUValue} frameHalfPx={0}
                    frameGlow={noGlow} flash={noFlash} golden={golden} />
                </Group>
              </Group>
            </Group>
            <Rect x={0} y={0} width={PHOTO_W} height={PHOTO_H} opacity={grainOpacity}>
              <FractalNoise freqX={0.9} freqY={0.9} octaves={2} />
            </Rect>
            <Rect x={0} y={0} width={PHOTO_W} height={PHOTO_H} color="#fffdf2" opacity={whiteOut} />
            <RoundedRect x={0} y={0} width={PHOTO_W} height={PHOTO_H} r={4} style="stroke" strokeWidth={1.5} color="rgba(11,47,92,0.35)">
              <Shadow dx={0} dy={1} blur={2} color="rgba(0,0,0,0.25)" inner />
            </RoundedRect>
          </Canvas>
        </View>
      </Animated.View>}

      <FxStage ref={fx} width={layer.width} height={layer.height} reducedMotion={reducedMotion} flashCap={0.2}
        style={StyleSheet.absoluteFill} />
      <StampLayer ref={stamps} width={layer.width} height={layer.height} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', borderRadius: 26, padding: 8, alignItems: 'center',
    shadowColor: '#021a36', shadowOffset: { width: 0, height: 14 }, shadowRadius: 22, shadowOpacity: 0.45 },
  cardFill: { borderRadius: 26, borderWidth: 3, borderColor: '#ffcf3b' },
  sceneWrap: { borderRadius: 18, overflow: 'hidden', borderWidth: 3, borderColor: '#05213f' },
  // The shutter sits half over the scene's bottom edge, like a camera body button.
  controls: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'flex-start', zIndex: 2 },
  shutter: { width: 84, height: 84, marginTop: -30,
    shadowColor: '#021a36', shadowOffset: { width: 0, height: 6 }, shadowRadius: 8, shadowOpacity: 0.45 },
  shutterArt: { width: 84, height: 84 },
  ripple: { position: 'absolute', top: -36, width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: BRAND.white },
  // The fingertip (about 62% across, at the bottom) lands on the shutter's centre.
  hand: { position: 'absolute', width: 56, height: 77, left: '50%', marginLeft: -35, top: -49 },
  handArt: { width: 56, height: 77 },
  print: { position: 'absolute', width: PRINT_W, height: PRINT_H, borderRadius: 6, padding: 8, paddingBottom: 30,
    shadowColor: '#021a36', shadowOffset: { width: 0, height: 10 }, shadowRadius: 14, shadowOpacity: 0.4 },
  printFill: { borderRadius: 6 },
  photo: { width: PHOTO_W, height: PHOTO_H, borderRadius: 4, overflow: 'hidden', backgroundColor: '#fffdf2' },
});
