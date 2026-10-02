import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Canvas, Circle, ColorMatrix, Group, Image as SkImageNode, ImageShader, Path, Rect, Skia, type SkImage,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, cancelAnimation, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { PrepItemType } from '../../../models/prep-item-type';
import type { RedeemCatchDetails } from '../../../api/endpoints/me/prep-items/redeem';
import type { HapticIntent } from '../../../gamekit/Haptics';
import { FxStage, type FxStageHandle } from '../../../gamekit/fx/FxStage';
import { Sunburst, Shimmer } from '../../../gamekit/fx/ShaderFx';
import { GameIcon } from '../../../ui';
import RideScene, { buildRailsPicture, cameraBox, carSize, drawPhoto, frameBox, type SceneImages } from './RideScene';
import StampPlate from './StampPlate';
import { buildTrack, rideVariant, sampleTrack, tAtU, uAtX } from './rideTrack';
import { useRideArt, useRider } from './rideAssets';
import { catchHaptic, catchMark, catchSound, duckForCheer } from './catchAudio';
import {
  GRADE_HOLD_MS, GRADE_LABEL, RIDE_START, READY_PIPS, gradeOffset, hintMode, isGoodShot, openRules, createPrintClock, photoPayload, rideProgress,
  rideSpec, rideStep, shotOffsetMs, shutterAction, type PhotoGrade, type RideState,
} from '../ridePhoto';
import { rarityColor, rarityLabel, rarityTier } from '../findPresentation';

const HAND_ART = require('../../../../assets/images/ride-photo/tap-hand.webp');
const CAR_ICON = require('../../../../assets/images/ride-photo/car-back.webp');

const SHUTTER = 86;
/** The print is laid out at its hero size and only ever scaled down, so it stays sharp. */
const HERO_W = 270;
const PHOTO_W = HERO_W - 24;
const PHOTO_H = Math.round(PHOTO_W * 0.75);
const STRIP_H = 58;
const HERO_H = PHOTO_H + 12 + STRIP_H;
const REST_SCALE = 0.76;
/** The stamp plate is laid out at its slam size and scaled down from 1 to this. */
const PLATE_PEAK = 1.6;
const INK = '#0b2f5c';
const HOP_MS = 380;
const RETRY_LEAD_MS = 900;

type FrameStage = 'white' | 'silver' | 'gold';
const FRAME_FILL: Record<FrameStage, [string, string]> = {
  white: ['#ffffff', '#f1f4f8'], silver: ['#f7f9fc', '#b6c3d4'], gold: ['#fff1a8', '#e3a400'],
};
const STAGE_FOR: Record<PhotoGrade, FrameStage> = { blurry: 'white', good: 'white', great: 'silver', frame_it: 'gold' };
const BURST: Record<PhotoGrade, string | null> = { blurry: null, good: '#ffffff', great: '#d8e4f2', frame_it: '#ffcf3b' };

/** A 1 px placeholder so Skia image nodes never have to mount or unmount. */
const BLANK: SkImage = (() => {
  const surface = Skia.Surface.Make(1, 1);
  surface?.getCanvas().clear(Skia.Color('#2f5560'));
  return surface!.makeImageSnapshot();
})();

/** Consecutive Good-or-better first-pass shots this app session: a little "one more" pull, no economy. */
let photoStreak = 0;

function buzz(intent: HapticIntent, priority = 2) { catchHaptic(intent, priority); }

/** Instant film: a milky blue-teal base (#2f5560-ish) lifting to full colour (d = 0..1). Worklet. */
function filmMatrix(d: number): number[] {
  'worklet';
  const k = Math.max(0, Math.min(1, d));
  const sat = k, scale = 0.45 + 0.55 * k;
  const r = 0.2126, g = 0.7152, b = 0.0722;
  const m = (x: number, y: number) => ((1 - sat) * x + (x === y ? sat : 0)) * scale;
  return [
    m(r, r), m(g, r), m(b, r), 0, 0.14 * (1 - k),
    m(r, g), m(g, g), m(b, g), 0, 0.27 * (1 - k),
    m(r, b), m(g, b), m(b, b), 0, 0.3 * (1 - k),
    0, 0, 0, 1, 0,
  ];
}

export { BLANK as BLANK_IMAGE };

export interface RideStageHandle {
  /**
   * Start opening on the tap's frame, before the catch request round trip. The open runs once this
   * stage renders with `item` (a layout effect keyed on the item id), so the pass speed, windows and
   * hint rules are always that find's, never the previous find's.
   */
  prime: (item: PrepItemType, from: { x: number; y: number } | null) => void;
  unprime: () => void;
}

export interface RidePhotoProps {
  readonly item: PrepItemType | null;
  readonly active: boolean;
  /** The find's spot, in this (full-screen) layer's points. */
  readonly from: { x: number; y: number } | null;
  /** The whole screen. */
  readonly layer: { width: number; height: number };
  readonly insets: { top: number; bottom: number };
  readonly reducedMotion: boolean;
  /** First-ever Ride Photo (Uncommon or Rare): the car freezes in the frame for a guaranteed Frame It!. */
  readonly firstRide: boolean;
  readonly onCaught: (details: RedeemCatchDetails, grade: PhotoGrade) => void;
  /** The grade has held; the print is about to fly. */
  readonly onPrintReady: (grade: PhotoGrade, print: SkImage | null) => void;
  /** Where the print lands (this layer's points): the badge on the map. */
  readonly flyTarget: { x: number; y: number } | null;
  readonly onPrintLanded: () => void;
  readonly onRodeOff: () => void;
  /** Close before a catch: nothing was taken. */
  readonly onClose: () => void;
  readonly closing: boolean;
  /** The viewfinder fully covers the map (open >= 0.98): React-level catch state may commit now, unseen. */
  readonly onCovered?: () => void;
  /** The close iris has met in the middle: the map's chrome can come back behind the bars. */
  readonly onIrisClosed?: () => void;
  /** Development recordings: latency-compensated shot offsets per pass (ms; negative is early). */
  readonly autoShots?: number[] | null;
}

/**
 * Ride Photo, the catch for Uncommon and rarer finds: a true full-screen camera.
 * The app's header and tab bar slide away; the coaster runs from the status bar
 * down to a black camera band with an iOS-style shutter. One gesture is always
 * attached and decides what a tap means. Grading is in milliseconds at the touch.
 */
