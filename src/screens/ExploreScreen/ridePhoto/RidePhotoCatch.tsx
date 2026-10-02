import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Blur, Canvas, ColorMatrix, Group, Image as SkImageNode, Rect, drawAsImage, type SkImage,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, cancelAnimation, runOnJS, runOnUI, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import type { PrepItemType } from '../../../models/prep-item-type';
import type { RedeemCatchDetails } from '../../../api/endpoints/me/prep-items/redeem';
import { queueHaptic, type HapticIntent } from '../../../gamekit/Haptics';
import { FxStage, type FxStageHandle } from '../../../gamekit/fx/FxStage';
import { Sunburst, Shimmer } from '../../../gamekit/fx/ShaderFx';
import { GameIcon } from '../../../ui';
import RideScene, { carSize, frameBox } from './RideScene';
import StampPlate from './StampPlate';
import { buildTrack, rideVariant, sampleTrack, tAtU, uAtX } from './rideTrack';
import { useRideArt, useRider } from './rideAssets';
import { catchSound, duckForCheer } from './catchAudio';
import {
  GRADE_HOLD_MS, GRADE_LABEL, RIDE_START, READY_PIPS, gradeOffset, isGoodShot, photoPayload, rideProgress, rideSpec,
  rideStep, shotOffsetMs, type PhotoGrade, type RideState,
} from '../ridePhoto';
import { rarityColor, rarityLabel, rarityTier } from '../findPresentation';

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);
const HAND_ART = require('../../../../assets/images/ride-photo/tap-hand.webp');
const SPARKLE_ART = require('../../../../assets/images/ride-photo/sparkle.webp');

const BAR_H = 136;
/** The app's tab bar sits over the bottom of the map; the camera bar sits above it. */
const NAV_CLEARANCE = 40;
const SHUTTER = 86;
const PRINT_W = 220;
const PHOTO_W = PRINT_W - 20;
const PHOTO_H = 150;
const PRINT_H = PHOTO_H + 10 + 46;
const INK = '#0b2f5c';
const OPEN_MS = 280;
/** Before the first pass, the find hops from the map into the seat and the car rocks: about 0.6 s. */
const HOP_MS = 380;
const RETRY_LEAD_MS = 900;
/** Consecutive Good-or-better first-pass shots this app session: a little "one more" pull, no economy. */
let photoStreak = 0;

const FRAME_FILL: Record<PhotoGrade, [string, string]> = {
  blurry: ['#eef2f7', '#dfe6ef'], good: ['#ffffff', '#f1f4f8'], great: ['#f7f9fc', '#b6c3d4'], frame_it: ['#fff1a8', '#e3a400'],
};
const BURST: Record<PhotoGrade, string | null> = { blurry: null, good: '#ffffff', great: '#d8e4f2', frame_it: '#ffcf3b' };

function buzz(intent: HapticIntent, priority = 2) { queueHaptic(intent, priority); }

/** Instant-film develop: deep teal-black to full colour (d = 0..1). Worklet. */
function filmMatrix(d: number): number[] {
  'worklet';
  const k = Math.max(0, Math.min(1, d));
  const lum = (1 - k) * 0.35;
  const sat = k;
  const r = 0.2126, g = 0.7152, b = 0.0722;
  const s = (x: number, y: number) => (1 - sat) * x + (x === y ? sat : 0);
  const scale = 0.35 + 0.65 * k;
  return [
    (s(r, r) * (1 - lum) + lum * r) * scale, s(g, r) * scale, s(b, r) * scale, 0, 0.02 * (1 - k),
    s(r, g) * scale, (s(g, g) * (1 - lum) + lum * g) * scale, s(b, g) * scale, 0, 0.12 * (1 - k),
    s(r, b) * scale, s(g, b) * scale, (s(b, b) * (1 - lum) + lum * b) * scale, 0, 0.16 * (1 - k),
    0, 0, 0, 1, 0,
  ];
}

export interface RideStageHandle {
  /** Start opening now, on the tap's frame, before the catch request round trip. */
  prime: (from: { x: number; y: number } | null) => void;
  unprime: () => void;
}

export interface RidePhotoProps {
  readonly item: PrepItemType | null;
  readonly active: boolean;
  readonly from: { x: number; y: number } | null;
  readonly layer: { width: number; height: number };
  readonly reducedMotion: boolean;
  /** First-ever Ride Photo: the car freezes in the frame and the hand points at the shutter. */
  readonly showHint: boolean;
  /** The final good shot: start the server call now, while the photo develops. */
  readonly onCaught: (details: RedeemCatchDetails, grade: PhotoGrade) => void;
  /** The grade has held; the print sits here, ready to fly. */
  readonly onPrintReady: (grade: PhotoGrade, print: SkImage | null) => void;
  /** Where the print flies (layer points); set by the parent once the catch is confirmed. */
  readonly flyTarget: { x: number; y: number } | null;
  readonly onPrintLanded: () => void;
  readonly onRodeOff: () => void;
  readonly onClose: () => void;
  /** The parent is closing the view. */
  readonly closing: boolean;
  /** Development recordings: latency-compensated shot offsets per pass (ms; negative is early). */
  readonly autoShots?: number[] | null;
}

/**
 * Ride Photo, the catch for Uncommon and rarer finds: a full-screen camera
 * viewfinder on a little coaster. Tap the big shutter as the car hits the lit
 * frame. Grading is in milliseconds at the touch (latency compensated); the
 * camera's ready light and pips count the car in. The stage is mounted ahead
 * of time while a Ride Photo find is near, so the open costs nothing.
 */