const RidePhotoCatch = forwardRef<RideStageHandle, RidePhotoProps>(function RidePhotoCatch({ item, active, from, layer, insets,
  reducedMotion, firstRide, onCaught, onPrintReady, flyTarget, onPrintLanded, onRodeOff, onClose, closing, autoShots, onCovered, onIrisClosed }, ref) {
  const spec = useMemo(() => rideSpec(item?.rarity ?? 3), [item?.rarity]);
  const tier = rarityTier(item?.rarity);
  const bandH = insets.bottom + 128;
  const sceneW = layer.width;
  const sceneH = Math.max(360, layer.height - bandH);
  const variant = useMemo(() => rideVariant(item?.id ?? 0), [item?.id]);
  const sky = spec.track === 'dark' ? 'night' : variant.sky;
  const lut = useMemo(() => buildTrack(spec.track, sceneW, sceneH, undefined,
    { top: Math.max(insets.top + 70, sceneH * 0.3), height: sceneH * 0.6 }, variant.frameShift),
  [spec.track, sceneW, sceneH, insets.top, variant.frameShift]);
  const rails = useMemo(() => buildRailsPicture(lut, sceneW, sceneH, sky), [lut, sceneW, sceneH, sky]);
  const samples = useMemo(() => ({ xs: lut.xs, ys: lut.ys, angles: lut.angles }), [lut]);
  const box = useMemo(() => frameBox(lut, sceneW), [lut, sceneW]);
  const car = carSize(sceneW);
  const track = spec.track;
  const passMs = spec.passMs;
  const owned = item?.is_new_variant === false;
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
  const images: SceneImages = useMemo(() => ({ far: art.far, near: art.near, carBack: art.carBack, carFront: art.carFront,
    camera: art.camera, cameraPole: art.cameraPole, sparkle: art.sparkle, rider }), [art, rider]);

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
  const [frameStage, setFrameStage] = useState<FrameStage>('white');
  const [printImage, setPrintImage] = useState<SkImage | null>(null);
  const [missNote, setMissNote] = useState<{ dir: 'early' | 'late'; key: number } | null>(null);
  const [nudge, setNudge] = useState(false);
  const [handOn, setHandOn] = useState(false);
  const [missed, setMissed] = useState<SkImage[]>([]);
  const [streak, setStreak] = useState(photoStreak);
  const silentPasses = useRef(0);
  const fx = useRef<FxStageHandle>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, run: () => void) => { timers.current.push(setTimeout(run, ms)); }, []);
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  useEffect(() => clearTimers, [clearTimers]);

  // ── Shared values: every moving thing runs on the UI thread ────────────
  const open = useSharedValue(0);
  const iris = useSharedValue(0);
  const veil = useSharedValue(1);
  const t = useSharedValue(0);
  const carVis = useSharedValue(1);
  const armed = useSharedValue(false);
  const holding = useSharedValue(false);
  const frozen = useSharedValue(false);
  const hintFreeze = useSharedValue(false);
  const parked = useSharedValue(parkedMode);
  const misses = useSharedValue(0);
  const flash = useSharedValue(0);
  const dim = useSharedValue(0);
  const lit = useSharedValue(0);
  const ghostU = useSharedValue(0);
  const ghost = useSharedValue(0);
  const riderIn = useSharedValue(0);
  const rock = useSharedValue(0);
  const ready = useSharedValue(0);
  const approach = useSharedValue(0);
  const press = useSharedValue(1);
  const wobble = useSharedValue(0);
  const shake = useSharedValue(0);
  const printIn = useSharedValue(0);
  const printLift = useSharedValue(0);
  const printTick = useSharedValue(1);
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

  // ── Telegraph on the target: brackets close in, red/yellow/green lamps, rising pips ──
  const tFrame = anchors.tFrame;
  const litHalf = (spec.litMs ?? 0) / 2;
  const isDark = track === 'dark';
  const pip = useCallback((i: number) => {
    catchSound(i === 0 ? 'pip0' : i === 1 ? 'pip3' : 'pip7');
    if (i === 0) setMissNote(null);
    if (i === 2) { catchSound('charge'); buzz('tickSelection', 1); }
  }, []);
  const freezeForHint = useCallback(() => {
    setMissNote(null); setNudge(false); setHandOn(true); buzz('tickSelection', 1); catchMark('hint-freeze');
  }, []);
  useAnimatedReaction(() => (armed.value && !parked.value ? (tFrame - t.value) * passMs : null), ms => {
    if (ms == null) {
      if (parked.value && armed.value) { ready.value = 3; approach.value = 1; lit.value = 1; }
      return;
    }
    ready.value = ms > 1000 ? 0 : ms > 600 ? 1 : ms > 200 ? 2 : ms > -160 ? 3 : 0;
    approach.value = ms >= 600 ? 0 : ms > 0 ? 1 - ms / 600 : ms > -200 ? 1 : 0;
    lit.value = isDark ? Math.max(0, Math.min(1, 1 - (Math.abs(ms) - litHalf) / 120)) : 1;
    if (hintFreeze.value && !frozen.value && ms <= 0) {
      frozen.value = true;
      cancelAnimation(t);
      t.value = tFrame;
      ready.value = 3; approach.value = 1; lit.value = 1;
      runOnJS(freezeForHint)();
    }
  });

  // ── A pass of the car ──────────────────────────────────────────────────
  const passTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearPassTimers = useCallback(() => { passTimers.current.forEach(clearTimeout); passTimers.current = []; }, []);
  useEffect(() => clearPassTimers, [clearPassTimers]);
  const shotThisPass = useRef(false);
  const passEndRef = useRef<() => void>(() => undefined);
  const runPass = useCallback((fromT: number) => {
    shotThisPass.current = false;
    clearPassTimers();
    frozen.value = false;
    armed.value = true;
    if (parkedMode) { ready.value = 3; approach.value = 1; return; }
    t.value = fromT;
    carVis.value = withTiming(1, { duration: 140 });
    const end = () => passEndRef.current();
    t.value = withTiming(1, { duration: Math.max(200, (1 - fromT) * passMs), easing: Easing.linear }, done => {
      if (done) runOnJS(end)();
    });
    // The pips run on the pass's own clock (the pass is linear, so arrival is known now), scheduled
    // at -600/-400/-200 ms, instead of hopping from a UI-thread reaction to JS mid-pass.
    const startedAt = Date.now();
    const arriveIn = (tFrame - fromT) * passMs;
    READY_PIPS.forEach((step, i) => {
      const delay = arriveIn - step.atMs;
      if (delay < 0) return;
      passTimers.current.push(setTimeout(() => {
        if (shotThisPass.current) return;
        if (__DEV__) catchMark(`pip${i} late=${Date.now() - startedAt - Math.round(delay)}`);
        pip(i);
      }, delay));
    });
    if (fromT <= anchors.tStation + 0.01 && (track === 'hill' || track === 'dark')) catchSound('clack', { volume: 0.8 });
    else catchSound('whoosh', { volume: 0.5 });
    catchMark('pass');
  }, [parkedMode, passMs, anchors.tStation, track]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback((missed: boolean) => {
    if (rideRef.current.outcome !== 'riding') return;
    later(missed ? 300 : 380, () => runPass(anchors.tRetry));
  }, [later, runPass, anchors.tRetry]);

  passEndRef.current = () => {
    armed.value = false;
    ready.value = 0; approach.value = 0;
    if (shotThisPass.current) return;
    silentPasses.current += 1;
    const next = rideStep(spec, rideRef.current, { type: 'pass_end' });
    setRide(next);
    if (next.outcome === 'rode_off') { onRodeOff(); return; }
    // No tap: the camera lamps blink and a camera-and-finger nudge pulses (no words). After two, the hand returns.
    setNudge(true);
    nudgeBlink.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 120 }),
      withTiming(1, { duration: 120 }), withTiming(0, { duration: 160 }));
    catchSound('pip0', { volume: 0.6 });
    later(1300, () => setNudge(false));
    if (hintMode(item?.rarity, false, silentPasses.current) === 'hand') setHandOn(true);
    retry(true);
  };

  // ── Open: on the tap's frame. The find hops into the seat, the car rocks, then rolls ──
  const opened = useRef(false);
  const hopFrom = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startOpen = useCallback((at: { x: number; y: number } | null) => {
    if (opened.current) return;
    opened.current = true;
    clearTimers(); clearPassTimers();
    hopFrom.current = at ?? { x: layer.width / 2, y: layer.height / 2 };
    setPrint(null); setPrintImage(null); setMissNote(null); setNudge(false); setMissed(m => (m.length ? [] : m)); setFrameStage('white');
    setRide(RIDE_START); setStreak(photoStreak);
    silentPasses.current = 0;
    misses.value = 0; fly.value = 0; dim.value = 0; burst.value = 0; printIn.value = 0; stampIn.value = 0; iris.value = 0;
    veil.value = 1; holding.value = false; approach.value = 0; ready.value = 0;
    t.value = anchors.tStation; armed.value = false; riderIn.value = 0; hop.value = 0; ghost.value = 0;
    const mode = openRules(item?.rarity, firstRide).hint;
    hintFreeze.value = mode === 'freeze' && !parkedMode;
    setHandOn(mode === 'hand');
    open.value = reducedMotion ? withTiming(1, { duration: 120 })
      : withSpring(1, { damping: 22, stiffness: 320, mass: 0.7 });
    hop.value = withTiming(1, { duration: reducedMotion ? 1 : HOP_MS + 90, easing: Easing.inOut(Easing.cubic) });
    riderIn.value = withDelay(reducedMotion ? 0 : 90 + HOP_MS, withSequence(withTiming(1.0001, { duration: 1 }),
      withSpring(1, { damping: 8, stiffness: 300 })));
    rock.value = withDelay(90 + HOP_MS + 40, withSequence(withTiming(1, { duration: 120 }), withTiming(-1, { duration: 120 }),
      withTiming(0.5, { duration: 100 }), withTiming(0, { duration: 100 })));
    buzz('tapLight', 1);
    catchMark('open');
    catchSound('whoosh', { volume: 0.6 });
    later(reducedMotion ? 150 : 90 + HOP_MS, () => { catchSound('pop', { volume: 0.7 }); buzz('hitSoft', 1); });
    later(reducedMotion ? 200 : 90 + HOP_MS + 420, () => runPass(owned ? anchors.tRetry : anchors.tStation));
  }, [clearTimers, layer.width, layer.height, anchors.tStation, anchors.tRetry, firstRide, parkedMode, reducedMotion, runPass, owned, item?.rarity]); // eslint-disable-line react-hooks/exhaustive-deps

  // A prime waits for the render that carries its item; then it opens with that item's rules.
  const pendingPrime = useRef<{ id: number; at: { x: number; y: number } | null } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingPrime.current;
    if (!pending || pending.id !== item?.id) return;
    pendingPrime.current = null;
    startOpen(pending.at);
  }, [item?.id, startOpen]);

  useImperativeHandle(ref, () => ({
    prime: (next, at) => {
      if (opened.current) return;
      if (next.id === item?.id) { startOpen(at); return; }
      pendingPrime.current = { id: next.id, at };
    },
    unprime: () => {
      pendingPrime.current = null;
      if (!opened.current) return;
      opened.current = false;
      clearTimers(); clearPassTimers();
      armed.value = false;
      cancelAnimation(t);
      open.value = withTiming(0, { duration: 160 });
    },
  }), [startOpen, clearTimers, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active) startOpen(from);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const coverCalls = useRef({ onCovered, onIrisClosed });
  coverCalls.current = { onCovered, onIrisClosed };
  const covered = useCallback(() => coverCalls.current.onCovered?.(), []);
  const irisClosed = useCallback(() => coverCalls.current.onIrisClosed?.(), []);
  useAnimatedReaction(() => open.value >= 0.98, (on, was) => { if (on && !was) runOnJS(covered)(); });
  // Close: the viewfinder irises out behind the flying print (never shrinks into a card).
  useEffect(() => {
    if (!closing) return;
    clearTimers(); clearPassTimers();
    armed.value = false; holding.value = false;
    cancelAnimation(t); cancelAnimation(rock);
    catchMark('close');
    iris.value = withTiming(1, { duration: reducedMotion ? 1 : 200, easing: Easing.in(Easing.cubic) }, done => {
      if (done) runOnJS(irisClosed)();
    });
    veil.value = withDelay(reducedMotion ? 0 : 180, withTiming(0, { duration: reducedMotion ? 120 : 200 }));
    later(1000, () => {
      opened.current = false;
      setPrint(null); setPrintImage(null); setMissed([]);
      // Native photo memory is invisible to Hermes' GC: free every photo this ride made except the one
      // handed to the badge (the catch layer frees that one once its sticker clears).
      const handed = caughtRef.current ? printImageRef.current : null;
      const made = madeImages.current;
      madeImages.current = [];
      printImageRef.current = null;
      setTimeout(() => made.forEach(image => { if (image !== handed) image.dispose(); }), 400);
      open.value = 0; printIn.value = 0; fly.value = 0; dim.value = 0; burst.value = 0; ghost.value = 0; iris.value = 0;
    });
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The photo: only the crop, at device resolution, drawn by hand (no reconciler, no re-parse) ──
  const crop = useMemo(() => {
    const w = box.w * 1.9;
    const h = w * (PHOTO_H / PHOTO_W);
    const x = Math.max(0, Math.min(sceneW - w, lut.frameX - w / 2));
    return { x, y: Math.max(0, Math.min(sceneH - h, box.y + box.h * 0.5 - h / 2)), w, h };
  }, [box, lut.frameX, sceneW, sceneH]);
  const takePhoto = useCallback((atU: number) => {
    try {
      return drawPhoto({ width: sceneW, height: sceneH, lut, art: images, rails, u: atU, golden, sky, crop,
        scale: (PHOTO_W / crop.w) * PixelRatio.get() });
    } catch { return null; }
  }, [sceneW, sceneH, lut, images, rails, golden, sky, crop]);

  const finishHold = useRef<(() => void) | null>(null);
  const pendingReveal = useRef<(() => void) | null>(null);
  const fastForward = useRef(false);
  const caughtRef = useRef(false);
  // Every print gets a key; a Blurry's timers act only while that print is still the current one,
  // so a good shot that lands inside the 900 ms Blurry hold is never slid away by the old timer.
  const printKey = useRef(createPrintClock()).current;
  const developPrint = useCallback((grade: PhotoGrade, soClose: boolean, caught: boolean) => {
    const key = printKey.next();
    setPrint({ grade, soClose, key });
    setFrameStage('white');
    printIn.value = 0; develop.value = 0; stampIn.value = 0; printLift.value = 0; sheen.value = 0;
    printIn.value = reducedMotion ? withTiming(1, { duration: 120 }) : withSpring(1, { damping: 13, stiffness: 260, mass: 0.7 });
    catchSound('pop', { volume: 0.6 });
    if (grade === 'blurry') {
      develop.value = withTiming(1, { duration: 160 });
      stampIn.value = withDelay(120, withTiming(1, { duration: reducedMotion ? 1 : 140, easing: Easing.in(Easing.quad) }));
      later(130, () => {
        if (!printKey.isCurrent(key)) return;
        catchSound('aww'); buzz('softBump', 2);
        later(90, () => { if (printKey.isCurrent(key)) buzz('softBump', 1); });
      });
      later(GRADE_HOLD_MS.blurry, () => {
        if (printKey.isCurrent(key)) printIn.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) });
      });
      later(GRADE_HOLD_MS.blurry + 220, () => setPrint(current => (current?.key === key ? null : current)));
      return;
    }
    holding.value = true;
    fastForward.current = false;
    catchSound('film', { volume: 0.7 });
    const beats = spec.developBeats;
    const beatMs = 360;
    const tick = () => { printTick.value = withSequence(withTiming(1.04, { duration: 60 }), withTiming(1, { duration: 90 })); };
    for (let i = 0; i < beats; i++) {
      later(240 + i * beatMs, () => {
        if (fastForward.current || !printKey.isCurrent(key)) return;
        develop.value = withTiming((i + 1) / (beats + 1), { duration: beatMs - 80, easing: Easing.out(Easing.quad) });
        printShake.value = reducedMotion ? 0 : withSequence(withTiming(1, { duration: 50 }), withTiming(-1, { duration: 70 }),
          withTiming(0.5, { duration: 60 }), withTiming(0, { duration: 60 }));
        catchSound('tick', { pitch: i * 2, volume: 0.8 });
        buzz('tickSelection', 1);
        // The frame steps up toward the earned grade, never past it: silver on beat 1 for Great or better,
        // a gold edge glint on the last beat for Frame It! only.
        if (i === 0 && (grade === 'great' || grade === 'frame_it')) { setFrameStage('silver'); tick(); }
        if (i === beats - 1 && grade === 'frame_it') {
          edgeGlint.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 220 }));
          tick();
        }
      });
    }
    // The held breath, then the reveal.
    const revealAt = 240 + beats * beatMs + 180;
    const revealNow = () => {
      if (pendingReveal.current !== revealNow) return;
      pendingReveal.current = null;
      catchMark(`reveal-${grade}`);
      setFrameStage(STAGE_FOR[grade]);
      develop.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      sheen.value = 0;
      sheen.value = withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) });
      printLift.value = reducedMotion ? withTiming(1, { duration: 1 }) : withSpring(1, { damping: 12, stiffness: 220, mass: 0.8 });
      dim.value = withTiming(1, { duration: 220 });
      if (BURST[grade]) burst.value = withTiming(grade === 'frame_it' ? 1 : grade === 'great' ? 0.65 : 0.4, { duration: 160 });
      stampIn.value = withDelay(80, withTiming(1, { duration: reducedMotion ? 1 : 140, easing: Easing.in(Easing.quad) }));
      const amp = grade === 'frame_it' ? 4 : grade === 'great' ? 2 : 0;
      if (amp && !reducedMotion) shake.value = withDelay(200, withSequence(withTiming(amp, { duration: 30 }), withTiming(-amp, { duration: 40 }),
        withTiming(amp * 0.5, { duration: 40 }), withTiming(0, { duration: 40 })));
      later(200, () => {
        if (grade === 'frame_it') {
          duckForCheer(); catchSound('cheer'); catchSound('chime');
          fx.current?.burst('confetti', layer.width / 2, sceneH * 0.45);
          buzz('comboHeavy', 4); later(120, () => buzz('success', 3));
        } else if (grade === 'great') {
          catchSound('chime'); catchSound('sparkle'); fx.current?.burst('sparkles', layer.width / 2, sceneH * 0.45); buzz('success', 3);
        } else {
          catchSound('chime'); fx.current?.burst('stars', layer.width / 2, sceneH * 0.45); buzz('hitMedium', 3);
        }
        AccessibilityInfo.announceForAccessibility(`${GRADE_LABEL[grade]} ${caught ? 'Caught it!' : ''}`);
      });
      // x during the develop: the reveal plays at once and hands off with no hold.
      const hold = fastForward.current ? 0 : Math.round(GRADE_HOLD_MS[grade] * (owned ? 0.6 : 1));
      const done = () => {
        finishHold.current = null;
        holding.value = false;
        burst.value = withTiming(0, { duration: 250 });
        if (caught) { catchMark('print-ready'); onPrintReady(grade, printImageRef.current); }
        else {
          // Epic's first photo: it slides aside and the car goes around again.
          printIn.value = withTiming(0, { duration: 200 });
          dim.value = withTiming(0, { duration: 200 });
          later(220, () => setPrint(null));
          retry(false);
        }
      };
      finishHold.current = done;
      later(fastForward.current ? 260 : 200 + hold, () => { if (finishHold.current === done) done(); });
    };
    pendingReveal.current = revealNow;
    later(revealAt, revealNow);
  }, [spec.developBeats, reducedMotion, later, layer.width, sceneH, onPrintReady, retry, owned]); // eslint-disable-line react-hooks/exhaustive-deps
  const printImageRef = useRef<SkImage | null>(null);
  const madeImages = useRef<SkImage[]>([]);
  // Shutter taps during the hold skip it; mashing during the develop never skips the suspense.
  const callSkip = useCallback(() => { const done = finishHold.current; if (done) done(); }, []);
  // x: during the hold it skips; still developing a counted catch, it fast-forwards to the reveal
  // and then straight to the hand-off.
  const closeSkip = useCallback(() => {
    const done = finishHold.current;
    if (done) { done(); return; }
    const reveal = pendingReveal.current;
    if (reveal && caughtRef.current) { fastForward.current = true; reveal(); }
  }, []);
  const notYet = useCallback(() => {
    // First ride, car not in the frame yet: no miss, just a soft "not yet".
    catchSound('notYet', { volume: 0.7 });
    buzz('softBump', 1);
    nudgeBlink.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 140 }));
  }, [nudgeBlink]);

  // The click: its own tiny JS turn, queued from the gesture before anything else. One shutter sound
  // for every grade; the grade is heard only at the reveal.
  const shutterNow = useCallback(() => {
    catchSound('shutter');
    catchSound('flash', { volume: 0.8 });
    buzz('hitRigid', 4);
    clearPassTimers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onShot = useCallback((grade: PhotoGrade, offset: number, direction: 'early' | 'late' | null, soClose: boolean, shotUAt: number) => {
    catchMark(`shot-${grade} offset=${Math.round(offset)}`);
    shotThisPass.current = true;
    silentPasses.current = 0;
    setHandOn(false);
    setMissNote(null);
    // The photo renders on the next frame, so the click's JS turn stays tiny.
    const shotKey = printKey.peekNext();
    requestAnimationFrame(() => {
      const image = takePhoto(shotUAt);
      if (image) madeImages.current.push(image);
      if (!printKey.isCurrent(shotKey)) return;
      printImageRef.current = image;
      setPrintImage(image);
      if (!isGoodShot(grade) && image) later(GRADE_HOLD_MS.blurry + 200, () => setMissed(list => [...list, image].slice(-3)));
    });
    const next = rideStep(spec, rideRef.current, { type: 'shot', grade });
    setRide(next);
    AccessibilityInfo.announceForAccessibility(isGoodShot(grade) ? GRADE_LABEL[grade] : direction === 'early' ? 'Too soon. Try again.' : 'Too late. Try again.');
    if (!isGoodShot(grade)) {
      misses.value = Math.min(3, misses.value + 1);
      if (direction) setMissNote({ dir: direction, key: Date.now() });
      photoStreak = 0;
      developPrint('blurry', soClose, false);
      // Replay: a ghost car slides to where the shot should have been.
      ghostU.value = u.value;
      ghost.value = withSequence(withTiming(1, { duration: 80 }), withDelay(420, withTiming(0, { duration: 200 })));
      ghostU.value = withTiming(uFrame, { duration: 420, easing: Easing.inOut(Easing.quad) });
      carVis.value = withTiming(0, { duration: 140 });
      cancelAnimation(t);
      if (next.outcome === 'rode_off') { later(900, onRodeOff); return; }
      retry(true);
      return;
    }
    if (rideRef.current.passes === 0) photoStreak += 1;
    setStreak(photoStreak);
    if (next.outcome === 'caught') { caughtRef.current = true; onCaught(photoPayload(spec, next), grade); }
    developPrint(grade, false, next.outcome === 'caught');
    later(130, () => {
      if (parkedMode) return;
      t.value = withTiming(1, { duration: Math.max(240, (1 - t.value) * passMs), easing: Easing.linear });
    });
  }, [takePhoto, spec, developPrint, onCaught, onRodeOff, retry, later, parkedMode, passMs, uFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  const arrivalMs = anchors.tFrame * passMs;
  const rarity = item?.rarity ?? 3;
  const shoot = useCallback(() => {
    'worklet';
    armed.value = false;
    let grade: PhotoGrade = 'great';
    let offset = 0;
    let direction: 'early' | 'late' | null = null;
    let soClose = false;
    if (frozen.value) {
      grade = 'frame_it';
      // The freeze is a one-time gift: it is off after the frozen shot.
      hintFreeze.value = false;
      frozen.value = false;
    } else if (!parked.value) {
      offset = shotOffsetMs(t.value * passMs, arrivalMs);
      const result = gradeOffset(offset, misses.value, rarity);
      grade = result.grade; direction = result.direction; soClose = result.soClose;
    }
    cancelAnimation(t);
    flash.value = withSequence(withTiming(0.9, { duration: 40 }), withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) }));
    iris.value = withSequence(withTiming(0.55, { duration: 55 }), withTiming(0, { duration: 140 }));
    ready.value = 0;
    runOnJS(shutterNow)();
    runOnJS(onShot)(grade, offset, direction, soClose, u.value);
  }, [passMs, arrivalMs, onShot, shutterNow, rarity]); // eslint-disable-line react-hooks/exhaustive-deps

  // One gesture, always attached: every touch gets a visible press, and the worklet decides what it means.
  const tap = useMemo(() => Gesture.Tap().maxDuration(100_000).onBegin(() => {
    'worklet';
    press.value = withTiming(0.86, { duration: 60 });
    const action = shutterAction({ holding: holding.value, armed: armed.value, hintWaiting: hintFreeze.value && !frozen.value });
    if (action === 'skip') runOnJS(callSkip)();
    else if (action === 'not_yet') {
      wobble.value = withSequence(withTiming(1, { duration: 50 }), withTiming(-1, { duration: 70 }), withTiming(0, { duration: 60 }));
      runOnJS(notYet)();
    } else if (action === 'shoot') shoot();
  }).onFinalize(() => {
    'worklet';
    press.value = withSpring(1, { damping: 12, stiffness: 400, mass: 0.5 });
  }), [shoot, callSkip, notYet]); // eslint-disable-line react-hooks/exhaustive-deps
  const accessibleShoot = useCallback(() => {
    runOnUI(() => {
      'worklet';
      if (holding.value) { runOnJS(callSkip)(); return; }
      if (armed.value) shoot();
    })();
  }, [shoot, callSkip]); // eslint-disable-line react-hooks/exhaustive-deps

  // Development recordings only: shoot at a scripted latency-compensated offset per pass.
  const autoPass = useSharedValue(0);
  const script = __DEV__ ? autoShots ?? null : null;
  useAnimatedReaction(() => (script && armed.value && !frozen.value && autoPass.value < script.length
    ? shotOffsetMs(t.value * passMs, arrivalMs) : null), offset => {
    if (offset == null || !script) return;
    if (offset >= script[autoPass.value]) {
      autoPass.value += 1;
      press.value = withSequence(withTiming(0.86, { duration: 60 }), withSpring(1));
      // Same decision as a real tap: before the first-ride freeze it is a soft "not yet".
      if (hintFreeze.value && !frozen.value) {
        wobble.value = withSequence(withTiming(1, { duration: 50 }), withTiming(-1, { duration: 70 }), withTiming(0, { duration: 60 }));
        runOnJS(notYet)();
      } else shoot();
    }
  });
  useEffect(() => {
    if (!__DEV__ || !script || !handOn || !hintFreeze.value) return;
    const timer = setTimeout(() => runOnUI(shoot)(), 900);
    return () => clearTimeout(timer);
  }, [handOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The print flies into the badge on the map ──────────────────────────
  const printTop = Math.max(insets.top + 40, sceneH * 0.1);
  const heroTop = Math.max(insets.top + 30, sceneH * 0.45 - HERO_H / 2);
  useEffect(() => {
    if (!flyTarget) return;
    catchMark('print-fly');
    fly.value = withDelay(reducedMotion ? 0 : 120, withTiming(1, { duration: reducedMotion ? 1 : 520, easing: Easing.inOut(Easing.cubic) }, done => {
      if (done) runOnJS(onPrintLanded)();
    }));
    dim.value = withTiming(0, { duration: 300 });
    catchSound('whoosh', { volume: 0.6 });
    for (let i = 1; i <= 7; i++) later(120 + i * 65, () => trailBurst(i / 8));
  }, [flyTarget]); // eslint-disable-line react-hooks/exhaustive-deps
  const flyFrom = { x: layer.width / 2, y: heroTop + HERO_H / 2 };
  const trailBurst = (f: number) => {
    if (!flyTarget) return;
    const e = f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
    fx.current?.burst('glints', flyFrom.x + (flyTarget.x - flyFrom.x) * e,
      flyFrom.y + (flyTarget.y - flyFrom.y) * e - 140 * 4 * e * (1 - e));
  };

  // Close (x): before a catch it closes; once the server has the catch it fast-forwards to the badge.
  const handleClose = useCallback(() => {
    if (caughtRef.current) { closeSkip(); return; }
    onClose();
  }, [closeSkip, onClose]);
  useEffect(() => { if (active) { caughtRef.current = false; autoPass.value = 0; } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Styles ─────────────────────────────────────────────────────────────
  const fromPt = from ?? hopFrom.current;
  // Full-size from frame 1 (no shrunken card, no animated corner mask): the view fades up while the
  // find hops from its pin into the seat. Only opacity and a shake transform animate.
  const viewStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, open.value * 2.2) * veil.value,
    transform: [{ translateX: shake.value }],
  }));
  // Iris bars are fixed half-screen views scaled on Y (a transform, not a layout prop).
  const irisTop = useAnimatedStyle(() => ({ transform: [{ scaleY: iris.value }] }));
  const irisBottom = useAnimatedStyle(() => ({ transform: [{ scaleY: iris.value }] }));
  // Shutter: the disc fills red, amber, then green; a gold arc fills as the car nears. Drawn in Skia.
  const shutterGroup = useDerivedValue(() => [{ translateX: SHUTTER / 2 + 10 }, { translateY: SHUTTER / 2 + 10 },
    { scale: press.value }, { rotate: wobble.value * 0.12 }]);
  const discColor = useDerivedValue(() => (ready.value === 3 ? '#3ee07a' : ready.value === 2 ? '#ffc93b' : ready.value === 1 ? '#ff6b5e' : '#ffffff'));
  const glowOpacity = useDerivedValue(() => (ready.value === 3 ? 0.55 : 0));
  const arcEnd = useDerivedValue(() => approach.value);
  const ringPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addArc(Skia.XYWHRect(-(SHUTTER - 6) / 2, -(SHUTTER - 6) / 2, SHUTTER - 6, SHUTTER - 6), -90, 359.9);
    return path;
  }, []);
  const handLoop = useSharedValue(0);
  useEffect(() => {
    if (!handOn) { cancelAnimation(handLoop); handLoop.value = 0; return; }
    handLoop.value = withRepeat(withSequence(withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) })), -1, false);
    return () => cancelAnimation(handLoop);
  }, [handOn, handLoop]);
  // The hand sits above the shutter, fingertip down, and taps onto the disc (never over the band's labels).
  const handStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 10 * handLoop.value }] }));
  // A clean gold halo just outside the disc's glow (never blended over the green), pulsing 1.0 to 1.08.
  const haloStyle = useAnimatedStyle(() => ({ opacity: 1 - 0.35 * handLoop.value, transform: [{ scale: 1 + 0.08 * handLoop.value }] }));

  // Hop: the find's own art squashes on its map spot, then arcs into the seat.
  const seatStart = sampleTrack(samples, anchors.uStation);
  const seat = { x: seatStart.x + car.w * (0.39 - 0.5), y: seatStart.y - car.h * 0.86 + car.h * 0.5 - car.rider * 0.45 };
  const hopStyle = useAnimatedStyle(() => {
    const raw = hop.value;
    const h = Math.max(0, (raw - 0.18) / 0.82);
    const squash = raw < 0.18 ? 1 - 0.15 * Math.sin((raw / 0.18) * Math.PI) : 1;
    const x = fromPt.x + (seat.x - fromPt.x) * h;
    const y = fromPt.y + (seat.y - fromPt.y) * h - 120 * 4 * h * (1 - h);
    return { opacity: raw > 0 && raw < 1 ? 1 : 0,
      transform: [{ translateX: x - car.rider / 2 }, { translateY: y - car.rider / 2 }, { scaleX: 2 - squash }, { scaleY: squash }] };
  });

  const printStyle = useAnimatedStyle(() => {
    const f = fly.value;
    const e = f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
    const target = flyTarget ?? flyFrom;
    const lift = printLift.value;
    const baseY = printTop + (heroTop - printTop) * lift;
    const x = flyFrom.x + (target.x - flyFrom.x) * e - HERO_W / 2;
    const y = baseY + (target.y - (baseY + HERO_H / 2)) * e - 140 * 4 * e * (1 - e);
    // Laid out at hero size: rest is 0.76, the reveal lifts to 1.0, the flight shrinks to the sticker.
    const scale = (0.6 + 0.4 * printIn.value) * (REST_SCALE + (1 - REST_SCALE) * lift) * printTick.value * (1 - e * 0.8);
    const shown = (open.value > 0.02 || f > 0) && f < 0.999 ? 1 : 0;
    return {
      opacity: Math.min(1, printIn.value * 2) * shown,
      transform: [{ translateX: x }, { translateY: y + (1 - printIn.value) * 90 }, { scale },
        { rotate: `${-4 + printShake.value * 3 + e * 12}deg` }],
    };
  });
  // The plate slams from its laid-out peak size down to rest, kept 16 pt inside the screen.
  const plateRest = 1 / PLATE_PEAK;
  const stampStyle = useAnimatedStyle(() => {
    const k = stampIn.value;
    return { opacity: k > 0 ? 1 : 0, transform: [{ scale: 1 + (plateRest - 1) * k }] };
  });
  const devMatrix = useDerivedValue(() => filmMatrix(develop.value));
  const grainOpacity = useDerivedValue(() => 0.07 * Math.max(0, 1 - develop.value * 1.15));
  const nudgeStyle = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * nudgeBlink.value, transform: [{ scale: 1 + 0.08 * nudgeBlink.value }] }));
  const glintStyle = useAnimatedStyle(() => ({ opacity: edgeGlint.value }));
  const closeStyle = useAnimatedStyle(() => ({ opacity: open.value * veil.value }));
  const nudgeFinger = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * nudgeBlink.value }] }));

  const name = item?.name ?? '';
  const color = rarityColor(item?.rarity);
  const visible = active || opened.current;
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const shutterCenterY = layer.height - insets.bottom - 62;
  const missDirLeft = missNote?.dir === 'late';
  const cam = cameraBox(lut, sceneW, sceneH);

  if (!item || layer.width === 0) return null;
  return (
    <View pointerEvents={visible && !closing ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={tap}>
        <Animated.View style={[styles.view, { width: layer.width, height: layer.height }, viewStyle]}>
          <Canvas style={{ width: sceneW, height: sceneH }}>
            <RideScene width={sceneW} height={sceneH} lut={lut} art={images} rails={rails} u={u} approach={approach} ready={ready}
              flash={flash} dim={dim} lit={lit} ghostU={ghostU} ghost={ghost} riderIn={riderIn} rock={rock} carVis={carVis}
              golden={golden} sky={sky} dark={isDark} />
            {/* Always mounted (Skia 1.5 crashes when a shader bound to shared values remounts); the grade sets the strength. */}
            <Sunburst cx={sceneW / 2} cy={heroTop + HERO_H / 2} radius={sceneW * 0.8} intensity={burst} colorA="#ffd84a"
              width={sceneW} height={sceneH} speed={0.35} />
          </Canvas>
          {/* Viewfinder corner marks, 16 pt inside the screen */}
          <View pointerEvents="none" style={[styles.corner, { left: 16, top: insets.top + 56, borderLeftWidth: 3, borderTopWidth: 3 }]} />
          <View pointerEvents="none" style={[styles.corner, { right: 16, top: insets.top + 56, borderRightWidth: 3, borderTopWidth: 3 }]} />
          <View pointerEvents="none" style={[styles.corner, { left: 16, bottom: bandH + 16, borderLeftWidth: 3, borderBottomWidth: 3 }]} />
          <View pointerEvents="none" style={[styles.corner, { right: 16, bottom: bandH + 16, borderRightWidth: 3, borderBottomWidth: 3 }]} />

          {/* Miss: a car and a big arrow toward where the car should have been (no words) */}
          {missNote && <View pointerEvents="none" accessibilityLabel={missNote.dir === 'early' ? 'Too soon' : 'Too late'}
            style={[styles.missChip, { left: Math.max(16, Math.min(sceneW - 130, box.x + box.w / 2 - 57)), top: box.y - 64 }]}>
            {missDirLeft && <Text style={styles.arrow}>◀</Text>}
            <Image source={CAR_ICON} style={styles.missCar} contentFit="contain" transition={0} />
            {!missDirLeft && <Text style={styles.arrow}>▶</Text>}
          </View>}
          {/* No tap this pass: a camera and a pulsing finger (no words) */}
          {nudge && <Animated.View pointerEvents="none" accessibilityLabel="Tap the shutter"
            style={[styles.nudge, { left: Math.max(16, cam.x - 70), top: cam.y + cam.h + 8 }, nudgeStyle]}>
            <GameIcon name="camera" size={30} />
            <Animated.View style={nudgeFinger}><Image source={HAND_ART} style={styles.nudgeHand} contentFit="contain" transition={0} /></Animated.View>
          </Animated.View>}

          {/* Missed prints, fanned face-up with their blurry photos */}
          {/* Always mounted (no canvas mounts mid-ride); empty until a miss lands here. */}
          <View pointerEvents="none" style={[styles.pile, { bottom: bandH + 22, opacity: missed.length > 0 ? 1 : 0 }]}>
            {[0, 1, 2].map(i => <View key={i} style={[styles.pileCard, { opacity: i < missed.length ? 1 : 0,
              transform: [{ rotate: `${-10 + i * 10}deg` }] }]}>
              <Canvas style={{ width: 24, height: 20 }}>
                <SkImageNode image={missed[i] ?? BLANK} x={0} y={0} width={24} height={20} fit="cover" />
              </Canvas>
            </View>)}
            <View style={styles.pileCount}><Text style={styles.pileText}>{missed.length}</Text></View>
          </View>
          {streak >= 2 && <View pointerEvents="none" style={[styles.streak, { top: insets.top + 12 }]}>
            <GameIcon name="streak" size={16} /><Text style={styles.streakText}>×{streak}</Text>
          </View>}

          {/* The black camera band: name, the shutter, rarity */}
          <View style={[styles.band, { height: bandH, paddingBottom: insets.bottom }]} pointerEvents="box-none">
            <View style={styles.bandSide} pointerEvents="none">
              <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{name}</Text>
              {spec.photosNeeded > 1 && <Text style={styles.sub}>Photo {Math.min(spec.photosNeeded, ride.photos.length + 1)} of {spec.photosNeeded}</Text>}
              {spec.maxRides != null && <Text style={styles.sub}>Ride {Math.min(spec.maxRides, ride.passes + 1)} of {spec.maxRides}</Text>}
            </View>
            <View style={styles.shutterWrap} pointerEvents="none">
              <Canvas style={{ width: SHUTTER + 20, height: SHUTTER + 20 }}>
                <Group transform={shutterGroup}>
                  <Circle cx={0} cy={0} r={SHUTTER / 2 + 6} color="#3ee07a" opacity={glowOpacity} />
                  <Path path={ringPath} style="stroke" strokeWidth={5} color="rgba(255,255,255,0.95)" />
                  <Path path={ringPath} style="stroke" strokeWidth={5} color="#ffcf3b" start={0} end={arcEnd} strokeCap="round" />
                  <Circle cx={0} cy={0} r={(SHUTTER - 22) / 2} color={discColor} />
                </Group>
              </Canvas>
              {handOn && <>
                <Animated.View style={[styles.halo, haloStyle]} />
                <Animated.View style={[styles.hand, handStyle]}>
                  <Image source={HAND_ART} style={styles.handArt} contentFit="contain" transition={0} />
                </Animated.View>
              </>}
            </View>
            <View style={[styles.bandSide, { alignItems: 'flex-end' }]} pointerEvents="none">
              <View style={[styles.rarity, { backgroundColor: color }]}>
                <View style={styles.bevel} />
                {tier >= 4 ? <Text style={styles.markGlyph}>{tier === 5 ? '♛' : '◆'}</Text>
                  : Array.from({ length: Math.max(0, tier - 1) }, (_, i) => <View key={i} style={styles.pip} />)}
                <Text style={styles.rarityText}>{rarityLabel(item.rarity).toUpperCase()}</Text>
              </View>
            </View>
          </View>
          {/* One accessible target: the viewfinder and the shutter */}
          <View accessible accessibilityRole="button" accessibilityLabel={`Take the ride photo of ${name}`}
            accessibilityHint="Double tap when the car is in the frame" onAccessibilityTap={accessibleShoot}
            style={[StyleSheet.absoluteFill, { top: insets.top + 56 }]} />
          {/* The iris: black bars that blink on the shot and close the viewfinder at the end */}
          <Animated.View pointerEvents="none" style={[styles.iris, { top: 0, height: layer.height / 2, transformOrigin: 'top' }, irisTop]} />
          <Animated.View pointerEvents="none" style={[styles.iris, { bottom: 0, height: layer.height / 2, transformOrigin: 'bottom' }, irisBottom]} />
        </Animated.View>
      </GestureDetector>

      {/* Close (x): outside the shutter's gesture, reachable by VoiceOver */}
      {visible && !closing && <Animated.View style={[styles.closeWrap, { top: insets.top + 8 }, closeStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the camera" hitSlop={10} onPress={handleClose} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </Animated.View>}

      {/* The find hops from the map into the seat */}
      {riderSource && <Animated.View pointerEvents="none" style={[styles.hop, { width: car.rider, height: car.rider }, hopStyle]}>
        <Image source={{ uri: riderSource }} style={{ width: car.rider, height: car.rider }} contentFit="contain" transition={0} />
      </Animated.View>}

      {/* The print, laid out at hero size: develops, holds with its grade, then flies to the badge on the map */}
      <Animated.View pointerEvents="none" style={[styles.print, printStyle]}>
        <Image source={require('../../../../assets/images/ride-photo/glow.webp')} style={styles.printShadow} contentFit="fill" transition={0} />
        <LinearGradient colors={FRAME_FILL[frameStage]} style={[StyleSheet.absoluteFill, styles.printFill]} />
        <View style={[styles.goldBevel, { opacity: frameStage === 'gold' ? 1 : 0 }]} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.glint, glintStyle]} />
        <View style={styles.photo}>
          <Canvas style={{ width: PHOTO_W, height: PHOTO_H }}>
            {/* Kept mounted with a 1 px placeholder: never remount Skia nodes bound to shared values. */}
            <SkImageNode image={printImage ?? BLANK} x={0} y={0} width={PHOTO_W} height={PHOTO_H} fit="fill">
              <ColorMatrix matrix={devMatrix} />
            </SkImageNode>
            <Rect x={0} y={0} width={PHOTO_W} height={PHOTO_H} opacity={grainOpacity}>
              <ImageShader image={art.grain ?? BLANK} tx="repeat" ty="repeat" rect={{ x: 0, y: 0, width: 128, height: 128 }} />
            </Rect>
            <Shimmer x={0} y={0} width={PHOTO_W} height={PHOTO_H} progress={sheen} alpha={0.5} />
          </Canvas>
          {print?.grade === 'blurry' && <View style={styles.blurVeil} />}
        </View>
        <View style={styles.caption}>
          <Text style={styles.captionName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{name}</Text>
          <Text style={styles.captionDate}>{date}</Text>
        </View>
        {print && <Animated.View style={[styles.stamp, stampStyle]}>
          <StampPlate grade={print.grade} soClose={print.soClose} size={PLATE_PEAK} />
        </Animated.View>}
      </Animated.View>

      <FxStage ref={fx} width={layer.width} height={layer.height} reducedMotion={reducedMotion} flashCap={0.15}
        style={StyleSheet.absoluteFill} />
    </View>
  );
});

export default memo(RidePhotoCatch);

const styles = StyleSheet.create({
  view: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', backgroundColor: '#000000' },
  iris: { position: 'absolute', left: 0, right: 0, backgroundColor: '#000000' },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: 'rgba(255,255,255,0.85)' },
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, backgroundColor: '#000000' },
  bandSide: { flex: 1, justifyContent: 'center' },
  name: { color: '#ffffff', fontFamily: 'Shark', fontSize: 17 },
  sub: { color: '#bcd6f5', fontFamily: 'Knockout', fontSize: 14, marginTop: 4 },
  shutterWrap: { width: SHUTTER + 20, height: SHUTTER + 20, alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
  halo: { position: 'absolute', width: SHUTTER + 18, height: SHUTTER + 18, borderRadius: (SHUTTER + 18) / 2, borderWidth: 3, borderColor: '#ffc93c' },
  hand: { position: 'absolute', left: (SHUTTER + 20) / 2 - 54 * 0.6, top: -69 - 2, width: 54, height: 69 },
  handArt: { width: 54, height: 69, transform: [{ rotate: '-60deg' }] },
  rarity: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  bevel: { position: 'absolute', left: 0, right: 0, top: 0, height: 1.5, backgroundColor: 'rgba(255,255,255,0.6)' },
  rarityText: { color: '#ffffff', fontFamily: 'Shark', fontSize: 14, letterSpacing: 0.6 },
  pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffffff' },
  markGlyph: { color: '#ffffff', fontSize: 14, lineHeight: 16 },
  closeWrap: { position: 'absolute', left: 16 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  closeText: { color: '#ffffff', fontSize: 20, lineHeight: 22 },
  missChip: { position: 'absolute', width: 114, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 6, borderRadius: 18, backgroundColor: INK, borderWidth: 2, borderColor: '#ffffff' },
  missCar: { width: 46, height: 29 },
  arrow: { color: '#ffcf3b', fontSize: 28, lineHeight: 32 },
  nudge: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 18, backgroundColor: INK, borderWidth: 2, borderColor: '#ffcf3b' },
  nudgeHand: { width: 26, height: 33, transform: [{ rotate: '-20deg' }] },
  hop: { position: 'absolute', left: 0, top: 0 },
  print: { position: 'absolute', left: 0, top: 0, width: HERO_W, height: HERO_H, borderRadius: 10, padding: 12, paddingBottom: STRIP_H },
  printShadow: { position: 'absolute', left: -26, right: -26, top: -10, bottom: -40, tintColor: '#021a36', opacity: 0.45 },
  printFill: { borderRadius: 10 },
  goldBevel: { position: 'absolute', left: 4, right: 4, top: 4, bottom: 4, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  glint: { borderRadius: 10, borderWidth: 5, borderColor: '#fff3a6' },
  photo: { width: PHOTO_W, height: PHOTO_H, borderRadius: 5, overflow: 'hidden', backgroundColor: '#2f5560' },
  blurVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(230,238,246,0.35)' },
  caption: { position: 'absolute', left: 16, right: 16, bottom: 8, height: STRIP_H - 14, justifyContent: 'center' },
  captionName: { color: INK, fontFamily: 'Knockout', fontSize: 20 },
  captionDate: { color: '#4a6a90', fontFamily: 'Knockout', fontSize: 15 },
  // Over the photo's bottom-right corner (about a third on the photo), never the caption; laid out at peak size.
  stamp: { position: 'absolute', right: -6, bottom: STRIP_H + 2, transformOrigin: 'right bottom' },
  pile: { position: 'absolute', left: 20, width: 70, height: 46 },
  pileCard: { position: 'absolute', left: 10, top: 4, width: 30, height: 34, borderRadius: 3, backgroundColor: '#3a4f6b',
    borderWidth: 2, borderColor: '#d6deea', alignItems: 'center', paddingTop: 3 },
  pileCount: { position: 'absolute', left: 38, top: -4, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: INK,
    borderWidth: 2, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pileText: { color: '#ffffff', fontFamily: 'Shark', fontSize: 16, lineHeight: 18 },
  streak: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 2, borderColor: '#ffcf3b' },
  streakText: { color: '#ffffff', fontFamily: 'Shark', fontSize: 16 },
});