const RidePhotoCatch = forwardRef<RideStageHandle, RidePhotoProps>(function RidePhotoCatch({ item, active, from, layer,
  reducedMotion, showHint, onCaught, onPrintReady, flyTarget, onPrintLanded, onRodeOff, onClose, closing, autoShots }, ref) {
  const spec = useMemo(() => rideSpec(item?.rarity ?? 3), [item?.rarity]);
  const sceneW = layer.width;
  const sceneH = Math.max(320, layer.height - BAR_H - NAV_CLEARANCE);
  const variant = useMemo(() => rideVariant(item?.id ?? 0), [item?.id]);
  const lut = useMemo(() => buildTrack(spec.track, sceneW, sceneH, undefined,
    { top: sceneH * 0.28, height: sceneH * 0.62 }, variant.frameShift), [spec.track, sceneW, sceneH, variant.frameShift]);
  // Mastery: an item you already own skips the lift hill and holds its grade a little shorter.
  const owned = item?.is_new_variant === false;
  const samples = useMemo(() => ({ xs: lut.xs, ys: lut.ys, angles: lut.angles }), [lut]);
  const box = useMemo(() => frameBox(lut, sceneW), [lut, sceneW]);
  const car = carSize(sceneW);
  const track = spec.track;
  const passMs = spec.passMs;
  // Timeline anchors (fractions of a pass).
  const anchors = useMemo(() => {
    const uFrame = uAtX(samples, lut.frameX);
    const tFrame = tAtU(track, uFrame);
    const uStation = uAtX(samples, sceneW * 0.16);
    const tStation = tAtU(track, uStation);
    const tRetry = Math.max(tStation, tFrame - RETRY_LEAD_MS / passMs);
    return { uFrame, tFrame, uStation, tStation, tRetry };
  }, [samples, lut.frameX, track, sceneW, passMs]);

  const art = useRideArt();
  const riderSource = item ? (item.icon_url && /^(https?|file):/i.test(item.icon_url) ? item.icon_url : null) : null;
  const rider = useRider(riderSource);
  const images = useMemo(() => ({ far: art.far, near: art.near, carBack: art.carBack, carFront: art.carFront,
    camera: art.camera, sparkle: art.sparkle, rider }), [art, rider]);

  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);
  const parkedMode = reducedMotion || screenReader;
  const golden = item?.golden_hour === true;

  const [ride, setRide] = useState<RideState>(RIDE_START);
  const rideRef = useRef(ride);
  rideRef.current = ride;
  const [print, setPrint] = useState<{ grade: PhotoGrade; soClose: boolean; key: number } | null>(null);
  const [printImage, setPrintImage] = useState<SkImage | null>(null);
  const [missNote, setMissNote] = useState<{ dir: 'early' | 'late'; key: number } | null>(null);
  const [nudge, setNudge] = useState(false);
  const [handOn, setHandOn] = useState(false);
  const [missedPile, setMissedPile] = useState(0);
  const [streak, setStreak] = useState(photoStreak);
  const silentPasses = useRef(0);
  const fx = useRef<FxStageHandle>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, run: () => void) => { timers.current.push(setTimeout(run, ms)); }, []);
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  useEffect(() => clearTimers, [clearTimers]);
  const skipHold = useRef<(() => void) | null>(null);

  // ── Shared values: every moving thing runs on the UI thread ────────────
  const open = useSharedValue(0);
  const t = useSharedValue(0);
  const carVis = useSharedValue(1);
  const armed = useSharedValue(false);
  const frozen = useSharedValue(false);
  const hintFreeze = useSharedValue(false);
  const parked = useSharedValue(parkedMode);
  const misses = useSharedValue(0);
  const flash = useSharedValue(0);
  const dim = useSharedValue(0);
  const ghostU = useSharedValue(0);
  const ghost = useSharedValue(0);
  const riderIn = useSharedValue(0);
  const rock = useSharedValue(0);
  const ready = useSharedValue(0);
  const glow = useSharedValue(0);
  const pipStage = useSharedValue(0);
  const press = useSharedValue(1);
  const iris = useSharedValue(0);
  const shake = useSharedValue(0);
  const printIn = useSharedValue(0);
  const printLift = useSharedValue(0);
  const printShake = useSharedValue(0);
  const develop = useSharedValue(0);
  const stampIn = useSharedValue(0);
  const burst = useSharedValue(0);
  const sheen = useSharedValue(0);
  const fly = useSharedValue(0);
  const edgeGlint = useSharedValue(0);
  const hop = useSharedValue(0);
  const nudgeBlink = useSharedValue(0);
  useEffect(() => { parked.value = parkedMode; }, [parkedMode, parked]);

  const uFrame = anchors.uFrame;
  const u = useDerivedValue(() => (parked.value && armed.value ? uFrame : rideProgress(track, t.value)));

  // ── Telegraph: red, yellow, green light and rising pips, timed by arrival ──
  const tFrame = anchors.tFrame;
  const pip = useCallback((i: number) => {
    catchSound(i === 0 ? 'pip0' : i === 1 ? 'pip3' : 'pip7');
    if (i === 2) { catchSound('charge'); buzz('tickSelection', 1); }
  }, []);
  const freezeForHint = useCallback(() => { setHandOn(true); buzz('tickSelection', 1); }, []);
  useAnimatedReaction(() => (armed.value && !parked.value ? (tFrame - t.value) * passMs : null), ms => {
    if (ms == null) {
      if (parked.value && armed.value) { ready.value = 3; glow.value = 1; }
      return;
    }
    ready.value = ms > 1000 ? 0 : ms > 600 ? 1 : ms > 200 ? 2 : ms > -160 ? 3 : 0;
    glow.value = Math.max(0, 1 - Math.abs(ms) / 650);
    for (let i = 0; i < READY_PIPS.length; i++) {
      if (pipStage.value === i && ms <= READY_PIPS[i].atMs) { pipStage.value = i + 1; runOnJS(pip)(i); }
    }
    if (hintFreeze.value && !frozen.value && ms <= 0) {
      frozen.value = true;
      cancelAnimation(t);
      t.value = tFrame;
      ready.value = 3; glow.value = 1;
      runOnJS(freezeForHint)();
    }
  });

  // ── A pass of the car ──────────────────────────────────────────────────
  const shotThisPass = useRef(false);
  const passEndRef = useRef<() => void>(() => undefined);
  const runPass = useCallback((fromT: number) => {
    shotThisPass.current = false;
    pipStage.value = 0;
    frozen.value = false;
    armed.value = true;
    if (parkedMode) { ready.value = 3; glow.value = 1; return; }
    t.value = fromT;
    carVis.value = withTiming(1, { duration: 140 });
    const end = () => passEndRef.current();
    t.value = withTiming(1, { duration: Math.max(200, (1 - fromT) * passMs), easing: Easing.linear }, done => {
      if (done) runOnJS(end)();
    });
    if (fromT <= anchors.tStation + 0.01 && (track === 'hill' || track === 'dark')) catchSound('clack', { volume: 0.8 });
    else catchSound('whoosh', { volume: 0.5 });
  }, [parkedMode, passMs, anchors.tStation, track, t, carVis, armed, pipStage, frozen, ready, glow]);

  const retry = useCallback((missed: boolean) => {
    if (rideRef.current.outcome !== 'riding') return;
    // The car whips around off screen and comes back already over the hill.
    later(missed ? 300 : 380, () => runPass(anchors.tRetry));
  }, [later, runPass, anchors.tRetry]);

  passEndRef.current = () => {
    armed.value = false;
    ready.value = 0;
    if (shotThisPass.current) return;
    // No tap this pass: the camera blinks and asks, and the hint comes back after two.
    silentPasses.current += 1;
    const next = rideStep(spec, rideRef.current, { type: 'pass_end' });
    setRide(next);
    if (next.outcome === 'rode_off') { onRodeOff(); return; }
    setNudge(true);
    nudgeBlink.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 120 }),
      withTiming(1, { duration: 120 }), withTiming(0, { duration: 160 }));
    catchSound('pip0', { volume: 0.6 });
    later(1300, () => setNudge(false));
    if (silentPasses.current >= 2) hintFreeze.value = true;
    retry(true);
  };

  // ── Open: on the tap's frame. The find hops into the seat, the car rocks, then rolls ──
  const opened = useRef(false);
  const startOpen = useCallback((at: { x: number; y: number } | null) => {
    if (opened.current) return;
    opened.current = true;
    clearTimers();
    const fx0 = at ?? { x: layer.width / 2, y: layer.height / 2 };
    hopFrom.current = fx0;
    setPrint(null); setPrintImage(null); setMissNote(null); setNudge(false); setHandOn(false); setMissedPile(0); setStreak(photoStreak);
    setRide(RIDE_START);
    silentPasses.current = 0;
    misses.value = 0; fly.value = 0; dim.value = 0; burst.value = 0; printIn.value = 0; stampIn.value = 0;
    t.value = anchors.tStation; armed.value = false; riderIn.value = 0; hop.value = 0; ghost.value = 0;
    hintFreeze.value = showHint && !parkedMode;
    open.value = reducedMotion ? withTiming(1, { duration: 120 })
      : withSpring(1, { damping: 22, stiffness: 320, mass: 0.7, overshootClamping: false });
    hop.value = withDelay(reducedMotion ? 0 : 90, withTiming(1, { duration: reducedMotion ? 1 : HOP_MS, easing: Easing.inOut(Easing.cubic) }));
    riderIn.value = withDelay(reducedMotion ? 0 : 90 + HOP_MS, withSequence(withTiming(1.0001, { duration: 1 }),
      withSpring(1, { damping: 8, stiffness: 300 })));
    rock.value = withDelay(90 + HOP_MS + 40, withSequence(withTiming(1, { duration: 120 }), withTiming(-1, { duration: 120 }),
      withTiming(0.5, { duration: 100 }), withTiming(0, { duration: 100 })));
    buzz('tapLight', 1);
    catchSound('whoosh', { volume: 0.6 });
    later(reducedMotion ? 150 : 90 + HOP_MS, () => { catchSound('pop', { volume: 0.7 }); buzz('hitSoft', 1); });
    later(reducedMotion ? 200 : 90 + HOP_MS + 420, () => runPass(owned ? anchors.tRetry : anchors.tStation));
  }, [clearTimers, layer.width, layer.height, anchors.tStation, showHint, parkedMode, reducedMotion, runPass]); // eslint-disable-line react-hooks/exhaustive-deps
  const hopFrom = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    prime: at => startOpen(at),
    unprime: () => {
      if (!opened.current) return;
      opened.current = false;
      clearTimers();
      armed.value = false;
      cancelAnimation(t);
      open.value = withTiming(0, { duration: 160 });
    },
  }), [startOpen, clearTimers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active) startOpen(from);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!closing) return;
    clearTimers();
    armed.value = false;
    cancelAnimation(t);
    cancelAnimation(rock);
    open.value = withTiming(0, { duration: reducedMotion ? 120 : 260, easing: Easing.in(Easing.cubic) });
    later(280, () => {
      opened.current = false; setPrint(null); setPrintImage(null);
      printIn.value = 0; fly.value = 0; dim.value = 0; burst.value = 0; ghost.value = 0;
    });
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The shot ───────────────────────────────────────────────────────────
  const snapshot = useCallback((shotU: number) => {
    // One still at touch-down, drawn offscreen once: the scene at the shot with no frame UI (a clean
    // photo, centred on the flash frame, so an off-time shot shows the car off-centre). The print
    // develops this image; nothing re-renders the scene while it does.
    try {
      return drawAsImage(
        <RideScene width={sceneW} height={sceneH} lut={lut} art={images} u={u} frameGlow={glow} ready={ready}
          flash={flash} dim={dim} ghostU={ghostU} ghost={ghost} riderIn={riderIn} rock={rock} carVis={carVis}
          golden={golden} staticOnly staticU={shotU} />, { width: sceneW, height: sceneH });
    } catch { return null; }
  }, [box, lut, sceneW, sceneH, images, golden]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishHold = useRef<(() => void) | null>(null);
  const developPrint = useCallback((grade: PhotoGrade, soClose: boolean, caught: boolean) => {
    const key = Date.now();
    setPrint({ grade, soClose, key });
    printIn.value = 0; develop.value = 0; stampIn.value = 0; printLift.value = 0; sheen.value = 0;
    printIn.value = reducedMotion ? withTiming(1, { duration: 120 }) : withSpring(1, { damping: 13, stiffness: 260, mass: 0.7 });
    catchSound('pop', { volume: 0.6 });
    if (grade === 'blurry') {
      develop.value = withTiming(1, { duration: 160 });
      stampIn.value = withDelay(120, reducedMotion ? withTiming(1, { duration: 1 }) : withSequence(
        withTiming(2.2, { duration: 0 }), withTiming(1, { duration: 140, easing: Easing.in(Easing.quad) })));
      later(130, () => { catchSound('aww'); buzz('softBump', 2); later(90, () => buzz('softBump', 1)); });
      // The print flips face-down out of the way while the car comes back around.
      later(GRADE_HOLD_MS.blurry, () => { printIn.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }); });
      later(GRADE_HOLD_MS.blurry + 220, () => setPrint(current => (current?.key === key ? null : current)));
      return;
    }
    catchSound('film', { volume: 0.7 });
    const beats = spec.developBeats;
    const beatMs = 360;
    for (let i = 0; i < beats; i++) {
      later(240 + i * beatMs, () => {
        develop.value = withTiming((i + 1) / (beats + 1), { duration: beatMs - 80, easing: Easing.out(Easing.quad) });
        printShake.value = reducedMotion ? 0 : withSequence(withTiming(1, { duration: 50 }), withTiming(-1, { duration: 70 }),
          withTiming(0.5, { duration: 60 }), withTiming(0, { duration: 60 }));
        catchSound('tick', { pitch: i * 2, volume: 0.8 });
        buzz('tickSelection', 1);
        fx.current?.burst('glints', layer.width / 2 + PRINT_W / 2 - 14, printTop + 16);
        // The tell: on the last beat a Frame It! print catches a gold edge glint before the reveal.
        if (i === beats - 1 && grade === 'frame_it') { edgeGlint.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 220 })); }
      });
    }
    // The held breath, then the reveal.
    const reveal = 240 + beats * beatMs + 200;
    later(reveal, () => {
      develop.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      sheen.value = 0;
      sheen.value = withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) });
      printLift.value = reducedMotion ? withTiming(1, { duration: 1 }) : withSpring(1, { damping: 12, stiffness: 220, mass: 0.8 });
      dim.value = withTiming(1, { duration: 220 });
      if (BURST[grade]) burst.value = withTiming(1, { duration: 160 });
      stampIn.value = reducedMotion ? withTiming(1, { duration: 1 }) : withSequence(
        withTiming(2.2, { duration: 0 }), withDelay(80, withTiming(1, { duration: 140, easing: Easing.in(Easing.quad) })));
      const amp = grade === 'frame_it' ? 4 : grade === 'great' ? 2 : 0;
      if (amp && !reducedMotion) shake.value = withDelay(200, withSequence(withTiming(amp, { duration: 30 }), withTiming(-amp, { duration: 40 }),
        withTiming(amp * 0.5, { duration: 40 }), withTiming(0, { duration: 40 })));
      later(200, () => {
        if (grade === 'frame_it') {
          duckForCheer(); catchSound('cheer'); catchSound('chime');
          fx.current?.burst('confetti', layer.width / 2, printTop + PRINT_H / 2);
          buzz('comboHeavy', 4); later(120, () => buzz('success', 3));
        } else if (grade === 'great') {
          catchSound('chime'); catchSound('sparkle'); fx.current?.burst('sparkles', layer.width / 2, printTop + PRINT_H / 2); buzz('success', 3);
        } else {
          catchSound('chime'); fx.current?.burst('stars', layer.width / 2, printTop + PRINT_H / 2); buzz('hitMedium', 3);
        }
        AccessibilityInfo.announceForAccessibility(`${GRADE_LABEL[grade]} ${caught ? 'Caught it!' : ''}`);
      });
      const hold = Math.round(GRADE_HOLD_MS[grade] * (owned ? 0.6 : 1));
      const done = () => {
        finishHold.current = null;
        burst.value = withTiming(0, { duration: 250 });
        if (caught) onPrintReady(grade, printImageRef.current);
        else {
          // Epic's first photo: it slides aside and the car goes around again.
          printIn.value = withTiming(0, { duration: 200 });
          dim.value = withTiming(0, { duration: 200 });
          later(220, () => setPrint(null));
          retry(false);
        }
      };
      finishHold.current = done;
      later(200 + hold, () => { if (finishHold.current === done) done(); });
    });
  }, [spec.developBeats, reducedMotion, later, layer.width, onPrintReady, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  const printImageRef = useRef<SkImage | null>(null);
  skipHold.current = () => { const done = finishHold.current; if (done) done(); };

  const onShot = useCallback((grade: PhotoGrade, offset: number, direction: 'early' | 'late' | null, soClose: boolean, shotUAt: number) => {
    shotThisPass.current = true;
    silentPasses.current = 0;
    setHandOn(false);
    const image = snapshot(shotUAt);
    printImageRef.current = image;
    setPrintImage(image);
    catchSound(grade === 'frame_it' ? 'shutterGold' : 'shutter');
    catchSound('flash', { volume: 0.8 });
    buzz('hitRigid', 4);
    const next = rideStep(spec, rideRef.current, { type: 'shot', grade });
    setRide(next);
    AccessibilityInfo.announceForAccessibility(isGoodShot(grade) ? GRADE_LABEL[grade] : direction === 'early' ? 'Too soon. Try again.' : 'Too late. Try again.');
    if (!isGoodShot(grade)) {
      misses.value = Math.min(3, misses.value + 1);
      if (direction) setMissNote({ dir: direction, key: Date.now() });
      later(GRADE_HOLD_MS.blurry + 200, () => setMissedPile(count => count + 1));
      photoStreak = 0;
      later(1200, () => setMissNote(null));
      developPrint('blurry', soClose, false);
      // Replay: a ghost car slides to where the shot should have been.
      ghostU.value = u.value;
      ghost.value = withSequence(withTiming(1, { duration: 80 }), withDelay(420, withTiming(0, { duration: 200 })));
      ghostU.value = withTiming(uFrame, { duration: 420, easing: Easing.inOut(Easing.quad) });
      // The car whooshes off; the next chance comes within 1.4 s.
      carVis.value = withTiming(0, { duration: 140 });
      cancelAnimation(t);
      if (next.outcome === 'rode_off') { later(900, onRodeOff); return; }
      retry(true);
      return;
    }
    if (rideRef.current.passes === 0) photoStreak += 1;
    setStreak(photoStreak);
    if (next.outcome === 'caught') onCaught(photoPayload(spec, next), grade);
    developPrint(grade, false, next.outcome === 'caught');
    // Hit-stop, then the car rolls on out of the scene.
    later(130, () => {
      if (parkedMode) return;
      t.value = withTiming(1, { duration: Math.max(240, (1 - t.value) * passMs), easing: Easing.linear });
    });
  }, [snapshot, spec, developPrint, onCaught, onRodeOff, retry, later, parkedMode, passMs, uFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  const arrivalMs = anchors.tFrame * passMs;
  const shoot = useCallback(() => {
    'worklet';
    if (!armed.value) return;
    armed.value = false;
    let grade: PhotoGrade = 'great';
    let offset = 0;
    let direction: 'early' | 'late' | null = null;
    let soClose = false;
    if (frozen.value) {
      grade = 'frame_it';
    } else if (!parked.value) {
      offset = shotOffsetMs(t.value * passMs, arrivalMs);
      const result = gradeOffset(offset, misses.value);
      grade = result.grade; direction = result.direction; soClose = result.soClose;
    }
    cancelAnimation(t);
    flash.value = withSequence(withTiming(0.9, { duration: 40 }), withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) }));
    iris.value = withSequence(withTiming(1, { duration: 55 }), withTiming(0, { duration: 140 }));
    ready.value = 0;
    runOnJS(onShot)(grade, offset, direction, soClose, u.value);
  }, [passMs, arrivalMs, onShot]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = useMemo(() => Gesture.Tap().maxDuration(100_000).onBegin(() => {
    'worklet';
    press.value = withTiming(0.86, { duration: 60 });
    shoot();
  }).onFinalize(() => {
    'worklet';
    press.value = withSpring(1, { damping: 12, stiffness: 400, mass: 0.5 });
  }), [shoot]); // eslint-disable-line react-hooks/exhaustive-deps
  // A tap during the hold skips ahead.
  const skip = useMemo(() => Gesture.Tap().onEnd(() => {
    'worklet';
    runOnJS(callSkip)();
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  function callSkip() { skipHold.current?.(); }

  // Development recordings only: shoot at a scripted latency-compensated offset per pass.
  const autoPass = useSharedValue(0);
  const script = __DEV__ ? autoShots ?? null : null;
  useAnimatedReaction(() => (script && armed.value && !frozen.value ? shotOffsetMs(t.value * passMs, arrivalMs) : null), offset => {
    if (offset == null || !script) return;
    if (offset >= script[Math.min(script.length - 1, autoPass.value)]) {
      autoPass.value += 1;
      press.value = withSequence(withTiming(0.86, { duration: 60 }), withSpring(1));
      shoot();
    }
  });
  useEffect(() => {
    if (!__DEV__ || !script || !handOn) return;
    const timer = setTimeout(() => runOnUI(shoot)(), 900);
    return () => clearTimeout(timer);
  }, [handOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The print flies into the collection badge ──────────────────────────
  const printTop = Math.max(24, sceneH * 0.08);
  useEffect(() => {
    if (!flyTarget) return;
    fly.value = withTiming(1, { duration: reducedMotion ? 1 : 520, easing: Easing.inOut(Easing.cubic) }, done => {
      if (done) runOnJS(onPrintLanded)();
    });
    dim.value = withTiming(0, { duration: 300 });
    catchSound('whoosh', { volume: 0.6 });
    for (let i = 1; i <= 6; i++) later(i * 70, () => trailBurst(i / 7));
  }, [flyTarget]); // eslint-disable-line react-hooks/exhaustive-deps
  const flyFrom = { x: layer.width / 2, y: printTop + PRINT_H / 2 };
  const trailBurst = (f: number) => {
    if (!flyTarget) return;
    const e = f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
    const x = flyFrom.x + (flyTarget.x - flyFrom.x) * e;
    const y = flyFrom.y + (flyTarget.y - flyFrom.y) * e - 140 * 4 * e * (1 - e);
    fx.current?.burst('glints', x, y);
  };

  // ── Styles ─────────────────────────────────────────────────────────────
  const fromPt = from ?? hopFrom.current;
  const viewStyle = useAnimatedStyle(() => {
    const o = open.value;
    const s = Math.min(1.03, 0.14 + 0.86 * o);
    return {
      opacity: Math.min(1, o * 2.2),
      borderRadius: 44 * (1 - Math.min(1, o)),
      transform: [{ translateX: (fromPt.x - layer.width / 2) * (1 - Math.min(1, o)) + shake.value },
        { translateY: (fromPt.y - layer.height / 2) * (1 - Math.min(1, o)) }, { scale: s }],
    };
  });
  const irisTop = useAnimatedStyle(() => ({ height: (sceneH / 2) * iris.value }));
  const irisBottom = useAnimatedStyle(() => ({ height: (sceneH / 2) * iris.value }));
  const shutterDisc = useAnimatedStyle(() => ({ transform: [{ scale: press.value }],
    backgroundColor: ready.value === 3 ? '#fff6cf' : '#ffffff' }));
  const ringLen = Math.PI * (SHUTTER - 6);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: ringLen * (1 - glow.value) }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * glow.value }));
  const handLoop = useSharedValue(0);
  useEffect(() => {
    if (!handOn) { cancelAnimation(handLoop); handLoop.value = 0; return; }
    handLoop.value = withRepeat(withSequence(withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) })), -1, false);
    return () => cancelAnimation(handLoop);
  }, [handOn, handLoop]);
  const handStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -8 * handLoop.value }, { translateY: -8 * handLoop.value }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.9 - 0.6 * handLoop.value, transform: [{ scale: 1 + 0.25 * handLoop.value }] }));

  // Hop: the find's own art arcs from its map spot into the seat.
  const seatStart = sampleTrack(samples, anchors.uStation);
  const seat = { x: seatStart.x + car.w * (0.43 - 0.5), y: seatStart.y - car.h * 0.96 + car.h * 0.5 - car.rider * 0.45 };
  const hopStyle = useAnimatedStyle(() => {
    const h = hop.value;
    const squash = h < 0.12 ? 1 - h * 1.2 : 1;
    const x = fromPt.x + (seat.x - fromPt.x) * h;
    const y = fromPt.y + (seat.y - fromPt.y) * h - 120 * 4 * h * (1 - h);
    return { opacity: h > 0 && h < 1 ? 1 : 0,
      transform: [{ translateX: x - car.rider / 2 }, { translateY: y - car.rider / 2 }, { scaleX: 1 / squash }, { scaleY: squash * (1 + 0.2 * Math.sin(h * Math.PI)) }] };
  });

  const printStyle = useAnimatedStyle(() => {
    const f = fly.value;
    const e = f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
    const target = flyTarget ?? flyFrom;
    const lift = printLift.value;
    const baseY = printTop + (sceneH * 0.5 - printTop - PRINT_H / 2) * lift;
    const x = flyFrom.x + (target.x - flyFrom.x) * e - PRINT_W / 2;
    const y = baseY + (target.y - (baseY + PRINT_H / 2)) * e - 140 * 4 * e * (1 - e);
    const scale = (0.62 + 0.38 * printIn.value) * (1 + 0.32 * lift) * (1 - e * 0.78);
    // Gone once it lands in the badge, and whenever the viewfinder is shut.
    const shown = open.value > 0.02 && f < 0.999 ? 1 : 0;
    return {
      opacity: Math.min(1, printIn.value * 2) * shown,
      transform: [{ translateX: x }, { translateY: y + (1 - printIn.value) * 90 }, { scale },
        { rotate: `${-4 + printShake.value * 3 + e * 12}deg` }],
    };
  });
  const stampStyle = useAnimatedStyle(() => ({ opacity: stampIn.value > 0 ? 1 : 0, transform: [{ scale: stampIn.value || 1 }] }));
  const devMatrix = useDerivedValue(() => filmMatrix(develop.value));
  // The photo is framed on the flash frame: a centred shot fills it, an off shot does not.
  const crop = useMemo(() => {
    const w = box.w * 1.9;
    const h = w * (PHOTO_H / PHOTO_W);
    return { x: lut.frameX - w / 2, y: box.y + box.h * 0.5 - h / 2, k: PHOTO_W / w };
  }, [box, lut.frameX]);
  const grainOpacity = useDerivedValue(() => 0.04 + 0.4 * (1 - develop.value));
  const nudgeStyle = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * nudgeBlink.value }));
  const glintStyle = useAnimatedStyle(() => ({ opacity: edgeGlint.value }));

  const name = item?.name ?? '';
  const tier = rarityTier(item?.rarity);
  const color = rarityColor(item?.rarity);
  const visible = active || opened.current;
  const caption = `${name} · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  if (!item || layer.width === 0) return null;
  return (
    <View pointerEvents={visible && !closing ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={print && !closing ? skip : tap}>
        <Animated.View style={[styles.view, { width: layer.width, height: layer.height }, viewStyle]}
          accessible accessibilityRole="button" accessibilityLabel={`Take the ride photo of ${name}`}
          accessibilityHint="Double tap when the car is in the frame" onAccessibilityTap={() => runOnUI(shoot)()}>
          <Canvas style={{ width: sceneW, height: sceneH }}>
            <RideScene width={sceneW} height={sceneH} lut={lut} art={images} u={u} frameGlow={glow} ready={ready}
              flash={flash} dim={dim} ghostU={ghostU} ghost={ghost} riderIn={riderIn} rock={rock} carVis={carVis} golden={golden} sunset={variant.sky === 'sunset'} />
            {BURST[print?.grade ?? 'blurry'] && <Sunburst cx={sceneW / 2} cy={printTop + PRINT_H / 2 + (sceneH * 0.5 - printTop - PRINT_H / 2)}
              radius={sceneW * (print?.grade === 'frame_it' ? 0.85 : 0.6)} intensity={burst} colorA={BURST[print?.grade ?? 'good'] ?? '#ffcf3b'} width={sceneW} height={sceneH} speed={0.35} />}
          </Canvas>
          <Animated.View pointerEvents="none" style={[styles.iris, { top: 0 }, irisTop]} />
          <Animated.View pointerEvents="none" style={[styles.iris, { top: undefined, bottom: BAR_H + NAV_CLEARANCE }, irisBottom]} />
          {/* Viewfinder corner marks */}
          <View pointerEvents="none" style={[styles.corner, { left: 14, top: 64, borderLeftWidth: 3, borderTopWidth: 3 }]} />
          <View pointerEvents="none" style={[styles.corner, { right: 14, top: 64, borderRightWidth: 3, borderTopWidth: 3 }]} />
          <View pointerEvents="none" style={[styles.corner, { left: 14, bottom: BAR_H + NAV_CLEARANCE + 14, borderLeftWidth: 3, borderBottomWidth: 3 }]} />
          <View pointerEvents="none" style={[styles.corner, { right: 14, bottom: BAR_H + NAV_CLEARANCE + 14, borderRightWidth: 3, borderBottomWidth: 3 }]} />

          {missNote && <View pointerEvents="none" style={[styles.missChip, { left: missNote.dir === 'early' ? box.x - 40 : box.x + box.w - 70, top: box.y - 54 }]}>
            {missNote.dir === 'late' && <Text style={styles.arrow}>◀</Text>}
            <Text style={styles.missText}>{missNote.dir === 'early' ? 'Too soon' : 'Too late'}</Text>
            {missNote.dir === 'early' && <Text style={styles.arrow}>▶</Text>}
          </View>}
          {nudge && <Animated.View pointerEvents="none" style={[styles.nudge, { top: box.y - 58 }, nudgeStyle]}>
            <GameIcon name="camera" size={22} />
            <Text style={styles.nudgeText}>Tap the camera!</Text>
          </Animated.View>}

          {/* Missed shots pile up face-down in the corner; they clear on the catch */}
          {missedPile > 0 && <View pointerEvents="none" style={styles.pile}>
            {Array.from({ length: Math.min(3, missedPile) }, (_, i) => <View key={i} style={[styles.pileCard, { transform: [{ rotate: `${-12 + i * 9}deg` }] }]} />)}
            <Text style={styles.pileText}>{missedPile}</Text>
          </View>}
          {streak >= 2 && <View pointerEvents="none" style={styles.streak}>
            <GameIcon name="streak" size={16} /><Text style={styles.streakText}>Photo streak ×{streak}</Text>
          </View>}

          {/* Camera bar: name, the big shutter, rarity */}
          <View style={[styles.bar, { height: BAR_H + NAV_CLEARANCE, paddingBottom: NAV_CLEARANCE + 10 }]} pointerEvents="box-none">
            <LinearGradient colors={['rgba(4,18,38,0.82)', '#041226']} style={StyleSheet.absoluteFill} />
            <View style={styles.barSide} pointerEvents="none">
              <Text style={styles.name} numberOfLines={2}>{name}</Text>
            </View>
            <View style={styles.shutterWrap} pointerEvents="none">
              <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
                <Svg width={SHUTTER} height={SHUTTER}>
                  <SvgCircle cx={SHUTTER / 2} cy={SHUTTER / 2} r={(SHUTTER - 6) / 2} stroke="rgba(255,255,255,0.95)" strokeWidth={5} fill="none" />
                  <AnimatedCircle cx={SHUTTER / 2} cy={SHUTTER / 2} r={(SHUTTER - 6) / 2} stroke="#ffcf3b" strokeWidth={5} fill="none"
                    strokeDasharray={`${ringLen} ${ringLen}`} animatedProps={ringProps} strokeLinecap="round"
                    rotation={-90} origin={`${SHUTTER / 2}, ${SHUTTER / 2}`} />
                </Svg>
              </Animated.View>
              <Animated.View style={[styles.disc, shutterDisc]} />
              {handOn && <>
                <Animated.View style={[styles.halo, haloStyle]} />
                <Animated.View style={[styles.hand, handStyle]}>
                  <Image source={HAND_ART} style={styles.handArt} contentFit="contain" transition={0} />
                </Animated.View>
              </>}
            </View>
            <View style={[styles.barSide, { alignItems: 'flex-end' }]} pointerEvents="none">
              <View style={[styles.rarity, { borderColor: color }]}>
                <View style={styles.pips}>
                  {tier >= 4 ? <Text style={[styles.pipGlyph, { color }]}>{tier === 5 ? '♛' : '◆'}</Text>
                    : Array.from({ length: Math.max(0, tier - 1) }, (_, i) => <View key={i} style={[styles.pip, { backgroundColor: color }]} />)}
                </View>
                <Text style={[styles.rarityText, { color }]}>{rarityLabel(item.rarity).toUpperCase()}</Text>
              </View>
              {spec.photosNeeded > 1 && <Text style={styles.sub}>Photo {Math.min(spec.photosNeeded, ride.photos.length + 1)} of {spec.photosNeeded}</Text>}
              {spec.maxRides != null && <Text style={styles.sub}>Ride {Math.min(spec.maxRides, ride.passes + 1)} of {spec.maxRides}</Text>}
            </View>
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Close the camera" hitSlop={10}
            onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {/* The find hops from the map into the seat */}
      {riderSource && <Animated.View pointerEvents="none" style={[styles.hop, { width: car.rider, height: car.rider }, hopStyle]}>
        <Image source={{ uri: riderSource }} style={{ width: car.rider, height: car.rider }} contentFit="contain" transition={0} />
      </Animated.View>}

      {/* The print: develops, holds with its grade, then flies to the badge */}
      <Animated.View pointerEvents="none" style={[styles.print, printStyle]}>
        <LinearGradient colors={FRAME_FILL[print?.grade ?? 'good']} style={[StyleSheet.absoluteFill, styles.printFill]} />
        {print?.grade === 'frame_it' && <View style={styles.goldBevel} />}
        <Animated.View style={[StyleSheet.absoluteFill, styles.glint, glintStyle]} />
        <View style={styles.photo}>
          <Canvas style={{ width: PHOTO_W, height: PHOTO_H }}>
            {printImage && <SkImageNode image={printImage} x={-crop.x * crop.k} y={-crop.y * crop.k}
              width={sceneW * crop.k} height={sceneH * crop.k} fit="fill">
              <ColorMatrix matrix={devMatrix} />
              {print?.grade === 'blurry' && <Blur blur={7} />}
            </SkImageNode>}
            {art.grain && <SkImageNode image={art.grain} x={0} y={0} width={PHOTO_W} height={PHOTO_H} fit="cover" opacity={grainOpacity} />}
            <Shimmer x={0} y={0} width={PHOTO_W} height={PHOTO_H} progress={sheen} alpha={0.5} />
            <Rect x={0} y={0} width={PHOTO_W} height={PHOTO_H} color="rgba(11,47,92,0.0)" />
          </Canvas>
        </View>
        <Text style={styles.caption} numberOfLines={1}>{caption}</Text>
        {print && <Animated.View style={[styles.stamp, stampStyle]}>
          <StampPlate grade={print.grade} soClose={print.soClose} size={0.86} />
        </Animated.View>}
      </Animated.View>

      <FxStage ref={fx} width={layer.width} height={layer.height} reducedMotion={reducedMotion} flashCap={0.15}
        style={StyleSheet.absoluteFill} />
      <Image source={SPARKLE_ART} style={styles.hidden} />
    </View>
  );
});

export default memo(RidePhotoCatch);

const styles = StyleSheet.create({
  view: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', backgroundColor: '#041226' },
  iris: { position: 'absolute', left: 0, right: 0, backgroundColor: '#020a16' },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: 'rgba(255,255,255,0.85)' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingBottom: 10 },
  barSide: { flex: 1, justifyContent: 'center' },
  name: { color: '#ffffff', fontFamily: 'Shark', fontSize: 16, lineHeight: 19 },
  shutterWrap: { width: SHUTTER, height: SHUTTER, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16 },
  disc: { width: SHUTTER - 20, height: SHUTTER - 20, borderRadius: (SHUTTER - 20) / 2 },
  halo: { position: 'absolute', width: SHUTTER + 18, height: SHUTTER + 18, borderRadius: (SHUTTER + 18) / 2, borderWidth: 4, borderColor: '#ffcf3b' },
  hand: { position: 'absolute', left: SHUTTER - 14, top: SHUTTER - 30, width: 54, height: 69 },
  handArt: { width: 54, height: 69, transform: [{ rotate: '-35deg' }] },
  rarity: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 2, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.08)' },
  rarityText: { fontFamily: 'Shark', fontSize: 14, letterSpacing: 0.6 },
  pips: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  pip: { width: 7, height: 7, borderRadius: 3.5 },
  pipGlyph: { fontSize: 14, lineHeight: 16 },
  sub: { color: '#bcd6f5', fontFamily: 'Knockout', fontSize: 14, marginTop: 4 },
  close: { position: 'absolute', left: 12, top: 10, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(4,18,38,0.45)' },
  closeText: { color: '#ffffff', fontSize: 20, lineHeight: 22 },
  missChip: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: INK, borderWidth: 2, borderColor: '#ffffff' },
  missText: { color: '#ffffff', fontFamily: 'Shark', fontSize: 15 },
  arrow: { color: '#ffcf3b', fontSize: 16 },
  nudge: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 18, backgroundColor: INK, borderWidth: 2, borderColor: '#ffcf3b' },
  nudgeText: { color: '#ffffff', fontFamily: 'Shark', fontSize: 16 },
  hop: { position: 'absolute', left: 0, top: 0 },
  print: { position: 'absolute', left: 0, top: 0, width: PRINT_W, height: PRINT_H, borderRadius: 8, padding: 10, paddingBottom: 46,
    shadowColor: '#021a36', shadowOffset: { width: 0, height: 12 }, shadowRadius: 16, shadowOpacity: 0.45 },
  printFill: { borderRadius: 8 },
  goldBevel: { position: 'absolute', left: 3, right: 3, top: 3, bottom: 3, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.65)' },
  photo: { width: PHOTO_W, height: PHOTO_H, borderRadius: 4, overflow: 'hidden', backgroundColor: '#0d2a33' },
  caption: { position: 'absolute', left: 12, bottom: 14, right: 96, color: INK, fontFamily: 'Knockout', fontSize: 14 },
  stamp: { position: 'absolute', right: -10, bottom: 2 },
  hidden: { width: 0, height: 0 },
  glint: { borderRadius: 8, borderWidth: 4, borderColor: '#fff3a6' },
  pile: { position: 'absolute', left: 18, bottom: BAR_H + NAV_CLEARANCE + 18, width: 46, height: 40 },
  pileCard: { position: 'absolute', left: 4, top: 4, width: 32, height: 28, borderRadius: 3, backgroundColor: '#e8eef6',
    borderWidth: 2, borderColor: INK },
  pileText: { position: 'absolute', right: 0, top: -6, color: '#ffffff', fontFamily: 'Shark', fontSize: 14,
    textShadowColor: INK, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0.1 },
  streak: { position: 'absolute', right: 14, top: 14, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(4,18,38,0.6)', borderWidth: 2, borderColor: '#ffcf3b' },
  streakText: { color: '#ffffff', fontFamily: 'Shark', fontSize: 14 },
});
