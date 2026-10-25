import { forwardRef, memo, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Image as RNImage, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Canvas, Group, Image as SkImageNode, ImageFormat, LinearGradient as SkLinearGradient, Path as SkPath, Picture, Rect, RadialGradient, Skia, vec, type SkImage } from '@shopify/react-native-skia';

const WARM_SCALE = [{ scale: 0.01 }];
/** Stamp art per ride (the ride's own vehicle). Unbuilt rides show a lock instead. */
const RIDE_STAMP: Partial<Record<RideKind, number>> = {
  coaster: require('../../../assets/images/ride-photo/car-back.webp'),
  flume: require('../../../assets/images/ride-photo/log-boat.webp'),
  teacups: require('../../../assets/images/ride-photo/teacup-back.webp'),
};
import Animated, {
  Easing, cancelAnimation, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import type { PrepItemType } from '../../models/prep-item-type';
import type { RedeemPrepItemResponseType } from '../../models/redeem-prep-item-response-type';
import redeemPrepItem, { type RedeemCatchDetails } from '../../api/endpoints/me/prep-items/redeem';
import { AuthContext } from '../../context/AuthProvider';
import { CurrencyContext } from '../../context/CurrencyProvider';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';
import CatchBurst, { loadBurstInk, type BurstValues } from './CatchBurst';
import { CatchRaysArt } from './CatchRays';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { DURATION, EASE, SPRING, flashPeak, momentParticles } from '../../ui/motionEasing';
import { GOLD_FX, PARTICLES } from '../../ui/motion';
import { homeStarAt, nextGoalAt, WHERE, whereAt, whereFlightAt } from '../../components/map/alive/mapWow';
import { arcPoint, beamAt, BEAM, CONFETTI, burstVariant, BURST_RINGS_MAX, BURST_STARS_MAX, catchFrame, catchHaptics, catchPlan, catchStage, coinStreamAt, coinStreamPlan, COIN_STREAM, type CatchBeatHaptic, type CatchFrame, type CatchPlan } from '../../components/map/alive/mapWow';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';
import { usePowerBudget } from '../../power';
import { holdHud, hudClock, hudStreamId, nextHudStreamId, pulseHud, streamHud } from '../../components/Topbar/hudPulse';
import { COUNT } from '../../ui/motion';
import { findDisplayName } from './homeFindCopy';
import { setHomeHuntRankLine } from './homeHuntRankStore';
import { findImageSource, FIND_ART_SIZE } from './PrepItem';
import { burstSparkCount, CATCH_TIMING, catchSummary, rarityColor, rarityTier, type CatchSummary } from './findPresentation';
import { catchFind, type CatchResult } from './homeCatch';
import { GRADE_LABEL, GRADE_STARS, catchStyleFor, type PhotoGrade } from './ridePhoto';
import { Sunburst } from '../../gamekit/fx/ShaderFx';
import RidePhotoCatch, { BLANK_IMAGE, prebuildRideStage, rideStageReady, setRidePhotoPlayer, warmStagePicture, type RideStageHandle } from './ridePhoto/RidePhotoCatch';
import { useRideArt } from './ridePhoto/rideAssets';
import { catchHaptic, catchMark, catchSound, catchTraceBuffer } from './ridePhoto/catchAudio';
import { touchHeal, useCommitHeal } from '../../components/map/alive/commitHeal';
import { catchDim, catchHidePivot, catchKickX, catchKickY, catchPinPose, dimCatchChrome, setCatchOpen, showCatchChrome } from './catchPresence';
import reportRideOff from '../../api/endpoints/me/prep-items/ride-off';
import { READY_RIDES, RIDES, rideStamps, ridesSnappedLine, type RideKind, type Sky } from './ridePhoto/rides';
import { loadRideMemory, recordRide, ridesSnapped } from './ridePhoto/rides/rideMemory';
import CatchReveal, { type CatchRevealData, type RevealEscape, type RevealOutcome } from './ridePhoto/CatchReveal';
import { bestStars, isNewBest, ownedSlots } from './ridePhoto/revealRules';
import { getPrepItemSet, type PrepItemSetItem } from '../../api/endpoints/me/prep-item-sets';

/**
 * The book page's slots from the set page read at the ride's start: the caught find is owned (and new when
 * it is), and the owned count always equals the server's count (a stale page is corrected in order), so the
 * page never disagrees with its own number. Null when the page does not match this set (the reveal then
 * draws plain slots).
 */
export function bookSlots(page: readonly BookItem[], caughtId: number, isNew: boolean, collected: number | null, total: number | null,
  photo: { readonly grade?: string | null; readonly newBest?: boolean } = {}) {
  const owned = ownedSlots(page.map(entry => ({ id: entry.id, owned: entry.is_collected })), caughtId, collected, total);
  if (!owned) return null;
  return page.map((entry, i) => {
    // Book stars: each owned item's best photo grade (newer servers send it). The caught slot shows the best
    // after this photo; on a NEW BEST! it steps up from the old best.
    const before = owned[i].owned ? bestStars(entry.best_photo_grade) : 0;
    const stars = owned[i].caught ? Math.max(before, bestStars(photo.grade)) : before;
    return { id: entry.id, art: findImageSource({ icon_url: entry.icon_url, variant_slug: entry.variant_slug, name: entry.name }),
      owned: owned[i].owned, isNew: isNew && owned[i].caught, caught: owned[i].caught,
      stars, prevStars: before, newBest: owned[i].caught && !isNew && photo.newBest === true };
  });
}

/**
 * Round 5: the next goal after a catch, as a picture. The first find of the set's book page that is still missing
 * (never the one just caught), or null when the set is done or the page is not this set's. Honest: only real
 * set items, in the book's own order.
 */
export function nextMissing(page: readonly BookItem[] | null, caughtId: number, complete: boolean): BookItem | null {
  if (!page || complete) return null;
  return page.find(entry => !entry.is_collected && entry.id !== caughtId) ?? null;
}

/** One item on a set's book page (what the catch reveal draws in its slots). */
export type BookItem = Pick<PrepItemSetItem, 'id' | 'name' | 'icon_url' | 'variant_slug' | 'is_collected' | 'best_photo_grade'>;
function encodePrint(photo: SkImage | null): string | undefined {
  try {
    const b64 = photo?.encodeToBase64(ImageFormat.JPEG, 88);
    return b64 ? `data:image/jpeg;base64,${b64}` : undefined;
  } catch { return undefined; }
}
const defaultLoadSetPage = async (slug: string): Promise<BookItem[] | null> => (await getPrepItemSet(slug)).items ?? null;
import { shareFlex } from '../../share';

const RIDE_HINT_KEY = 'ride_photo_hint_seen_v1';
let rideHintSeen: boolean | null = null;
/** Development recordings: show the first-catch hint again. */
export function resetRideHintForPreview(): void {
  rideHintSeen = false;
  void AsyncStorage.removeItem(RIDE_HINT_KEY).catch(() => undefined);
}
void AsyncStorage.getItem(RIDE_HINT_KEY).then(value => { rideHintSeen = value === '1'; }).catch(() => { rideHintSeen = false; });

const TICKET_ICON = require('../../../assets/images/ticket-icon.png');

export interface CatchRequest {
  readonly item: PrepItemType;
  readonly pivotId: number;
  /** The find's spot in this layer's coordinates; null falls back to the layer centre. */
  readonly from: { x: number; y: number } | null;
  /** Bumped on retry so the same find can play again. */
  readonly attempt: number;
}

export type Fix = { latitude: number; longitude: number } | null;

/** The collection badge: a pill centred this far above the layer's bottom edge, with a sticker icon breaking out of it. */
const BADGE_HEIGHT = 62;
const BADGE_WIDTH = 300;
const STICKER = 64;
const STICKER_LEFT = 8;

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
/**
 * Common catches this session. The first is the full show; later ones play the shorter repeat (mapWow
 * catchPlan repeat), so the tenth catch is still quick and fun, never a long hold.
 */
let sessionCatches = 0;
/** Lane tooling only (EXPO_PUBLIC_MOTION_CAPTURE, never set in store builds): the per-frame catch probe. */
const CATCH_PROBE = process.env.EXPO_PUBLIC_MOTION_CAPTURE === 'HomeCatchPreview';
function flushProbe(rows: string): void {
  if (catchTraceBuffer.length < 20000) catchTraceBuffer.push(rows.trimEnd());
}
/** Development previews: the next catch plays as the first of a session again. */
export function resetCatchSessionForPreview(count = 0): void { sessionCatches = count; }
/** The catch reveal's fade onto the map before the print flies (CatchReveal fades in 220 ms). */
const REVEAL_FADE_MS = 230;
/** After the print's 460 ms flight lands, the map and player updates commit. */
const PRINT_SETTLE_MS = 620;
/** Next-stage prebuilds are at least this far apart. */
const PREBUILD_GAP_MS = 1000;
/** RIDE AGAIN reopens the viewfinder after its close has fully reset. */
const RIDE_AGAIN_MS = 1150;
const GRADE_CHIP: Record<PhotoGrade, [string, string]> = {
  blurry: ['#334155', '#ffffff'], good: ['#ffffff', '#0b2f5c'], great: ['#dfe7f1', '#0b2f5c'], frame_it: ['#ffcf3b', '#0b2f5c'],
};

const MAP_SPARKLE = require('../../../assets/images/map/fx/sparkle.png');
/** House art (already in the app): Alex's inked gold burst, the blue water ring and the gold star. */
const WATER_RING = require('../../../assets/fx/waterring.webp');
const MINI_STAR = require('../../../assets/fx/mini-star.webp');
const COIN_FALLBACK = require('../../../assets/images/coingold.png');
/** Round 4: one inked coin (Alex's game coin, dark rim and a white shine) reads over the gold burst; the
 * chip's coin-pile icon read as a gold clump on gold. */
const STREAM_COIN_ART = require('../../../assets/icons/game/coin.png');
const STREAM_COIN = COIN_STREAM.sizePt;
/** Alex's inked 4-point spark, sliding down the beam. */
const INK_SPARK = require('../../../assets/fx/spark.webp');
const INK_SIZE = 220;
/** The inked burst's widest reach (its peak scale is about 1.28), so the stage keeps all of it on screen. */
const INK_REACH = Math.round(INK_SIZE * 1.28 / 2);
/** Haptic intents a beat can name (beats carry an index, so the UI thread passes numbers only). */
const BEAT_HAPTICS: readonly CatchBeatHaptic[] = ['tapLight', 'tickSelection', 'hitMedium', 'comboHeavy', 'success', 'hitSoft'];
/** Beat kinds on the catch clock (fired from the UI thread with runOnJS: sound, haptics, marks only). */
const BEAT = { haptic: 1, hitstop: 2, burst: 3, success: 4, fly: 5, land: 6, coin: 7, tick: 8, done: 9, badge: 10, tickets: 11, exit: 12, beam: 13 } as const;
type Beat = { at: number; kind: number; arg: number };
/**
 * True on the UI thread. A view's first-render style is computed on the JS thread, whose copies of the clock
 * can be stale; the catch views start hidden there and the UI thread takes over on the next frame.
 */
function onUi(): boolean {
  'worklet';
  return (globalThis as { _WORKLET?: boolean })._WORKLET === true;
}
const HIDDEN = { opacity: 0 } as const;
/** The beam's canvas: wide at the top, narrow where it meets the find (a tapered column of light). */
const BEAM_W = 96;
const BEAM_FOOT = 22;
const WATER_W = 150;
const WATER_H = 85;
/** Wave 4: thin house-blue edge bands (top and bottom 15%), lighter, so the map's centre stays warm and never greys. */
const VIGNETTE_TOP = ['rgba(7,104,185,0.16)', 'rgba(7,104,185,0)'] as const;
const VIGNETTE_BOTTOM = ['rgba(7,104,185,0)', 'rgba(7,104,185,0.18)'] as const;
const GLOW_TEX = require('../../../assets/images/map/fx/glow.png');

const SPARK_TINTS = [GOLD_FX.rays, BRAND.white, GOLD_FX.glow, '#4fb3ff'];

/** A burst sparkle: flung out radially, then gravity pulls it down as it fades (UI thread, one shared clock). */
function BurstSparkle({ index, count, t }: { index: number; count: number; t: SharedValue<number> }) {
  const angle = (index / count) * Math.PI * 2 + (index % 2 ? 0.22 : -0.1);
  const speed = index % 3 === 0 ? 150 : index % 3 === 1 ? 118 : 92;
  const size = index % 3 === 0 ? 20 : 15;
  const style = useAnimatedStyle(() => {
    const p = t.value;
    if (p <= 0 || p >= 1) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0 }] };
    const s = p * 0.9;
    return {
      opacity: p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88,
      transform: [{ translateX: Math.sin(angle) * speed * s }, { translateY: -Math.cos(angle) * speed * s + 140 * s * s },
        { scale: (p < 0.15 ? p / 0.15 : 1) * (1.1 - 0.5 * p) }, { rotate: `${p * 160}deg` }],
    };
  });
  // The tint sits on a plain image inside the animated view (an animated style on the image can drop its tint).
  return <Animated.View style={[styles.burstSparkle, { width: size, height: size, left: -size / 2, top: -size / 2 }, style]}>
    <RNImage source={MAP_SPARKLE} style={[styles.fxFill, { tintColor: SPARK_TINTS[index % SPARK_TINTS.length] }]} resizeMode="contain" fadeDuration={0} />
  </Animated.View>;
}

/** A gather sparkle: drawn in toward the find while it charges (the light collecting before the burst). */
function GatherSparkle({ index, count, charge }: { index: number; count: number; charge: SharedValue<number> }) {
  const angle = (index / count) * Math.PI * 2 + 0.4;
  const style = useAnimatedStyle(() => {
    const c = charge.value;
    if (c <= 0.02 || c >= 0.99) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0 }] };
    // Each sparkle runs its own lap of the gather, slightly offset, so they arrive one after another.
    const local = Math.min(1, Math.max(0, c * 1.25 - (index % 4) * 0.08));
    const r = 74 * (1 - local);
    return { opacity: Math.sin(local * Math.PI), transform: [{ translateX: Math.sin(angle) * r }, { translateY: -Math.cos(angle) * r }, { scale: 0.5 + 0.5 * local }] };
  });
  return <Animated.View style={[styles.gatherSparkle, style]}>
    <RNImage source={MAP_SPARKLE} style={[styles.fxFill, { tintColor: GOLD_FX.raysSoft }]} resizeMode="contain" fadeDuration={0} />
  </Animated.View>;
}

/**
 * A star flung from the burst (bigger than a sparkle, so it reads even at 10 frames a second). Round 4: a pool
 * of BURST_STARS_MAX, of which `count` fly this catch (the burst variant), fanned evenly over the top.
 */
function BurstStar({ index, t, count, home, to }: { index: number; t: SharedValue<number>; count: SharedValue<number>;
  /** Wave 5 round 2: 1 on the 5th-catch treat: the stars arc into the coin counter at `to` (pt from the find). */
  home: SharedValue<number>; to: SharedValue<{ x: number; y: number }> }) {
  const style = useAnimatedStyle(() => {
    const p = t.value;
    const n = count.value;
    if (p <= 0 || p >= 1 || index >= n) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0 }, { rotate: '0deg' }] };
    if (home.value) {
      const h = homeStarAt(p, index, n, to.value);
      if (!h) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0 }, { rotate: '0deg' }] };
      return { opacity: 1, transform: [{ translateX: h.x }, { translateY: h.y }, { scale: h.scale }, { rotate: `${(index % 2 ? -1 : 1) * p * 300}deg` }] };
    }
    const spread = n > 4 ? 0.62 : 0.9;
    const angle = -Math.PI / 2 + (index - (n - 1) / 2) * spread;
    const reach = (index % 2 ? 96 : 120) + (n > 4 ? 30 : 0);
    const out = 1 - (1 - p) * (1 - p) * (1 - p);
    return {
      opacity: p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4,
      transform: [{ translateX: Math.cos(angle) * reach * out }, { translateY: Math.sin(angle) * reach * out + 90 * p * p },
        { scale: (p < 0.12 ? p / 0.12 : 1) * (1.15 - 0.45 * p) }, { rotate: `${(index % 2 ? -1 : 1) * p * 220}deg` }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.burstStar, style]}>
    <Image source={MINI_STAR} style={styles.fxFill} contentFit="contain" transition={0} />
  </Animated.View>;
}

/**
 * Round 4: the milestone beam, drawn once with Skia (static, no per-frame redraw) and moved only by its
 * wrapper's transforms. A tapered column of light, wide at the sky and narrow at the find, with a soft gold
 * body, a white-hot core line and Alex's ink on both edges, so it reads as hand-drawn art and not a bar.
 */
const BeamColumn = memo(function BeamColumn({ height }: { height: number }) {
  const h = Math.max(1, height);
  const mid = BEAM_W / 2;
  const top = BEAM_W / 2 - 4, foot = BEAM_FOOT / 2;
  const body = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(mid - top, 0); path.lineTo(mid + top, 0); path.lineTo(mid + foot, h); path.lineTo(mid - foot, h); path.close();
    return path;
  }, [h, mid, top, foot]);
  const core = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(mid - 7, 0); path.lineTo(mid + 7, 0); path.lineTo(mid + 2.5, h); path.lineTo(mid - 2.5, h); path.close();
    return path;
  }, [h, mid]);
  const edges = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(mid - top, 0); path.lineTo(mid - foot, h);
    path.moveTo(mid + top, 0); path.lineTo(mid + foot, h);
    return path;
  }, [h, mid, top, foot]);
  return <Canvas style={{ width: BEAM_W, height: h }} pointerEvents="none">
    <SkPath path={body}>
      <SkLinearGradient start={vec(0, 0)} end={vec(0, h)} colors={['rgba(255,224,122,0)', 'rgba(255,214,74,0.55)', 'rgba(255,207,59,0.95)']} positions={[0, 0.35, 1]} />
    </SkPath>
    <SkPath path={core}>
      <SkLinearGradient start={vec(0, 0)} end={vec(0, h)} colors={['rgba(255,255,255,0)', 'rgba(255,253,240,0.9)', '#ffffff']} positions={[0, 0.3, 1]} />
    </SkPath>
    <SkPath path={edges} style="stroke" strokeWidth={2.5} strokeCap="round">
      <SkLinearGradient start={vec(0, 0)} end={vec(0, h)} colors={['rgba(5,52,110,0)', 'rgba(5,52,110,0.55)', 'rgba(5,52,110,0.9)']} positions={[0, 0.4, 1]} />
    </SkPath>
  </Canvas>;
});

/** An inked spark sliding down the beam toward the find (5 of them, 50 ms apart). */
function BeamSpark({ index, clock, plan, on, sx, sy }: { index: number; clock: SharedValue<number>; plan: SharedValue<CatchPlan>;
  on: SharedValue<number>; sx: SharedValue<number>; sy: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    if (!on.value) return { opacity: 0, transform: [{ translateX: -999 }, { translateY: -999 }, { scale: 0 }, { rotate: '0deg' }] };
    const d = clock.value - (plan.value.hitStopAt - BEAM.dropMs) - index * 50;
    const u = d / 360;
    if (u <= 0 || u >= 1) return { opacity: 0, transform: [{ translateX: -999 }, { translateY: -999 }, { scale: 0 }, { rotate: '0deg' }] };
    const side = index % 2 ? -1 : 1;
    const x = sx.value + side * (10 + 6 * (index % 3)) * (1 - u);
    const y = sy.value * Math.min(1, u * 1.05);
    return { opacity: Math.sin(u * Math.PI), transform: [{ translateX: x - 9 }, { translateY: y - 9 }, { scale: 0.7 + 0.5 * Math.sin(u * Math.PI) }, { rotate: `${u * 180 * side}deg` }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.beamSpark, style]}>
    <Image source={INK_SPARK} style={styles.fxFill} contentFit="contain" transition={0} />
  </Animated.View>;
}

/** Round 4: gold rings rippling out of the find on the burst, 90 ms apart (1 to 3 by the burst variant). */
function BurstRing({ index, frame, on, count, sx, sy }: { index: number; frame: SharedValue<CatchFrame>; on: SharedValue<number>;
  count: SharedValue<number>; sx: SharedValue<number>; sy: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    if (!onUi()) return HIDDEN;
    const r0 = on.value ? frame.value.ring : -1;
    const r = r0 < 0 || index >= count.value ? -1 : r0 - index * (90 / DURATION.bloom);
    return {
      opacity: r <= 0 || r >= 1 ? 0 : (0.9 - 0.15 * index) * (1 - r),
      transform: [{ translateX: sx.value - 40 }, { translateY: sy.value - 40 }, { scale: 0.5 + (1.9 + 0.5 * index) * Math.max(0, r) }],
    };
  });
  return <Animated.View style={[styles.ring, { borderColor: index === 1 ? BRAND.white : GOLD_FX.rays }, style]} pointerEvents="none" />;
}

/**
 * One coin of the stream (Monopoly GO): out of the find on the burst, then a throw into the counter.
 * Always mounted and still (opacity 0) until a stream runs, so no catch mounts views on its burst frame.
 * A memo (round 4): the catch layer's own re-renders never re-push a coin's first-render style mid-flight.
 */
const StreamCoin = memo(function StreamCoin({ index, t, count, geo, source }: {
  index: number; t: SharedValue<number>; count: SharedValue<number>;
  geo: SharedValue<{ fx: number; fy: number; tx: number; ty: number }>; source: number;
}) {
  const style = useAnimatedStyle(() => {
    const n = count.value;
    if (index >= n || t.value <= 0) return { opacity: 0, transform: [{ translateX: -100 }, { translateY: -100 }, { scale: 0 }, { scaleX: 1 }] };
    const g = geo.value;
    const at = coinStreamAt(t.value, index, n, { x: g.fx, y: g.fy }, { x: g.tx, y: g.ty });
    if (!at) return { opacity: 0, transform: [{ translateX: -100 }, { translateY: -100 }, { scale: 0 }, { scaleX: 1 }] };
    return {
      opacity: 1,
      transform: [{ translateX: at.x - STREAM_COIN / 2 }, { translateY: at.y - STREAM_COIN / 2 }, { scale: at.scale },
        // The coin's edge turns as it flies (never thinner than a third, so it always reads as a coin).
        { scaleX: Math.max(0.35, Math.abs(Math.cos(at.spin * Math.PI))) }],
    };
  });
  // A gold sparkle trails each coin by 45 ms, so the stream reads as a line leading the eye to the counter.
  const trail = useAnimatedStyle(() => {
    const n = count.value;
    const tt = t.value - 45;
    if (index >= n || tt <= 0) return { opacity: 0, transform: [{ translateX: -100 }, { translateY: -100 }, { scale: 0 }] };
    const g = geo.value;
    const at = coinStreamAt(tt, index, n, { x: g.fx, y: g.fy }, { x: g.tx, y: g.ty });
    if (!at) return { opacity: 0, transform: [{ translateX: -100 }, { translateY: -100 }, { scale: 0 }] };
    return { opacity: 0.85, transform: [{ translateX: at.x - 9 }, { translateY: at.y - 9 }, { scale: at.scale }] };
  });
  return <>
    <Animated.View pointerEvents="none" style={[styles.coinTrail, trail]}>
      <RNImage source={MAP_SPARKLE} style={[styles.fxFill, { tintColor: GOLD_FX.raysSoft }]} resizeMode="contain" fadeDuration={0} />
    </Animated.View>
    <Animated.View pointerEvents="none" style={[styles.streamCoin, style]}>
      <RNImage source={source} style={styles.fxFill} resizeMode="contain" fadeDuration={0} />
    </Animated.View>
  </>;
});

type BadgeStyles = Record<'badge' | 'kick' | 'landRing' | 'bar' | 'barGlow' | 'newPop' | 'grade' | 'ride' | 'countOld' | 'countNew' | 'coinStamp' | 'oneMore' | 'next' | 'nextRing' | 'ghost', ReturnType<typeof useAnimatedStyle<ViewStyle>>>;

/**
 * The collection badge as a memo (round 3): it re-renders only when its content changes (the server's answer,
 * before it shows), never while it is on screen, so its animated views never get their first-render styles
 * pushed back mid-moment (the badge blinking out, the count stepping back).
 */
const CatchBadge = memo(function CatchBadge({ st, summary, photo, bonusXp, newRide, art, name, color, left, bottom, coinStamp, nextArt }: {
  /** Round 5: the set's next missing find (its art drawn as a navy silhouette on the badge's corner). */
  readonly nextArt: ReturnType<typeof findImageSource> | null;
  /** Round 4: a repeat find's coins, stamped on the badge (its set count did not change, so the bar stays put). */
  readonly coinStamp: number | null;
  readonly st: BadgeStyles; readonly summary: CatchSummary | null; readonly photo: { image: SkImage | null; grade: PhotoGrade } | null;
  readonly bonusXp: number | null; readonly newRide: { name: string; line: string; stamps: ReturnType<typeof rideStamps> } | null;
  readonly art: ReturnType<typeof findImageSource> | null; readonly name: string; readonly color: string; readonly left: number; readonly bottom: number;
}) {
  const total = summary?.total, collected = summary?.collected;
  return (
        <Animated.View pointerEvents="none" style={[styles.badge, nextArt && !photo && styles.badgeNextRoom, { left, bottom }, st.badge]}>
          {/* Sticker: the photo (or the item) breaks out of the badge with a die-cut edge */}
          <Animated.View style={[styles.sticker, photo && styles.stickerPhoto,
            photo && { borderColor: photo.grade === 'frame_it' ? '#ffcf3b' : photo.grade === 'great' ? '#c9d5e3' : '#ffffff' }, st.kick]}>
            {/* The sticker canvas stays mounted; it shows the actual photo once there is one. */}
            <Canvas style={[{ width: STICKER - 10, height: STICKER - 10 }, !photo?.image && styles.hiddenCanvas]}>
              <SkImageNode image={photo?.image ?? BLANK_IMAGE} x={0} y={0} width={STICKER - 10} height={STICKER - 10} fit="cover" />
            </Canvas>
            {!photo?.image && art ? <Image source={art} style={[styles.stickerArt, styles.stickerOver]} contentFit="contain" transition={0} /> : null}
          </Animated.View>
          <Animated.View style={[styles.landRing, { borderColor: color }, st.landRing]} />
          <View style={styles.badgeCopy}>
            <View style={styles.badgeTop}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {summary?.isNew && <Animated.View style={[styles.newPill, { backgroundColor: summary.rarityColor }, st.newPop]}>
                <Text style={styles.newText}>NEW!</Text>
              </Animated.View>}
            </View>
            <View style={styles.progressRow}>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, { backgroundColor: summary?.setColor ?? BRAND.gold }, st.bar]} />
                <Animated.View pointerEvents="none" style={[styles.barGlow, st.barGlow]} />
                {/* One more to finish the set: the last empty stretch of the bar glows gold (no words needed). */}
                {summary?.isNew && total != null && collected != null && total - collected === 1
                  ? <Animated.View pointerEvents="none" style={[styles.oneMore, { width: `${100 / total}%` }, st.oneMore]} /> : null}
                {/* Wave 5 round 2: the next slot glows softly in time with the next-goal disc ("this one is next"). */}
                {nextArt && !photo && total != null && collected != null && total - collected > 1
                  ? <Animated.View pointerEvents="none" style={[styles.ghostSlot, { left: `${(100 * collected) / total}%`, width: `${100 / total}%` }, st.ghost]} /> : null}
              </View>
              {/* A NEW find's count steps up on the frame it lands (two layers swapped on the UI thread, no re-render). */}
              {collected != null && total != null && (summary?.isNew ? <View>
                <Animated.View style={st.countOld}><Text style={styles.count}>{Math.max(0, collected - 1)}/{total}</Text></Animated.View>
                <Animated.View style={[styles.countOver, st.countNew]}><Text style={styles.count}>{collected}/{total}</Text></Animated.View>
              </View> : <Text style={styles.count}>{collected}/{total}</Text>)}
            </View>
            {summary?.setName && <Text style={styles.setName} numberOfLines={1}>{summary.complete ? `${summary.setName} complete!` : summary.setName}</Text>}
          </View>
          {/* The pill's fill and border sit on a plain view inside the animated one (an animated scale on a view with
              its own background and border drew a stale oversized fill on Fabric). */}
          {coinStamp != null && !photo && <Animated.View style={[styles.coinStampAt, st.coinStamp]}>
            <View style={styles.coinStamp}>
              <RNImage source={STREAM_COIN_ART} style={styles.coinStampIcon} resizeMode="contain" fadeDuration={0} />
              <Text style={styles.coinStampText} numberOfLines={1}>+{coinStamp}</Text>
            </View>
          </Animated.View>}
          {/* The next goal: the set's next missing find popping onto the badge's corner in a gold ring after the catch
              lands. Wave 5 round 2: its own art, faded to a light ghost (a kid can tell what it is, and that it is not
              theirs yet), instead of a navy shadow nobody could name. A picture, no words. */}
          {nextArt && !photo ? <Animated.View style={[styles.nextAt, st.next]} pointerEvents="none">
            <Animated.View style={[styles.nextRing, st.nextRing]} />
            <View style={styles.nextDisc}>
              <RNImage source={nextArt as never} style={styles.nextArt} resizeMode="contain" fadeDuration={0} />
            </View>
          </Animated.View> : null}
          {photo && <Animated.View style={[styles.gradeChip, { backgroundColor: GRADE_CHIP[photo.grade][0] }, st.grade]}>
            {Array.from({ length: GRADE_STARS[photo.grade] }, (_, i) => <GameIcon key={i} name="star" size={14} />)}
            <Text style={[styles.gradeText, { color: GRADE_CHIP[photo.grade][1] }]} numberOfLines={1}>{GRADE_LABEL[photo.grade]}</Text>
            {bonusXp ? <View style={styles.xpPill}><Text style={styles.xpText} numberOfLines={1}>+{bonusXp} XP</Text></View> : null}
          </Animated.View>}
          {/* A ride the player never snapped: "New ride!", the 3 ride stamps, "n of 3", then (after a divider) the
              unbuilt rides as dim "coming soon" silhouettes, no locks and no number. No progress-bar fill. */}
          {newRide && <View style={styles.rideRow} pointerEvents="none"><Animated.View style={[styles.rideChip, st.ride]}>
            <Text style={styles.rideText} numberOfLines={1}>New ride!</Text>
            {newRide.stamps.filter(stamp => stamp.state !== 'soon').map(stamp => (
              <View key={stamp.kind} style={[styles.stamp, stamp.state === 'new' && styles.stampNew, stamp.state === 'open' && styles.stampOpen]}>
                <Image source={RIDE_STAMP[stamp.kind]} style={styles.stampArt} contentFit="contain" transition={0} />
              </View>))}
            <Text style={styles.rideCount} numberOfLines={1}>{newRide.line}</Text>
            <View style={styles.rideDivider} />
            {newRide.stamps.filter(stamp => stamp.state === 'soon').map(stamp => (
              <View key={stamp.kind} style={styles.stampSoon}><GameIcon name="ride" size={10} /></View>))}
          </Animated.View></View>}
        </Animated.View>
  );
});

type FxStyles = Record<'halo' | 'beam' | 'splash' | 'water' | 'gather' | 'spark' | 'star' | 'flash' | 'item', ReturnType<typeof useAnimatedStyle<ViewStyle>>>;
/** The shared values the effects pools read (stable for the component's life). */
type FxValues = { readonly frame: SharedValue<CatchFrame>; readonly clock: SharedValue<number>; readonly plan: SharedValue<CatchPlan>;
  readonly on: SharedValue<number>; readonly beamOn: SharedValue<number>; readonly ringN: SharedValue<number>; readonly starN: SharedValue<number>;
  readonly sx: SharedValue<number>; readonly sy: SharedValue<number>;
  readonly homeStars: SharedValue<number>; readonly starTo: SharedValue<{ x: number; y: number }> };

/**
 * The common catch's art and effects (round 3). A memo with stable props only (shared values, animated style
 * handles, the find's art), so nothing re-renders it while the clock runs: on Fabric with Reanimated 3.16 a
 * re-render pushes each animated view's first-render style again (PropsFilter), which showed up as stale
 * frames mid-catch (the halo blinking, the burst jumping back a beat).
 */
const CatchFx = memo(function CatchFx({ fx, sv, burst, confetti, layerHeight, art, color, motionFx, sparks, stars, gatherCount, goldSize, fxT, gatherT, onCopyShown }: {
  readonly fx: FxStyles; readonly sv: FxValues; readonly burst: BurstValues; readonly confetti: number; readonly layerHeight: number;
  readonly art: ReturnType<typeof findImageSource> | null; readonly color: string; readonly motionFx: boolean;
  readonly sparks: number; readonly stars: number; readonly gatherCount: number; readonly goldSize: number;
  readonly fxT: SharedValue<number>; readonly gatherT: SharedValue<number>;
  readonly onCopyShown: () => void;
}) {
  return <>
    {/* Gather: a gold halo builds under the find (ground-glow art, tinted gold). */}
    <Animated.View style={[styles.halo, fx.halo]} pointerEvents="none">
      <RNImage source={GLOW_TEX} style={[styles.fxFill, { tintColor: GOLD_FX.glow }]} resizeMode="stretch" fadeDuration={0} />
    </Animated.View>
    {/* The milestone beam: a tapered inked column of light (Skia, drawn once), sparks sliding down it, and a gold
        splash ring where it hits the find on the held frame. */}
    {motionFx && <Animated.View style={[styles.beam, { height: layerHeight }, fx.beam]} pointerEvents="none">
      <BeamColumn height={layerHeight} />
    </Animated.View>}
    {motionFx && Array.from({ length: BEAM.sparkles }, (_, index) => (
      <BeamSpark key={index} index={index} clock={sv.clock} plan={sv.plan} on={sv.beamOn} sx={sv.sx} sy={sv.sy} />))}
    {motionFx && <Animated.View style={[styles.splash, fx.splash]} pointerEvents="none" />}
    {motionFx && <Animated.View style={[styles.waterRing, fx.water]} pointerEvents="none">
      <Image source={WATER_RING} style={styles.fxFill} contentFit="contain" transition={0} />
    </Animated.View>}
    {/* Wave 4: the bloom, the hand-inked sunburst and Alex's ink burst in one Skia canvas driven by the clock
        (no animated view style a React commit could reset, so the burst can never blink mid-hold). */}
    {motionFx && <CatchBurst v={burst} goldSize={goldSize} confetti={confetti} />}
    {Array.from({ length: BURST_RINGS_MAX }, (_, index) => (
      <BurstRing key={index} index={index} frame={sv.frame} on={sv.on} count={sv.ringN} sx={sv.sx} sy={sv.sy} />))}
    <Animated.View style={[styles.sparkOrigin, fx.gather]} pointerEvents="none">
      {Array.from({ length: gatherCount }, (_, index) => <GatherSparkle key={index} index={index} count={gatherCount} charge={gatherT} />)}
    </Animated.View>
    <Animated.View style={[styles.sparkOrigin, fx.spark]} pointerEvents="none">
      {Array.from({ length: sparks }, (_, index) => <BurstSparkle key={index} index={index} count={sparks} t={fxT} />)}
    </Animated.View>
    <Animated.View style={[styles.sparkOrigin, fx.star]} pointerEvents="none">
      {Array.from({ length: stars }, (_, index) => <BurstStar key={index} index={index} t={fxT} count={sv.starN} home={sv.homeStars} to={sv.starTo} />)}
    </Animated.View>
    <Animated.View style={[styles.flash, fx.flash]} pointerEvents="none">
      <RNImage source={GLOW_TEX} style={[styles.fxFill, { tintColor: GOLD_FX.core }]} resizeMode="stretch" fadeDuration={0} />
    </Animated.View>
    <Animated.View style={[styles.item, fx.item]} pointerEvents="none">
      {/* Round 5: a soft white rim keeps the find readable on the gold (a sticker on the burst). */}
      <RNImage source={GLOW_TEX} style={[styles.itemRim, { tintColor: '#ffffff' }]} resizeMode="stretch" fadeDuration={0} />
      {art ? <Image source={art} style={styles.itemArt} contentFit="contain" transition={0} onDisplay={onCopyShown} />
        : <View style={[styles.itemFallback, { backgroundColor: color }]}><GameIcon name="gift" size={30} /></View>}
    </Animated.View>
  </>;
});

export interface HomeCatchHandle {
  /** Open the Ride Photo stage on the tap's frame (before the catch request lands). */
  primeRide: (item: PrepItemType, from: { x: number; y: number } | null) => boolean;
}

/**
 * The catch on the home map. Commons pop and fly into the collection badge.
 * Uncommon and rarer finds open the Ride Photo viewfinder (pre-mounted while a
 * Ride Photo find is near), and the developed print itself flies into the
 * badge, which kicks, shows NEW, ticks the set and shows the grade and bonus.
 */
const HomeCatchMoment = forwardRef<HomeCatchHandle, {
  readonly request: CatchRequest | null;
  /** The nearest Ride Photo find, so its stage is mounted and warm before the tap. */
  readonly stageItem?: PrepItemType | null;
  readonly badgeBottom: number;
  readonly redeem?: typeof redeemPrepItem;
  /** The freshest GPS fix at the moment of the catch (kept off this component's renders). */
  readonly getFix: () => Fix;
  /** A still of the map taken earlier (when a Ride Photo find came in range), blurred behind the open and close. */
  readonly mapStill?: string | null;
  readonly onCollected: (data: RedeemPrepItemResponseType['data']) => void;
  readonly onUnavailable: () => void;
  /** A Legendary rode off: the find leaves the map for this session (the server is told too). */
  readonly onRodeOff?: (pivotId: number) => void;
  /** The moment is over; `caught` is false after a failure or a close (the find shows again). */
  readonly onDone: (caught: boolean) => void;
  /** A plain line for the slim chip; `retryable` when tapping again could work. */
  readonly onFailed: (line: string, retryable: boolean) => void;
  /** Development recordings only (see RidePhotoCatch). */
  readonly autoShots?: number[] | null;
  /** Development recordings: pin the ride and sky. */
  readonly forceRide?: { readonly kind?: RideKind; readonly sky?: Sky; readonly gullPass?: number } | null;
  /** Ride Photo finds to warm in idle time (their stages are built before any tap). */
  /** The reward banner is on the map (map markers under it hide their tags). */
  readonly onCascade?: (active: boolean) => void;
  /** Development recordings: play this catch as if Reduce Motion were on. */
  readonly forceReducedMotion?: boolean;
  /** Development recordings: tap through the reveal (it must be skippable for that tier). */
  readonly autoSkipReveal?: boolean;
  /** Development recordings: the escape's own pick. */
  readonly autoEscape?: 'map' | 'again';
  /** A Legendary rode by and the kid chose RIDE AGAIN: open the same find's viewfinder for its next ride. */
  readonly onRideAgain?: (item: PrepItemType, pivotId: number) => void;
  /** The set's book page for the reveal (default: the server's set page; previews pass fixtures). */
  readonly loadSetPage?: (slug: string) => Promise<BookItem[] | null>;
  readonly warm?: readonly { readonly item: PrepItemType; readonly forceRide?: { readonly kind?: RideKind; readonly sky?: Sky } | null }[];
  /** Refresh the signed-in player after a catch (off in signed-out dev previews). */
  readonly refreshAfterCatch?: boolean;
  /**
   * Wave 5 round 2: where to walk next after this catch (this layer's points), or null while another find is still in
   * catch range. The next-goal disc then shows that find and flies onto its spot or its edge arrow.
   */
  readonly whereNext?: (caughtPivot: number) => { readonly x: number; readonly y: number; readonly item: PrepItemType } | null;
}>(function HomeCatchMoment({ request, stageItem = null, badgeBottom, redeem = redeemPrepItem, getFix, mapStill = null,
  onCollected, onUnavailable, onRodeOff: onRodeOffProp, onDone, onFailed, autoShots, forceRide, warm, onCascade, forceReducedMotion = false, autoSkipReveal = false, autoEscape = 'map', loadSetPage, onRideAgain, refreshAfterCatch = true, whereNext }, ref) {
  const systemReduced = useReducedGameMotion();
  // Development recordings can show one catch with Reduce Motion on.
  // Release-like captures (CATCH_PROBE, lane tooling only) can show it too.
  const reducedMotion = ((__DEV__ || CATCH_PROBE) && forceReducedMotion) || systemReduced;
  const power = usePowerBudget();
  const { refreshPlayer, player } = useContext(AuthContext);
  // Uncommon's tighter lamp is earned per player, never per device.
  useEffect(() => { setRidePhotoPlayer(player?.id ?? null); }, [player?.id]);
  const { currencies } = useContext(CurrencyContext);
  const { triggerFly, getTarget } = useCurrencyFly();
  const layerRef = useRef<View>(null);
  const stage = useRef<RideStageHandle>(null);
  const [layer, setLayer] = useState({ width: 0, height: 0 });
  const [summary, setSummary] = useState<CatchSummary | null>(null);
  const [showing, setShowing] = useState<CatchRequest | null>(null);
  /** Wave 4: the confetti pieces mount only for the grand catch (the same commit as the catch's own art). */
  const [grandCatch, setGrandCatch] = useState(false);
  const [ride, setRide] = useState<{ key: number; closing: boolean; hint: boolean; flyTo: { x: number; y: number } | null } | null>(null);
  const [rideItem, setRideItem] = useState<PrepItemType | null>(null);
  // The map's mounted stage only ever swaps to a find whose stage is already built (idle prebuild), so
  // nothing is built in render on the map; after a catch the finished ride stays until the next is ready.
  const [readyItem, setReadyItem] = useState<PrepItemType | null>(null);
  const [stageNonce, setStageNonce] = useState(0);
  const rideItemRef = useRef<PrepItemType | null>(null);
  rideItemRef.current = rideItem;
  const [primed, setPrimed] = useState<{ item: PrepItemType; from: { x: number; y: number } | null } | null>(null);
  const [photo, setPhoto] = useState<{ image: SkImage | null; grade: PhotoGrade } | null>(null);
  const [, setCascadeState] = useState(0);
  /** The ride hand-off's beat counter (the count steps up at beat 2), mirrored for the badge's UI-thread swap. */
  const cascadeSV = useSharedValue(0);
  const setCascade = (n: number | ((c: number) => number)) => {
    setCascadeState(n);
    if (typeof n === 'number') cascadeSV.value = n;
  };
  const [bonusXp, setBonusXp] = useState<number | null>(null);
  const [coinStamp, setCoinStamp] = useState<number | null>(null);
  const [nextArt, setNextArt] = useState<ReturnType<typeof findImageSource> | null>(null);
  /** Round 5: the caught find's set page, read from the tap (one light GET) so the badge can show the next goal. */
  const commonSet = useRef<{ slug: string; items: readonly BookItem[] | null } | null>(null);
  /**
   * Round 4: a plain (React) gate over the badge, on from the server's answer to the done frame. A React commit
   * after the badge has left could flash an old frame of its animated props on Fabric (r4 clip, one frame at
   * 5.955 s); the gate's opacity 0 rides in that same commit, so a finished badge can never reappear.
   */
  const [badgeOn, setBadgeOn] = useState(false);
  // v2: the full-screen catch reveal for Ride Photo catches (the print, the pop, the tally, the book page).
  const [shownReveal, setReveal] = useState<CatchRevealData | null>(null);
  /** Bumped by every prime, so a finished catch's deferred clears never touch the next ride. */
  const primeSeq = useRef(0);
  const [revealOutcome, setRevealOutcome] = useState<RevealOutcome>('pending');
  const [revealEscape, setRevealEscape] = useState<RevealEscape | null>(null);
  // The reveal and the viewfinder share two UI-thread flags (no React props): the reveal's opaque scrim stops
  // the scene clock under it, and CONTINUE hides the viewfinder on the same frame the reveal starts to fade.
  const revealCovered = useSharedValue(false);
  const revealHidden = useSharedValue(false);
  const revealFlags = useMemo(() => ({ covered: revealCovered, hidden: revealHidden }), [revealCovered, revealHidden]);
  const revealedRef = useRef(false);
  // The Ride Photo layer covers the whole screen (the header and tab bar slide away), so it is offset by
  // where this map container sits in the window.
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const redeemRun = useRef<Promise<CatchResult> | null>(null);
  const aliveRef = useRef(0);

  // The Ride Photo hand-off still paces its badge with these (the print flies on its own clock).
  const itemGone = useSharedValue(1);
  const badgeIn = useSharedValue(0);
  const badgeKick = useSharedValue(1);
  const progress = useSharedValue(0);
  const reveal = useSharedValue(0);
  const gradeIn = useSharedValue(0);
  const backdrop = useSharedValue(0);
  const ringPop = useSharedValue(0);
  const flyFromX = useSharedValue(0);
  const flyFromY = useSharedValue(0);
  const rideIn = useSharedValue(0);
  const barGlow = useSharedValue(0);

  // ── Round 3: a common catch runs on ONE UI-thread clock (hudClock, ms from the tap). Every view below is a
  // worklet of mapWow.catchFrame(clock, plan), so a busy JS thread can no longer stretch or desync the beats.
  // JS only answers the server, plays sounds and haptics (runOnJS from the clock), and finishes at doneAt.
  const cc = hudClock;
  /** Round 5: every commit of this moment re-sends its styles for a moment (commitHeal): no stale first-render frames. */
  const heal = useCommitHeal();
  // The burst's ink art is decoded once (Skia), long before the first catch.
  const [burstInk, setBurstInk] = useState<SkImage | null>(null);
  useEffect(() => { void loadBurstInk().then(setBurstInk); }, []);
  const planSV = useSharedValue<CatchPlan>(catchPlan({ reduced: false }));
  /** 1 while a common's clock drives the badge (the Ride Photo path drives it with the values above). */
  const clockOn = useSharedValue(0);
  /** 0 waiting for the server, 1 caught, -1 missed. */
  const resolved = useSharedValue(0);
  const waiting = useSharedValue(0);
  const continued = useSharedValue(0);
  const endAt = useSharedValue(0);
  const holdWobble = useSharedValue(0);
  const miss = useSharedValue(0);
  const skipSV = useSharedValue(0);
  const stageX = useSharedValue(0);
  const stageY = useSharedValue(0);
  const targetX = useSharedValue(0);
  const targetY = useSharedValue(0);
  const barFrom = useSharedValue(0);
  const barTo = useSharedValue(0);
  const beamOn = useSharedValue(0);
  /** Wave 5 round 2: when the clock reached its held frame before the server answered (Date.now on the UI thread), 0 otherwise. */
  const heldAt = useSharedValue(0);
  /** Wave 5 round 2: the wall time the clock is due at its held frame, and the tail's two-speed shape (see twoSpeed). */
  const heldGoal = useSharedValue(0);
  const tailShape = useSharedValue({ a: 1, b: 1 });
  /** The layer's copy shows from the clock's first frame, the same frame the pin hides (one clean swap). */
  const copyOn = useSharedValue(0);
  const inkTurn = useSharedValue(0);
  /** Round 4: the burst variant of this catch (mapWow.burstVariant): ink size, rings, stars. */
  const inkScale = useSharedValue(1);
  const ringN = useSharedValue(1);
  const starN = useSharedValue(4);
  /** Wave 4: 1 on the grand (25th) catch: the confetti. */
  const grandSV = useSharedValue(0);
  /** Wave 5 round 2: milestones show the spike fan and the counter-turning ring; the 5th's stars fly to the counter. */
  const fanSV = useSharedValue(0);
  const ring2SV = useSharedValue(0);
  const homeSV = useSharedValue(0);
  const starTo = useSharedValue({ x: 0, y: -300 });
  /** Wave 5 round 2: the where-next flight (on the session's last catch in range): from the badge's disc to the next find. */
  const whereSV = useSharedValue({ on: 0, at: 0, x0: 0, y0: 0, x1: 0, y1: 0 });
  /** A NEW find steps its count and bar; a repeat find shows its coins on the badge instead (never a fake fill). */
  const isNewSV = useSharedValue(0);
  const kickDirX = useSharedValue(0);
  const layerHeightSV = useSharedValue(1);
  const kickDirY = useSharedValue(1);
  const peakFlash = useSharedValue(0.4);
  const beats = useSharedValue<Beat[]>([]);
  const coinN = useSharedValue(0);
  const coinGeo = useSharedValue({ fx: 0, fy: 0, tx: 0, ty: 0 });
  const frame = useDerivedValue(() => catchFrame(cc.value, planSV.value));
  // The coin stream's own clock is the same clock, from the burst.
  const coinT = useDerivedValue(() => cc.value - planSV.value.coinsAt);
  // The burst kicks the map layer away from the find (catchPresence.catchKickX/Y, read by Map.tsx). UI thread only.
  // Release-like capture only (lane tooling, never in store builds): every UI frame of a catch logs its clock, the
  // beam's drop, the gold and the ink as the Skia burst draws them, and the frame's gap, so the burst's hold and the
  // beam can be proven from the app itself (a busy simulator recorder drops frames the app really drew).
  const probeRows = useSharedValue('');
  const probeN = useSharedValue(0);
  const probeLast = useSharedValue(0);
  useAnimatedReaction(() => (CATCH_PROBE && clockOn.value ? cc.value : -1), t => {
    if (!CATCH_PROBE) return;
    // The last rows of a catch are written when its clock stops (they hold the done frame).
    if (t < 0) { if (probeN.value > 0) { runOnJS(flushProbe)(probeRows.value); probeRows.value = ''; probeN.value = 0; } return; }
    const now = Date.now();
    const dt = probeLast.value > 0 ? now - probeLast.value : 0;
    probeLast.value = now;
    const p = planSV.value;
    const f = frame.value;
    const b = beamOn.value ? beamAt(t, p) : null;
    const gold = f.gold <= 0 ? 0 : Math.min(1, f.gold * 1.1) * (f.suck < 0.6 ? 1 : 1 - (f.suck - 0.6) / 0.4);
    const ink = f.ink < 0 ? 0 : (f.suck < 0.7 ? 1 : Math.max(0, 1 - (f.suck - 0.7) / 0.3));
    probeRows.value = `${probeRows.value}[probe] ${now} t=${Math.round(t)} dt=${dt} beam=${b ? (b.drop * (1 - b.fade)).toFixed(2) : '-'} gold=${gold.toFixed(2)} ink=${ink.toFixed(2)} grand=${grandSV.value}\n`;
    probeN.value += 1;
    if (probeN.value >= 30 || t >= endAt.value) {
      runOnJS(flushProbe)(probeRows.value);
      probeRows.value = ''; probeN.value = 0;
    }
  });
  // Until the layer's copy draws, the tapped pin follows the clock (rise, glide, wobble): the same pose on the hand-off frame.
  useAnimatedReaction(() => {
    if (!clockOn.value || copyOn.value) return null;
    const f = frame.value;
    // The rise is part of the glide (the stage point already sits risePt above the pin).
    return { x: (stageX.value - flyFromX.value) * f.glide, y: (stageY.value - flyFromY.value) * f.glide, rot: f.wobble + holdWobble.value };
  }, (pose, prev) => {
    if (!pose) { if (prev) catchPinPose.value = { x: 0, y: 0, rot: 0 }; return; }
    catchPinPose.value = pose;
  });
  useAnimatedReaction(() => (clockOn.value ? frame.value.shake : 0), (k, prev) => {
    if (k === prev) return;
    catchKickX.value = k * kickDirX.value;
    catchKickY.value = k * kickDirY.value;
  });
  // Channels the shared fx components take as values.
  const fxT = useDerivedValue(() => (clockOn.value ? frame.value.fx : -1));
  const gatherT = useDerivedValue(() => (clockOn.value && cc.value < planSV.value.burstAt ? frame.value.charge * (1 - miss.value) : 0));

  /** A token per common catch, so a late beat from an old clock never touches the next one. */
  /**
   * `beam` and `grand` are plain JS flags (wave 4): JS never reads a shared value it just wrote (Reanimated 3.16
   * hands back the old value until the UI thread has run the write, which is why the 10th-catch beam never fired).
   */
  const runRef = useRef<{ token: number; item: PrepItemType; data: RedeemPrepItemResponseType['data'] | null; next: CatchSummary | null; burst: boolean;
    beam: boolean; grand: boolean } | null>(null);
  const streamIdRef = useRef(0);
  /** Hands the catch from the pin to the layer's copy (once the copy has drawn, or after 280 ms). */
  const startRef = useRef<(() => void) | null>(null);
  const onCopyShown = useCallback(() => startRef.current?.(), []);
  const skipped = useRef(false);
  const skipWake = useRef<(() => void) | null>(null);
  /** A wait a skip can cut short (the Ride Photo hand-off). */
  const pause = (ms: number) => new Promise<void>(resolve => {
    if (skipped.current || ms <= 0) { resolve(); return; }
    const timer = setTimeout(() => { skipWake.current = null; resolve(); }, ms);
    skipWake.current = () => { clearTimeout(timer); skipWake.current = null; resolve(); };
  });
  /** Unused by commons since round 3 (kept for the Ride Photo hand-off's shared land/arrive code). */
  const clockRef = useRef<{ t0: number; plan: CatchPlan; skippable: boolean; streamed: boolean } | null>(null);
  const pauseUntil = (at: number) => { const c = clockRef.current; return pause(c ? c.t0 + at - Date.now() : 0); };

  const latest = useRef({ getFix, currencies, triggerFly, getTarget, refreshPlayer, onCollected, onUnavailable, onRodeOff: onRodeOffProp, onDone, onFailed, redeem, reducedMotion, onCascade, request, onRideAgain, whereNext });
  latest.current = { getFix, currencies, triggerFly, getTarget, refreshPlayer, onCollected, onUnavailable, onRodeOff: onRodeOffProp, onDone, onFailed, redeem, reducedMotion, onCascade, request, onRideAgain, whereNext };

  const badgeLeft = (layer.width - BADGE_WIDTH) / 2;
  const target = { x: badgeLeft + STICKER_LEFT + STICKER / 2, y: layer.height - badgeBottom - BADGE_HEIGHT / 2 - 8 };
  /** The next-goal disc's centre on the badge's corner (styles.nextAt), where the where-next flight starts. */
  const nextDiscRef = useRef({ x: 0, y: 0 });
  nextDiscRef.current = { x: badgeLeft + BADGE_WIDTH + 34 - 30, y: layer.height - badgeBottom - BADGE_HEIGHT + (BADGE_HEIGHT - 60) / 2 + 30 };
  const fromPoint = (req: CatchRequest | null) => req?.from ?? { x: layer.width / 2, y: layer.height * 0.45 };
  // land() and arrive() are stable callbacks: they read the badge spot and the layer offset through refs
  // (round 1 read a stale target from the first render, so the coins set off from the top-left corner).
  const targetRef = useRef(target);
  targetRef.current = target;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  // The map steps back: a cached blurred still, a navy tint and a vignette, never a live blur or a per-open snapshot.
  const showBackdrop = useCallback((on: boolean) => {
    backdrop.value = withTiming(on ? 1 : 0, { duration: latest.current.reducedMotion ? 1 : on ? 160 : 260 });
  }, [backdrop]);

  useImperativeHandle(ref, () => ({
    primeRide: (item, from) => {
      if (catchStyleFor(item.rarity) !== 'ride_photo' || layer.width === 0) return false;
      primeSeq.current += 1;
      setRideItem(item);
      const full = from ? { x: from.x + offset.x, y: from.y + offset.y } : null;
      setPrimed({ item, from: full });
      // Only the UI-thread chrome slide on the tap frame; React catch state commits once the map is covered.
      showCatchChrome(true);
      showBackdrop(true);
      return true;
    },
  }), [layer.width, showBackdrop, offset.x, offset.y]);

  // A common's start point is set before its first frame paints (the catch effect runs after paint).
  useLayoutEffect(() => {
    if (!request || catchStyleFor(request.item.rarity) === 'ride_photo' || layer.width === 0) return;
    const start = fromPoint(request);
    flyFromX.value = start.x;
    flyFromY.value = start.y;
    stageX.value = start.x;
    stageY.value = start.y;
    itemGone.value = 0; miss.value = 0; holdWobble.value = 0; copyOn.value = 0;
    // The clock restarts here (before the first frame of the layer's copy), so the copy starts unsquished
    // at the pin's own spot, and a fresh stream id rests the counter's old roll at its final digits.
    const sid = nextHudStreamId();
    streamIdRef.current = sid;
    hudStreamId.value = sid;
    cancelAnimation(cc); cc.value = 0;
  }, [request?.pivotId, request?.attempt, layer.width > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // The stage opens on the commit that renders it with the primed find (its own rarity, speed and hints).
  useLayoutEffect(() => {
    if (primed) stage.current?.prime(primed.item, primed.from);
  }, [primed]);

  // A prime that never becomes a catch (the tutorial took it, the park check moved) folds away.
  useEffect(() => {
    if (!primed || request) return;
    const timer = setTimeout(() => {
      stage.current?.unprime();
      setPrimed(null);
      showCatchChrome(false);
      setCatchOpen(false);
      showBackdrop(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [primed, request, showBackdrop]);

  /** Fly into the badge (commons), then the reveal cascade, shared by every catch style. */
  const land = useCallback(async (item: PrepItemType, data: RedeemPrepItemResponseType['data'], token: number, viaPrint: boolean) => {
    const motion = !latest.current.reducedMotion;
    const next = catchSummary(item, data);
    setSummary(next);
    setBadgeOn(true);
    latest.current.onCascade?.(true);
    setBonusXp(typeof data.photo?.bonus_xp === 'number' && data.photo.bonus_xp > 0 ? data.photo.bonus_xp : null);
    // Via the print, the map and player updates wait out the close and the flight (their commits never land in
    // the hand-off's frames); they still run if the catch is closed early.
    // The counters wait for their coins: the new balance rolls in when the first coin lands (hudPulse).
    // A common's coins already streamed out of the burst (they hold the counter themselves).
    const streamed = !viaPrint && !!clockRef.current?.streamed;
    if (!streamed && !data.replayed && data.rewards.coins > 0) holdHud('coins', 2600);
    if (!streamed && !data.replayed && data.rewards.tickets > 0) holdHud('tickets', 2600);
    const settle = () => {
      if (data.hunt_week?.rank_line) setHomeHuntRankLine(data.hunt_week.rank_line);
      latest.current.onCollected(data);
      if (refreshAfterCatch) latest.current.refreshPlayer().catch(() => undefined);
    };
    if (viaPrint && motion) setTimeout(settle, PRINT_SETTLE_MS); else settle();
    progress.value = next.progressFrom;
    // Via the print, the pad stays fully hidden until the print lands (arrive() springs it in with the kick).
    // Commons run on the UI-thread clock since round 3 (catchFrame); only the print hand-off lands here.
    void token;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** The badge kicks, then one beat every 120 ms: NEW, progress, grade and bonus, rewards. */
  const arrive = useCallback(async (next: CatchSummary, data: RedeemPrepItemResponseType['data'], token: number) => {
    const motion = !latest.current.reducedMotion;
    const tier = rarityTier(data.item?.rarity);
    // Via the print the landing sound was scheduled on the JS clock at flight start + 460 ms (closeRide
    // site); a common's fly plays it here. The pad springs in with the kick.
    if (!soundScheduled.current) catchSound('badge');
    soundScheduled.current = false;
    // The banner springs in 120 ms after the kick, so the two never land in one frame.
    if (badgeIn.value < 0.5) badgeIn.value = motion ? withDelay(120, withSpring(1, { damping: 14, stiffness: 320 })) : withTiming(1, { duration: 1 });
    // After a reveal the badge is a soft landing (the reveal's burst was the one climax haptic).
    catchHaptic(revealedRef.current ? 'hitSoft' : tier >= 4 ? 'comboHeavy' : 'success', revealedRef.current ? 2 : 4);
    badgeKick.value = motion ? withSequence(withTiming(1.22, { duration: 100 }), withSpring(1, { damping: 7, stiffness: 300 })) : 1;
    ringPop.value = 0;
    ringPop.value = withTiming(1, { duration: motion ? 520 : 1 });
    const beats: (() => void)[] = [];
    // After the full reveal the badge is only the hand-off: the progress tick and the coins flying home.
    const brief = revealedRef.current;
    const clock = clockRef.current;
    const plan = !brief && clock ? clock.plan : null;
    const barMs = plan ? plan.barMs : 420;
    if (next.isNew && !brief) beats.push(() => { reveal.value = motion ? withSpring(1, { damping: 9, stiffness: 260 }) : 1; });
    beats.push(() => { progress.value = withTiming(next.progressTo, { duration: motion && !skipped.current ? barMs : 1, easing: Easing.out(Easing.cubic) }); });
    if (!brief) beats.push(() => { gradeIn.value = motion ? withSpring(1, { damping: 10, stiffness: 260 }) : 1; });
    if (newRideRef.current) beats.push(() => { rideIn.value = motion ? withSpring(1, { damping: 10, stiffness: 240 }) : 1; });
    if (!data.replayed && !clock?.streamed) beats.push(() => {
      // The header comes back before the coins set off, so the kid sees them land in the counter (it bumps and rolls).
      if (data.rewards.coins > 0 || data.rewards.tickets > 0) showCatchChrome(false);
      layerRef.current?.measureInWindow((x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const startX = x + targetRef.current.x, startY = y + targetRef.current.y;
        const { currencies: list, triggerFly: flyTo } = latest.current;
        if (data.rewards.coins > 0 && list[0]?.icon_url) {
          flyTo({ imageUrl: list[0].icon_url, amount: Math.min(data.rewards.coins, 8), startX, startY, targetPosition: 'coins' });
        }
        if (data.rewards.tickets > 0) {
          flyTo({ imageSource: TICKET_ICON, amount: Math.min(data.rewards.tickets, 6), startX, startY, targetPosition: 'tickets' });
        }
      });
      catchHaptic('tapLight', 1);
    });
    // A common keeps its plan's pace (the repeat cascades twice as fast); the ride reveal keeps 120 ms.
    const step = plan?.repeat ? 60 : 120;
    for (let i = 0; i < beats.length; i++) {
      await pause(step);
      if (aliveRef.current !== token) return;
      setCascade(i + 1);
      beats[i]();
      catchSound('tick', { pitch: 2 + i * 2, volume: 0.7 });
    }
    AccessibilityInfo.announceForAccessibility(`Caught ${next.setName ? `for ${next.setName}` : ''}${next.isNew ? ', new' : ''}`);
    if (plan) {
      // The set bar fills, then ticks: a gold flash along the bar and a small buzz (the close goal, said with no words).
      await pause(barMs);
      if (aliveRef.current !== token) return;
      if (!skipped.current) {
        catchHaptic('tickSelection', 2);
        catchSound('tick', { pitch: 14, volume: 0.6 });
        barGlow.value = motion ? withSequence(withTiming(1, { duration: 90, easing: EASE.out }), withTiming(0, { duration: 420, easing: EASE.in })) : 0;
        badgeKick.value = motion ? withSequence(withTiming(1.1, { duration: 80 }), withSpring(1, SPRING.stamp)) : 1;
      }
      // Then the badge leaves on the plan's clock: settled by 2.6 s, the repeat by about 1.4 s.
      await pauseUntil(plan.exitAt);
    } else {
      await wait(brief ? (newRideRef.current ? 1100 : 650) : 1300);
    }
    if (aliveRef.current !== token) return;
    const exitMs = skipped.current ? 120 : plan ? plan.exitMs : CATCH_TIMING.exit;
    badgeIn.value = withTiming(0, { duration: exitMs, easing: EASE.in });
    await wait(exitMs);
    if (aliveRef.current === token) finish(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The photo sticker's image is native memory; free it once the sticker has re-rendered without it.
  const photoRef = useRef<SkImage | null>(null);
  photoRef.current = photo?.image ?? null;
  const releasePhoto = () => {
    const image = photoRef.current ?? pendingPhoto.current?.image ?? null;
    pendingPhoto.current = null;
    if (image) setTimeout(() => image.dispose(), 500);
  };

  // rideItem clears too: the next find never inherits this one's rarity, speed or hint rules. The finished ride
  // stays (hidden) until the next is prebuilt; that bookkeeping waits two frames, off the done frame.
  const finish = (caught: boolean, keepReveal = false) => {
    catchMark('done');
    latest.current.onCascade?.(false);
    releasePhoto();
    newRideRef.current = false; setNewRide(null); rideIn.value = 0;
    const finished = rideItemRef.current;
    // The done frame commits only what is visible (the catch layer goes); the invisible bookkeeping clears two
    // frames later, unless a new ride was primed in between (RIDE AGAIN, a fast tap).
    const seq = primeSeq.current;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (finished) setReadyItem(finished);
      setStageNonce(n => n + 1);
      if (primeSeq.current !== seq) return;
      setSummary(null); setRide(null); setPrimed(null); setRideItem(null); setPhoto(null); setCascade(0);
    }));
    setShowing(null);
    setBadgeOn(false);
    reveal.value = 0; gradeIn.value = 0;
    // The (already invisible) reveal clears two frames later, off the done frame; its photo is released after.
    revealedRef.current = false; revealCovered.value = false; revealHand.current = null; escapeHand.current = null;
    if (!keepReveal) requestAnimationFrame(() => requestAnimationFrame(() => { setReveal(null); setRevealEscape(null); revealHidden.value = false; }));
    // RIDE AGAIN: the app chrome and the map stay hidden under the covering card (the next ride opens there).
    if (!keepReveal) { showCatchChrome(false); setCatchOpen(false); }
    dimCatchChrome(false, latest.current.reducedMotion);
    catchKickX.value = 0; catchKickY.value = 0;
    catchPinPose.value = { x: 0, y: 0, rot: 0 };
    clockRef.current = null; skipped.current = false; skipWake.current = null;
    barGlow.value = 0;
    // A common's clock keeps running a moment longer for the counter's roll; only its badge mode ends here.
    clockOn.value = 0; skipSV.value = 0;
    runRef.current = null; startRef.current = null;
    // A caught pin stays hidden until the map's list drops it; a missed one comes straight back.
    if (caught) setTimeout(() => { if (!runRef.current) catchHidePivot.value = -1; }, 700); else catchHidePivot.value = -1;
    latest.current.onDone(caught);
  };

  // ── The common catch's clock (UI thread) ──────────────────────────────
  /**
   * Wave 5 round 2: the clock's tail runs at two speeds in one timing: plan pace to the end of the burst's hold, then a
   * little faster (tailShape: `a` is the share of the time, `b` the share of the clock, of the first part). One timing,
   * so no frame is lost at a hand-over between two.
   */
  const twoSpeed = (u: number): number => {
    'worklet';
    const s = tailShape.value;
    if (u <= s.a) return s.a > 0 ? (u / s.a) * s.b : s.b;
    return s.b + ((u - s.a) / Math.max(1e-6, 1 - s.a)) * (1 - s.b);
  };
  /**
   * The server has answered: run the clock from the held frame to its end. Wave 5 round 2: any time the catch fell
   * behind its plan (the server's wait at the held frame, a busy frame at a hand-over) is won back after the burst's
   * hold (the flight, the badge, the exit play at most 20 percent faster), so the moment ends on its planned time
   * from the tap. The wind-up and the burst itself keep their planned pace.
   */
  const continueRun = () => {
    'worklet';
    if (continued.value) return;
    continued.value = 1;
    waiting.value = 0;
    cancelAnimation(holdWobble);
    holdWobble.value = withTiming(0, { duration: 40 });
    const from = cc.value;
    const end = endAt.value;
    const p = planSV.value;
    // How far behind the plan the clock is: the wall time past the moment it was due at its held frame.
    const behind = heldGoal.value > 0 ? Math.max(0, Date.now() - heldGoal.value) : 0;
    heldAt.value = 0; heldGoal.value = 0;
    const mid = Math.min(end, Math.max(from, p.suckAt));
    const tail = p.doneAt - mid;
    const k = behind > 0 && tail > 0 ? Math.max(0.8, (tail - behind) / tail) : 1;
    const d1 = Math.max(0, mid - from);
    const d2 = Math.max(0, (end - mid) * k);
    const total = Math.max(1, d1 + d2);
    tailShape.value = { a: d1 / total, b: end - from > 0 ? (mid - from) / (end - from) : 1 };
    cancelAnimation(cc);
    cc.value = withTiming(end, { duration: total, easing: twoSpeed });
  };
  /**
   * Tap to the held frame (squash, wobbles, gather); a slow server holds a small wobble there, never a freeze.
   * Wave 5 round 2: the clock starts on the tap (the effect's own frame), not once the layer's copy has drawn, and
   * aims the held frame at its planned wall time from the tap (a late start plays the wind-up up to a third faster).
   * Until the copy draws, the pin itself follows the clock.
   */
  const startClock = (hitStopAt: number, reducedRun: boolean, tapAt: number) => {
    'worklet';
    continued.value = 0; waiting.value = 0; skipSV.value = 0; heldAt.value = 0;
    cancelAnimation(cc);
    const now = Date.now();
    const elapsed = Math.max(0, now - tapAt);
    // The first frames since the tap are already gone (start there, never behind), and the held frame is due on time.
    const e = Math.min(48, elapsed);
    const duration = Math.max(1, hitStopAt * 0.75, hitStopAt - elapsed);
    heldGoal.value = now + duration;
    cc.value = e;
    cc.value = withTiming(hitStopAt, { duration, easing: Easing.linear }, done => {
      if (!done) return;
      if (resolved.value === 1) { continueRun(); return; }
      if (resolved.value === 0) {
        waiting.value = 1;
        heldAt.value = Date.now();
        if (!reducedRun) holdWobble.value = withRepeat(withSequence(withTiming(5, { duration: 90 }), withTiming(-5, { duration: 90 })), -1, true);
      }
    });
  };
  /** The layer's copy has drawn: the pin hides and the copy carries on from the same pose on this frame. */
  const showCopy = (pivot: number) => {
    'worklet';
    catchHidePivot.value = pivot;
    copyOn.value = 1;
    catchPinPose.value = { x: 0, y: 0, rot: 0 };
  };
  const markCaught = () => {
    'worklet';
    resolved.value = 1;
    if (waiting.value) continueRun();
  };
  const markMiss = () => {
    'worklet';
    resolved.value = -1;
    cancelAnimation(holdWobble);
    holdWobble.value = 0;
  };
  const onSkipAccepted = () => {
    if (!runRef.current || skipped.current) return;
    skipped.current = true;
    catchMark('skip');
  };
  /**
   * Tap after the burst (round 5): cut straight to the coin stream. The burst is gone on the next frame (the clock
   * jumps to the middle of its suck-back), then the rest plays in 380 ms, so the kid still sees the coins pour
   * into the counter and the find drop into its badge, just fast.
   */
  const skipToEnd = () => {
    'worklet';
    if (!continued.value || cc.value < planSV.value.burstAt || skipSV.value) return;
    skipSV.value = 1;
    runOnJS(onSkipAccepted)();
    const p = planSV.value;
    const cut = Math.max(cc.value, p.suckAt + p.suckMs * 0.6);
    cancelAnimation(cc);
    cc.value = cut;
    cc.value = withTiming(endAt.value, { duration: 380, easing: Easing.inOut(Easing.quad) });
  };

  /** Sound, haptics and marks on the clock's beats (runOnJS from the UI thread; nothing visual waits on them). */
  const onBeat = useCallback((kind: number, arg: number) => {
    const run = runRef.current;
    if (!run) return;
    const quiet = skipped.current;
    switch (kind) {
      case BEAT.haptic: if (!quiet) catchHaptic(BEAT_HAPTICS[arg] ?? 'tickSelection', 2); break;
      case BEAT.hitstop: catchMark('hitstop'); break;
      case BEAT.beam: catchMark('beam'); catchHaptic('comboHeavy', 3); catchSound('chime', { volume: 0.7, pitch: 6 }); break;
      case BEAT.exit:
        // The controls start coming back as the badge leaves (staggered, the HUD's close goal first).
        dimCatchChrome(false, latest.current.reducedMotion);
        break;
      case BEAT.burst:
        run.burst = true;
        catchMark('burst');
        // The beam's impact already gave the heavy buzz; the grand catch adds a second heavy hit and a higher chime.
        if (!run.beam) catchHaptic('comboHeavy', 3);
        // Wave 5 round 2: every milestone adds a second heavy hit (the 10th), the grand one a third.
        if (run.beam) setTimeout(() => { if (runRef.current === run) catchHaptic('comboHeavy', 3); }, 120);
        if (run.grand) setTimeout(() => { if (runRef.current === run) catchHaptic('comboHeavy', 3); }, 260);
        catchSound('chime', run.grand ? { volume: 0.9, pitch: 4 } : { volume: 0.8 });
        break;
      case BEAT.success: if (!quiet) catchHaptic('success', 3); break;
      case BEAT.tickets: {
        const off = offsetRef.current;
        latest.current.triggerFly({ imageSource: TICKET_ICON, amount: arg, startX: stageX.value + off.x, startY: stageY.value + off.y, targetPosition: 'tickets' });
        break;
      }
      case BEAT.badge: catchMark('badge'); break;
      case BEAT.fly: catchMark('fly'); if (!quiet && !run.data?.replayed) catchSound('whoosh', { volume: 0.6 }); break;
      case BEAT.land:
        catchMark('land');
        catchSound('badge');
        if (!quiet) catchHaptic('tapLight', 2);
        if (run.next) AccessibilityInfo.announceForAccessibility(`Caught ${run.next.setName ? `for ${run.next.setName}` : ''}${run.next.isNew ? ', new' : ''}`);
        break;
      case BEAT.coin:
        if (arg === 0) catchMark('coins-land');
        if (!quiet && arg % 3 === 2) catchHaptic('tickSelection', 1);
        if (!quiet && arg % 2 === 0) catchSound('tick', { pitch: 2 + arg, volume: 0.45 });
        break;
      case BEAT.tick: if (!quiet) { catchHaptic('tickSelection', 2); catchSound('tick', { pitch: 14, volume: 0.6 }); } break;
      case BEAT.done: {
        const data = run.data;
        if (data) {
          if (data.hunt_week?.rank_line) setHomeHuntRankLine(data.hunt_week.rank_line);
          latest.current.onCollected(data);
          if (refreshAfterCatch) latest.current.refreshPlayer().catch(() => undefined);
        }
        finish(true);
        break;
      }
      default: break;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useAnimatedReaction(() => cc.value, (t, prev) => {
    if (!clockOn.value) return;
    const last = prev == null || t < prev ? -1 : prev;
    const list = beats.value;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.at > last && b.at <= t) runOnJS(onBeat)(b.kind, b.arg);
    }
  });

  /**
   * Tap anywhere after the burst: the catch jumps to its end (the find home, the badge away). Round 5: the UI
   * thread decides (its clock is past the burst), so a busy JS thread that has not heard about the burst yet
   * never swallows the tap; the haptics go quiet only once the skip is really taken.
   */
  const onSkip = useCallback(() => {
    if (!runRef.current || skipped.current) return;
    runOnUI(skipToEnd)();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * Wave 4: the skip tap is a gesture-handler worklet, so the UI thread takes it on touch-down (a starved JS
   * thread can never delay it). skipToEnd itself refuses a tap before the burst or once a skip is taken.
   */
  const skipTap = useMemo(() => Gesture.Tap().maxDuration(10_000).onBegin(() => {
    'worklet';
    if (clockOn.value) skipToEnd();
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!request || layer.width === 0) return;
    const token = ++aliveRef.current;
    primeSeq.current += 1;
    const alive = () => aliveRef.current === token;
    const { item, pivotId } = request;
    const motion = !latest.current.reducedMotion;
    [badgeIn, reveal, progress, gradeIn, barGlow].forEach(value => { cancelAnimation(value); value.value = 0; });
    badgeKick.value = 1;
    setSummary(null); setPhoto(null); setCascade(0); setBonusXp(null); setCoinStamp(null); setNextArt(null);
    isNewSV.value = 0;
    setShowing(request);
    const start = fromPoint(request);
    flyFromX.value = start.x;
    flyFromY.value = start.y;

    // Uncommon and rarer: the Ride Photo viewfinder (usually already opening from the tap). It owns the
    // whole screen, so the header and tab bar slide away for it.
    if (catchStyleFor(item.rarity) === 'ride_photo') {
      showCatchChrome(true);
      itemGone.value = 1;
      clockOn.value = 0;
      redeemRun.current = null;
      setRideItem(item);
      setRide({ key: token, closing: false, hint: rideHintSeen !== true, flyTo: null });
      if (!primed) showBackdrop(true);
      return;
    }
    itemGone.value = 0;
    // The set page loads while the find wobbles (the badge's next-goal silhouette); never waited on.
    const slug = item.set_slug;
    if (slug && commonSet.current?.slug !== slug) {
      commonSet.current = { slug, items: null };
      void (loadSetPage ?? defaultLoadSetPage)(slug).then(items => {
        if (commonSet.current?.slug === slug) commonSet.current = { slug, items: items ?? null };
      }).catch(() => undefined);
    }
    // A common never moves the header or the tab bar (the counter stays put for its coins): the tab bar
    // softens and the map's own controls fade, on the UI thread from this frame.
    dimCatchChrome(true);
    setCatchOpen(true);
    // The map's markers under the badge drop their tags now, on the tap's own commit, so no parent re-render ever
    // lands inside the burst (wave 5 round 2; it used to ride the server's answer).
    latest.current.onCascade?.(true);

    // The catch, four beats on one UI-thread clock (src/ui/motion.ts, mapWow catchPlan and catchFrame): a
    // squish under the finger, wobble wobble wobble while it rises and glides to its stage and the gold
    // gathers, one held frame with a soft flash, a gold burst where the find pops to its hero size and
    // throws its coins into the counter, then the badge rises, the find flies into its slot, the bar ticks.
    // Round 4: this catch's burst (milestones only, never chance: every 5th stars, every 10th the beam, the 25th grand).
    const variant = burstVariant(sessionCatches + 1);
    const calmPower = power.level === 'calm';
    // Round 5: a milestone (the 10th and every 25th) plays the full first-catch show (the long hold, the beam), so the
    // rare big moment is the bright one; ordinary repeats stay snappy.
    const plan = catchPlan({ reduced: !motion, repeat: sessionCatches > 0 && !variant.milestone, milestone: variant.milestone && motion, calm: calmPower,
      treat: variant.treat });
    // The beam and the grand show are known from the tap (the beam drops 300 ms before the held frame, often
    // before the server answers), so they are set here, before the clock starts, and kept as JS flags.
    const beam = motion && variant.beam;
    const grand = motion && variant.grand;
    setGrandCatch(grand);
    const off = offsetRef.current;
    // The stage keeps the whole inked burst on screen: below the header, above the tab bar, 12 pt from the
    // edges. A find already well placed just rises (the badge rises later, after the ink has faded).
    const area = { width: layer.width, top: insets.top + 40 - off.y, bottom: window.height - insets.bottom - 96 - off.y };
    const stage = motion ? catchStage(start, plan.risePt, area, INK_REACH) : start;
    stageX.value = stage.x; stageY.value = stage.y;
    // The map kicks away from the find, toward the far side of the screen (down when the find is centred).
    const dx = layer.width / 2 - stage.x, dy = layer.height / 2 - stage.y;
    const dl = Math.hypot(dx, dy);
    kickDirX.value = dl > 24 ? dx / dl : 0; kickDirY.value = dl > 24 ? dy / dl : 1;
    targetX.value = targetRef.current.x; targetY.value = targetRef.current.y;
    planSV.value = plan;
    peakFlash.value = flashPeak(isDimFlashingLightsEnabled(), !motion);
    endAt.value = plan.doneAt;
    miss.value = 0; coinN.value = 0; resolved.value = 0;
    beamOn.value = beam ? 1 : 0; grandSV.value = grand ? 1 : 0;
    inkTurn.value = ((sessionCatches + 1) * 47) % 360;
    inkScale.value = variant.inkScale; ringN.value = variant.rings; starN.value = variant.stars;
    fanSV.value = motion && variant.fan ? 1 : 0; ring2SV.value = motion && variant.counterRing ? 1 : 0; homeSV.value = 0;
    whereSV.value = { on: 0, at: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
    const ladder: Beat[] = catchHaptics(plan).filter(h => h.at > 0 && h.at < plan.hitStopAt)
      .map(h => ({ at: h.at, kind: BEAT.haptic, arg: BEAT_HAPTICS.indexOf(h.intent) }));
    beats.value = ladder;
    skipped.current = false;
    runRef.current = { token, item, data: null, next: null, burst: false, beam, grand };
    clockOn.value = 1;
    // A new balance that arrives before the coins waits for them (the stream below takes over the counter).
    holdHud('coins', 3000);
    catchMark(plan.repeat ? 'tap-repeat' : 'tap');
    catchHaptic('tapLight', 3);
    catchSound('pop');
    // Wave 5 round 2: the clock starts on the tap, so every beat lands on its planned time (it used to wait for the
    // layer's copy of the find to draw, about 200 ms on a busy phone, and the whole catch ran that late). The copy
    // takes over from the pin once it has drawn (expo-image decodes a fresh mount off the UI thread); until then the
    // pin itself follows the clock (catchPinPose), so there is never a hole. At most 280 ms either way.
    const t0 = Date.now();
    runOnUI(startClock)(plan.hitStopAt, !motion, t0);
    startRef.current = () => { startRef.current = null; runOnUI(showCopy)(pivotId); };
    const startTimer = setTimeout(() => startRef.current?.(), 280);
    const run = catchFind(latest.current.redeem, item.id, pivotId, latest.current.getFix(), { catch_style: 'chomp' });

    void (async () => {
      const settled = await run;
      clearTimeout(startTimer);
      startRef.current?.();
      if (!alive()) return;
      if (settled.kind !== 'caught') {
        // A funny miss, never a sad one: the find boings out of the grab and hops back to its spot.
        runOnUI(markMiss)();
        beamOn.value = 0; grandSV.value = 0;
        catchMark('miss');
        await wait(Math.max(0, plan.hitStopAt - (Date.now() - t0)));
        if (!alive()) return;
        catchHaptic('hitSoft', 3);
        miss.value = motion ? withTiming(1, { duration: 420, easing: EASE.out }) : 1;
        await wait(300);
        if (!alive()) return;
        itemGone.value = withTiming(1, { duration: 160 });
        if (settled.kind === 'gone') latest.current.onUnavailable();
        latest.current.onFailed(settled.line, settled.kind === 'failed');
        await wait(170);
        if (alive()) finish(false);
        return;
      }
      const data = settled.data;
      const next = catchSummary(item, data);
      sessionCatches += 1;
      const current = runRef.current;
      if (!current || current.token !== token) return;
      current.data = data; current.next = next;
      catchMark('answer');
      setSummary(next);
      setBadgeOn(true);
      barFrom.value = next.progressFrom; barTo.value = next.progressTo;
      // The burst variant (beam, grand, ink size and turn) was set on the tap, from the same catch number.
      isNewSV.value = next.isNew ? 1 : 0;
      setCoinStamp(!next.isNew && !data.replayed && data.rewards.coins > 0 ? data.rewards.coins : null);
      // The next goal (same commit as the summary, while the badge is still hidden): the set's next missing find.
      const cs = commonSet.current;
      const page = cs && cs.slug === item.set_slug ? cs.items : null;
      const upNext = nextMissing(page, item.id, next.complete);
      // Wave 5 round 2: when nothing else is in catch range, the next goal is the nearest find on the map (its own art),
      // and on this catch the disc flies onto that find's spot or edge arrow: where to walk, with no words.
      const where = motion ? latest.current.whereNext?.(pivotId) ?? null : null;
      setNextArt(where ? findImageSource(where.item)
        : upNext ? findImageSource({ icon_url: upNext.icon_url, variant_slug: upNext.variant_slug, name: upNext.name }) : null);
      const flightAt = where ? whereFlightAt(plan) : -1;
      if (where) whereSV.value = { on: 1, at: flightAt, x0: nextDiscRef.current.x, y0: nextDiscRef.current.y, x1: where.x, y1: where.y };
      const list: Beat[] = [...ladder,
        { at: plan.hitStopAt + 1, kind: BEAT.hitstop, arg: 0 },
        { at: plan.burstAt, kind: BEAT.burst, arg: 0 }, { at: plan.burstAt + 180, kind: BEAT.success, arg: 0 },
        { at: plan.badgeAt + 1, kind: BEAT.badge, arg: 0 }, { at: plan.flyAt, kind: BEAT.fly, arg: 0 },
        { at: plan.landAt, kind: BEAT.land, arg: 0 }, { at: plan.exitAt, kind: BEAT.exit, arg: 0 },
        { at: plan.doneAt, kind: BEAT.done, arg: 0 }];
      // The bar's gold tick only when a NEW find really moved it (honest progress).
      if (next.isNew) list.push({ at: plan.tickAt, kind: BEAT.tick, arg: 0 });
      // The beam lands on the held frame: its impact is the heavy buzz (then the burst's success, the golden pair).
      if (current.beam) list.push({ at: plan.hitStopAt, kind: BEAT.beam, arg: 0 });
      if (!data.replayed && data.rewards.tickets > 0) list.push({ at: plan.burstAt + 1, kind: BEAT.tickets, arg: Math.min(data.rewards.tickets, 6) });
      let end = plan.doneAt;
      const coins = data.replayed ? 0 : data.rewards.coins;
      if (coins > 0) {
        // The coins: one per coin won (at most 8, thinner on Battery Saver), sprayed out of the find on the
        // burst frame, each landing punching the counter, whose digits roll from the first landing, all on
        // this clock (hudPulse.streamHud), so the roll starts on the exact frame the first coin arrives.
        const stream = coinStreamPlan(coins, !motion, Math.max(3, momentParticles(COIN_STREAM.max, power, !motion)));
        const chip = latest.current.getTarget('coins');
        const lands = stream.landAt.map(ms => plan.coinsAt + ms);
        // The 5th-catch treat: its stars lead the coins into the counter.
        if (chip && motion && variant.homeStars) { starTo.value = { x: chip.x - off.x - stage.x, y: chip.y - off.y - stage.y }; homeSV.value = 1; }
        if (stream.count > 0 && chip) {
          coinGeo.value = { fx: stage.x, fy: stage.y, tx: chip.x - off.x, ty: chip.y - off.y };
          coinN.value = stream.count;
          lands.forEach((at, i) => list.push({ at, kind: BEAT.coin, arg: i }));
          streamHud('coins', { id: streamIdRef.current, gain: coins, lands });
          end = Math.max(end, lands[lands.length - 1] + COUNT.ms + 400);
        } else {
          // No counter on screen, or Reduce Motion: the counter simply rolls once, a beat after the burst.
          setTimeout(() => pulseHud('coins', coins), Math.max(0, plan.burstAt - (Date.now() - t0)) + (motion ? 300 : DURATION.quick));
        }
      }
      // The where-next flight lands and lingers on the clock, which runs on past done for it (the map is free by then).
      if (flightAt >= 0) end = Math.max(end, flightAt + WHERE.totalMs);
      list.sort((a, b) => a.at - b.at);
      beats.value = list;
      endAt.value = end;
      if (plan.reduced) {
        // Reduce Motion keeps the feel: the burst's haptics play now (the clock has no wobble to wait for).
        catchMark('burst'); current.burst = true;
        catchHaptic('comboHeavy', 3);
        setTimeout(() => { if (alive()) catchHaptic('success', 3); }, 180);
      }
      // Wave 5 round 2: the clock never waits for this answer's React commit (wave 4 did, and every tier ran about
      // 190 ms late). The commit is small (the badge's words and the next goal; the parent's cascade went out on the
      // tap) and lands in the wind-up or the held frame, and the burst draws on the UI thread in one Skia canvas.
      runOnUI(markCaught)();
    })();
  // A new request (or a retry of the same find) starts a fresh moment.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.pivotId, request?.attempt, layer.width > 0]);

  // ── Ride Photo hand-offs ───────────────────────────────────────────────
  const onRideCaught = useCallback((details: RedeemCatchDetails, _grade: PhotoGrade) => {
    const req = request;
    if (!req) return;
    // The first-time hint is done only once the kid has a Good or better photo.
    if (rideHintSeen !== true) { rideHintSeen = true; void AsyncStorage.setItem(RIDE_HINT_KEY, '1').catch(() => undefined); }
    rideKindRef.current = (details.ride_type as RideKind | undefined) ?? null;
    // The server call runs while the photo develops, so the wait hides inside the suspense beats.
    redeemRun.current = catchFind(latest.current.redeem, req.item.id, req.pivotId, latest.current.getFix(), details);
  }, [request]);

  const closeRide = (caught: boolean) => {
    setRide(current => (current ? { ...current, closing: true } : current));
    showBackdrop(false);
    // The header, tab bar and map chrome come back only once the iris has closed (onIrisClosed).
    // Only the ride that is closing goes; a ride opened since (RIDE AGAIN) stays.
    if (!caught) setTimeout(() => setRide(current => (current?.closing ? null : current)), 420);
  };

  // "Rides snapped": a ride the player never snapped before gets a "New ride!" beat in the cascade.
  const rideKindRef = useRef<RideKind | null>(null);
  const [newRide, setNewRide] = useState<{ name: string; line: string; stamps: ReturnType<typeof rideStamps> } | null>(null);
  const newRideRef = useRef(false);
  useEffect(() => { void loadRideMemory(); }, []);

  const soundScheduled = useRef(false);
  const pendingPhoto = useRef<{ image: SkImage | null; grade: PhotoGrade } | null>(null);
  const pendingLand = useRef<{ data: RedeemPrepItemResponseType['data']; token: number; item: PrepItemType } | null>(null);
  const onPrintReady = useCallback(async (grade: PhotoGrade, image: SkImage | null, photobombed = false) => {
    const req = request;
    const token = aliveRef.current;
    if (!req || !redeemRun.current) return;
    const kind = rideKindRef.current;
    // v2: the catch reveal starts now, while the server decides: the print shivers until the answer lands
    // (a Legendary's roll is real, so a ride-by shakes free instead of popping).
    const reveal = grade !== 'blurry';
    if (reveal) {
      revealedRef.current = true;
      setRevealOutcome('pending');
      setReveal(revealData(req.item, null, grade, image, kind, token, photobombed));
    }
    const result = await redeemRun.current;
    if (aliveRef.current !== token) return;
    if (result.kind !== 'caught') {
      // With a reveal the escape owns the feedback (no outcome buzz while the roll still plays).
      if (!reveal) catchHaptic('failBuzz', 3);
      const fail = (choice: 'map' | 'again' = 'map') => {
        closeRide(false);
        if (result.kind === 'gone') latest.current.onUnavailable();
        // The server's ride count for this find carries into its next open (ride icons, the mercy ride).
        const left = result.kind === 'failed' ? result.ridesLeft : null;
        if (left != null) ridesUsedFor.current.set(req.item.id, Math.max(0, 3 - left));
        if (choice === 'again') {
          // The escape card stays up, covering, while the old viewfinder resets underneath (RidePhotoCatch
          // frees its open 1000 ms after a close); the next ride opens under the card, then the card fades.
          rideAgainPending.current = true;
          setTimeout(() => { if (aliveRef.current === token) finish(false, true); }, 200);
          // Backed out meanwhile (the token moved on): the ride stays closed.
          setTimeout(() => { rideAgainPending.current = false; revealHidden.value = false; if (aliveRef.current === token) latest.current.onRideAgain?.(req.item, req.pivotId); }, RIDE_AGAIN_MS);
          setTimeout(() => { setReveal(current => (current?.key === token ? null : current)); setRevealEscape(null); }, RIDE_AGAIN_MS + 160); // gone before the first pass (its clack)
          // If the next ride did not open (the parent declined), bring the map back rather than strand the kid.
          setTimeout(() => { if (!busyRef.current) { showCatchChrome(false); setCatchOpen(false); } }, RIDE_AGAIN_MS + 600);
        } else {
          // A ride-by the reveal already showed (rides left, the map choice) needs no red line on the map.
          const shown = reveal && result.kind === 'failed' && result.ridesLeft != null;
          if (!shown) latest.current.onFailed(result.line, result.kind === 'failed');
          setTimeout(() => { if (aliveRef.current === token) finish(false); }, 320);
        }
      };
      if (reveal) {
        escapeHand.current = fail;
        setRevealEscape({ ridesLeft: result.kind === 'failed' ? result.ridesLeft ?? null : 0,
          canRetry: result.kind === 'failed' && !!latest.current.onRideAgain, vehicle: kind });
        setRevealOutcome('escaped');
      } else fail();
      return;
    }
    // One hand-off: the viewfinder irises out behind the print, which flies into the badge on the map.
    const served = (result.data.dex as { rides_snapped?: string[] } | null | undefined)?.rides_snapped ?? null;
    const fresh = kind ? recordRide(kind, served) : false;
    newRideRef.current = fresh;
    setNewRide(fresh && kind ? { name: RIDES[kind].name, line: ridesSnappedLine(ridesSnapped()), stamps: rideStamps(ridesSnapped(), kind) } : null);
    // The sticker keeps the item art until the print lands: the photo is never on screen twice.
    pendingPhoto.current = { image, grade };
    pendingLand.current = { data: result.data, token, item: req.item };
    const handOff = async () => {
      if (aliveRef.current !== token) return;
      // After a reveal: its fade (UI thread) runs first; then the close and the flight start in one commit.
      if (revealedRef.current) await wait(REVEAL_FADE_MS);
      if (aliveRef.current !== token) return;
      closeRide(true);
      soundScheduled.current = true; // the landing thunk runs on the flight's JS clock
      setRide(current => (current ? { ...current, flyTo: { x: target.x + offset.x, y: target.y + offset.y } } : current));
      await land(req.item, result.data, token, true);
    };
    if (!reveal) { await handOff(); return; }
    revealHand.current = handOff;
    setReveal(revealData(req.item, result.data, grade, image, kind, token, photobombed));
    setRevealOutcome('caught');
  }, [request, land, target.x, target.y, offset.x, offset.y]); // eslint-disable-line react-hooks/exhaustive-deps

  const revealHand = useRef<(() => Promise<void>) | null>(null);
  const escapeHand = useRef<((choice: 'map' | 'again') => void) | null>(null);
  const ridesUsedFor = useRef(new Map<number, number>());
  // CONTINUE: the reveal fades itself on the UI thread; the hand-off runs on the next frame. The reveal's
  // data stays until the moment ends (finish), so nothing blanks while it fades.
  const onRevealContinue = useCallback(() => {
    cancelShareEncode();
    const hand = revealHand.current;
    revealHand.current = null;
    if (hand) void hand();
  }, []);
  const onRevealEscaped = useCallback((choice: 'map' | 'again') => {
    cancelShareEncode();
    const fail = escapeHand.current;
    escapeHand.current = null;
    fail?.(choice);
  }, []);
  // The print's JPEG for SHARE: encoded once the buttons have settled (never during a beat, never on the tap),
  // cancelled on CONTINUE or an escape, and skipped on a repeat that continues on its own (encoded on the tap).
  const shareUri = useRef<{ key: number; uri: string | undefined } | null>(null);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelShareEncode = () => { if (shareTimer.current) clearTimeout(shareTimer.current); shareTimer.current = null; };
  const onRevealActions = useCallback((compact: boolean) => {
    cancelShareEncode();
    const current = revealRef.current;
    if (!current || compact || shareUri.current?.key === current.key) return;
    const key = current.key, photo = current.photo;
    shareTimer.current = setTimeout(() => {
      shareTimer.current = null;
      if (revealRef.current?.key === key && revealHand.current) shareUri.current = { key, uri: encodePrint(photo) };
    }, 700);
  }, []);
  useEffect(() => cancelShareEncode, []);
  const revealRef = useRef(shownReveal);
  revealRef.current = shownReveal;
  const onRevealShare = useCallback(() => {
    const current = revealRef.current;
    if (!current) return;
    let photoUri = shareUri.current?.key === current.key ? shareUri.current.uri : undefined;
    if (!photoUri) photoUri = encodePrint(current.photo);
    const art = current.art && typeof current.art === 'object' && 'uri' in current.art && typeof current.art.uri === 'string' ? current.art.uri
      : typeof current.art === 'number' ? current.art : null;
    catchMark('reveal-share');
    shareFlex('ride_photo', { itemName: current.name, artUrl: art ?? (photoUri ?? ''), rarity: current.rarity as 2, grade: current.grade,
      goldenHour: current.golden, photoUri }, { surface: 'ride_photo_reveal' });
  }, []);

  // The set's book page (every item's art), read while the ride runs so the reveal can show it.
  const setPage = useRef<{ slug: string; items: readonly BookItem[] } | null>(null);
  useEffect(() => {
    // Read fresh on every ride (one light GET while the ride plays), so the page is current up to this catch.
    const slug = rideItem?.set_slug;
    if (!slug) return;
    let live = true;
    void (loadSetPage ?? defaultLoadSetPage)(slug).then(items => {
      if (!live || !items) return;
      setPage.current = { slug, items };
      const urls = items.map(entry => entry.icon_url).filter((url): url is string => typeof url === 'string' && /^https?:/i.test(url));
      if (urls.length) void Image.prefetch(urls).catch(() => undefined);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [rideItem?.set_slug, rideItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Everything the reveal shows. Before the answer: the find's own facts, zero rewards; after: the server's. */
  const revealData = (item: PrepItemType, data: RedeemPrepItemResponseType['data'] | null, grade: PhotoGrade, image: SkImage | null,
    kind: RideKind | null, key: number, photobombed = false): CatchRevealData => {
    const sum = catchSummary(item, data);
    const rarity = data?.item?.rarity ?? item.rarity;
    const tier = Math.max(2, Math.min(5, rarityTier(rarity))) as 2 | 3 | 4 | 5;
    const bonus = typeof data?.photo?.bonus_xp === 'number' ? Math.max(0, data.photo.bonus_xp) : 0;
    const paid = !!data && !data.replayed;
    const page = setPage.current && setPage.current.slug === item.set_slug ? setPage.current.items : null;
    const newBest = isNewBest(sum.isNew, data?.photo);
    const slots = page ? bookSlots(page, item.id, sum.isNew, sum.collected, sum.total, { grade: data ? grade : null, newBest }) : null;
    return {
      key, name: findDisplayName(item.name, item.set_name), art: findImageSource(item), rarity, tier,
      grade: grade === 'blurry' ? 'good' : grade, golden: data?.photo?.golden_hour === true || item.golden_hour === true,
      isNew: sum.isNew, newBest, photobombed, prevGrade: data?.photo?.previous_best ?? null,
      rewards: { experience: paid ? data!.rewards.experience : 0, coins: paid ? data!.rewards.coins : 0,
        energy: paid ? data!.rewards.energy : 0, tickets: paid ? data!.rewards.tickets : 0, bonusXp: paid ? bonus : 0 },
      setName: sum.setName, setColor: sum.setColor, collected: sum.collected, total: sum.total,
      caughtCount: typeof data?.item?.caught_count === 'number' ? data.item.caught_count : null,
      slots, photo: image, rideName: kind ? RIDES[kind].name : 'Ride',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  };

  const onPrintLanded = useCallback(() => {
    const pending = pendingLand.current;
    if (!pending || aliveRef.current !== pending.token) return;
    pendingLand.current = null;
    if (pendingPhoto.current) { setPhoto(pendingPhoto.current); pendingPhoto.current = null; }
    void arrive(catchSummary(pending.item, pending.data), pending.data, pending.token);
  }, [arrive]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRodeOff = useCallback(() => {
    const token = aliveRef.current;
    catchHaptic('warning', 3);
    closeRide(false);
    // The server records the ride-off (gone today, back as a daily rare); the find stops being tappable now.
    const pivotId = latest.current.request?.pivotId;
    if (pivotId != null) {
      void reportRideOff(pivotId);
      latest.current.onRodeOff?.(pivotId);
    }
    latest.current.onFailed('It rode off. Might be back tomorrow.', false);
    setTimeout(() => { if (aliveRef.current === token) finish(false); }, 320);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The viewfinder covers the map: the React-level catch state (map chrome, ambient pause) commits unseen.
  const onCovered = useCallback(() => setCatchOpen(true), []);
  // While RIDE AGAIN is pending, the closing viewfinder must not bring the chrome back over the covering card.
  const rideAgainPending = useRef(false);
  const onChromeBack = useCallback(() => { if (!rideAgainPending.current) showCatchChrome(false); }, []);
  const onIrisClosed = useCallback(() => { showCatchChrome(false); setCatchOpen(false); }, []);
  const onIrisClosedGuarded = useCallback(() => { if (!rideAgainPending.current) onIrisClosed(); }, [onIrisClosed]);

  const onClose = useCallback(() => {
    const token = ++aliveRef.current;
    closeRide(false);
    setTimeout(() => { if (aliveRef.current === token) finish(false); }, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Styles ─────────────────────────────────────────────────────────────
  // A common's art is drawn on the same commit the map hides its marker (the request), never a frame later:
  // otherwise the find vanishes for the first beats of the wobble on a busy phone.
  const chompRequest = request && catchStyleFor(request.item.rarity) !== 'ride_photo' ? request : null;
  // The rays reach about 80 percent of the screen width (a burst you can screenshot, not a lens glow).
  const goldSize = Math.round(Math.min(window.width, 440) * 0.8);
  // Every common-catch view is a worklet of the one clock (frame = catchFrame(clock, plan)).
  const itemStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    if (!onUi()) return HIDDEN;
    const f = frame.value;
    const m = miss.value;
    const p = planSV.value;
    // Rise and glide from the pin's spot to the stage, then the arc home to the badge's sticker slot.
    const g = f.glide * (1 - m);
    const sx = flyFromX.value + (stageX.value - flyFromX.value) * g;
    const sy = flyFromY.value + (stageY.value - flyFromY.value) * g;
    const at = f.fly > 0 ? arcPoint({ x: sx, y: sy }, { x: targetX.value, y: targetY.value }, p.arcPt, f.fly) : { x: sx, y: sy };
    const press = 1 - 0.14 * f.squash;
    // A miss boings out of the grab and hops back (funny, never sad).
    const boing = m > 0 ? -14 * Math.sin(m * Math.PI) * (1 - m) : 0;
    return {
      opacity: copyOn.value * (1 - Math.max(f.gone, itemGone.value)),
      transform: [{ translateX: at.x - FIND_ART_SIZE / 2 }, { translateY: at.y - FIND_ART_SIZE / 2 },
        { rotate: `${f.wobble + holdWobble.value + boing + f.fly * 360}deg` },
        { scale: press * (m > 0 ? 1 + (f.scale - 1) * (1 - m) : f.scale) },
        // A coin-like edge turn while it flies (never thinner than a third, so it reads as the same find).
        { scaleX: f.fly > 0 && f.fly < 1 ? Math.max(0.35, Math.abs(Math.cos(f.fly * Math.PI * 1.5))) : 1 }],
    };
  });
  // The gather: a gold halo builds under the find while it rises (a floor once the catch starts, so it never blinks).
  const haloStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    if (!onUi()) return HIDDEN;
    const f = frame.value;
    const m = miss.value;
    const g = f.glide * (1 - m);
    const sx = flyFromX.value + (stageX.value - flyFromX.value) * g;
    const sy = flyFromY.value + (stageY.value - flyFromY.value) * g;
    const on = clockOn.value * copyOn.value * (1 - m);
    const strength = Math.max(0.4 * on, Math.min(1, 0.55 + 0.45 * f.charge) * Math.max(f.charge, f.gold)) * (1 - f.fly);
    return {
      opacity: strength * on,
      transform: [{ translateX: sx - 70 }, { translateY: sy - 70 }, { scale: 0.7 + 0.5 * f.charge + 0.6 * f.bloom }],
    };
  });
  const flashStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    if (!onUi()) return HIDDEN;
    return {
    opacity: clockOn.value ? frame.value.flash * peakFlash.value : 0,
    transform: [{ translateX: stageX.value - 110 }, { translateY: stageY.value - 110 }],
    };
  });
  // The gold bloom, the rays and Alex's ink are drawn by CatchBurst (one Skia canvas on the same clock).
  // A blue water ring splashes out under the find.
  const waterStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    if (!onUi()) return HIDDEN;
    const p = clockOn.value ? frame.value.ink : -1;
    if (p < 0) return { opacity: 0, transform: [{ translateX: -999 }, { translateY: -999 }, { scale: 0 }] };
    return {
      opacity: 0.95 * (1 - p),
      transform: [{ translateX: stageX.value - WATER_W / 2 }, { translateY: stageY.value + 22 - WATER_H / 2 }, { scale: 0.4 + 1.5 * (1 - (1 - p) * (1 - p)) }],
    };
  });
  // A milestone catch (every 10th, and the grand 25th): a tapered column of light drops from the top of the screen
  // onto the find and lands on the held frame (its flash is the impact), then narrows and fades while the
  // burst blooms. The column is static Skia art; only this wrapper moves (scaleY from the top edge).
  const beamStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    if (!onUi()) return HIDDEN;
    const at = beamOn.value && clockOn.value ? beamAt(cc.value, planSV.value) : null;
    if (!at) return { opacity: 0, transform: [{ translateX: -999 }, { scaleX: 1 }, { scaleY: 0 }] };
    const reach = Math.max(1, stageY.value) / Math.max(1, layerHeightSV.value);
    return { opacity: 1 - at.fade * at.fade, transform: [{ translateX: stageX.value - BEAM_W / 2 }, { scaleX: 1 - 0.65 * at.fade }, { scaleY: at.drop * reach }] };
  });
  // Where the beam hits: a flat gold splash ring on the ground (scaleY 0.45), from the held frame.
  const splashStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    if (!onUi()) return HIDDEN;
    const d = beamOn.value && clockOn.value ? cc.value - planSV.value.hitStopAt : -1;
    const u = d / 520;
    if (d < 0 || u >= 1) return { opacity: 0, transform: [{ translateX: -999 }, { translateY: -999 }, { scaleY: 0.45 }, { scale: 0 }] };
    return { opacity: 0.95 * (1 - u), transform: [{ translateX: stageX.value - 60 }, { translateY: stageY.value + 18 - 60 },
      { scaleY: 0.45 }, { scale: 0.3 + 1.9 * (1 - (1 - u) * (1 - u)) }] };
  });
  const starOrigin = useAnimatedStyle(() => { touchHeal(heal); return ({ transform: [{ translateX: stageX.value }, { translateY: stageY.value }] }); });
  // Edge bands in house blue while a common plays: the map steps back a touch, the counter stays bright.
  const vignetteStyle = useAnimatedStyle(() => { touchHeal(heal); return ({ opacity: catchDim.value, transform: [{ translateX: 0 }] }); });
  // The bar ticks gold only when it really moved (a NEW find); a repeat find never flashes a fill that did not happen.
  const barGlowStyle = useAnimatedStyle(() => { touchHeal(heal); return ({ opacity: clockOn.value ? frame.value.barGlow * isNewSV.value : barGlow.value, transform: [{ translateX: 0 }] }); });
  const gatherOrigin = useAnimatedStyle(() => {
    touchHeal(heal);
    const f = frame.value;
    const sx = flyFromX.value + (stageX.value - flyFromX.value) * f.glide;
    const sy = flyFromY.value + (stageY.value - flyFromY.value) * f.glide;
    return { transform: [{ translateX: sx }, { translateY: sy }] };
  });
  const sparkOrigin = starOrigin;
  const badgeStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    if (!onUi()) return HIDDEN;
    if (clockOn.value) {
      // Round 4: a common's badge pops in (opaque in 70 ms, 0.6 to one small overshoot), never ghosting through rays.
      const f = frame.value;
      return { opacity: f.badge, transform: [{ translateY: (1 - f.badgeScale) * 30 }, { scale: f.badgeScale }] };
    }
    const b = badgeIn.value;
    return { opacity: b, transform: [{ translateY: (1 - b) * 40 }, { scale: 0.92 + 0.08 * b }] };
  });
  const stickerKick = useAnimatedStyle(() => { touchHeal(heal); return ({ transform: [{ scale: clockOn.value ? frame.value.kick : badgeKick.value }, { rotate: '-6deg' }] }); });
  const landRing = useAnimatedStyle(() => {
    touchHeal(heal);
    const r = clockOn.value ? frame.value.landRing : ringPop.value;
    return { opacity: r <= 0 || r >= 1 ? 0 : 1 - r, transform: [{ scale: 0.6 + 1.2 * Math.max(0, r) }] };
  });
  const barStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const v = clockOn.value ? barFrom.value + (barTo.value - barFrom.value) * frame.value.bar : progress.value;
    return { transform: [{ scaleX: Math.max(0.001, v) }] };
  });
  const newStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const r = clockOn.value ? frame.value.newPop : reveal.value;
    return { opacity: Math.min(1, r * 1.4), transform: [{ rotate: '-10deg' }, { scale: r > 0 ? 0.4 + 0.6 * r : 0.4 }] };
  });
  const rideStyle = useAnimatedStyle(() => { touchHeal(heal); return ({ opacity: Math.min(1, rideIn.value * 1.5), transform: [{ translateY: (1 - rideIn.value) * 12 }, { scale: 0.7 + 0.3 * rideIn.value }] }); });
  const gradeStyle = useAnimatedStyle(() => { touchHeal(heal); return ({ opacity: Math.min(1, gradeIn.value * 1.5), transform: [{ translateY: (1 - gradeIn.value) * 10 }, { scale: 0.7 + 0.3 * gradeIn.value }] }); });
  const backdropStyle = useAnimatedStyle(() => { touchHeal(heal); return ({ opacity: backdrop.value, transform: [{ translateX: 0 }] }); });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayer(current => (current.width === width && current.height === height ? current : { width, height }));
    layerHeightSV.value = height;
    layerRef.current?.measureInWindow((x, y) => {
      if (Number.isFinite(x) && Number.isFinite(y)) setOffset(current => (current.x === x && current.y === y ? current : { x, y }));
    });
  };

  const item = showing?.item ?? chompRequest?.item ?? null;
  // Memoized per find, so the memo'd effects layer never re-renders on a new {uri} object.
  const art = useMemo(() => (item ? findImageSource(item) : null), [item?.id, item?.icon_url, item?.variant_slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const countSwap = (): number => {
    'worklet';
    return clockOn.value ? (cc.value >= planSV.value.landAt ? 1 : 0) : (cascadeSV.value >= 2 ? 1 : 0);
  };
  const countOld = useAnimatedStyle(() => { touchHeal(heal); return ({ opacity: 1 - countSwap(), transform: [{ translateX: 0 }] }); });
  // The new count pops as it steps up (one overshoot, SPRING.stamp feel), so the kid sees the number grow.
  const countNew = useAnimatedStyle(() => {
    touchHeal(heal);
    const on = countSwap();
    const d = clockOn.value ? cc.value - planSV.value.landAt : 999;
    const u = Math.min(1, Math.max(0, d / 320));
    const pop = u >= 1 ? 0 : Math.exp(-4 * u) * Math.cos(2.4 * Math.PI * u) * (1 - u);
    return { opacity: on, transform: [{ scale: 1 + 0.45 * pop }] };
  });
  // A repeat find's coins stamp onto the badge as it lands (from 1.7, SPRING.stamp's settle).
  const coinStampStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const d = clockOn.value ? cc.value - planSV.value.landAt : -1;
    if (d < 0) return { opacity: 0, transform: [{ rotate: '-8deg' }, { scale: 1.7 }] };
    const u = Math.min(1, d / 300);
    const wave = u >= 1 ? 0 : Math.exp(-4 * u) * Math.cos(2.2 * Math.PI * u) * (1 - u);
    return { opacity: Math.min(1, d / 60), transform: [{ rotate: '-8deg' }, { scale: 1 + 0.7 * wave }] };
  });
  // One more to finish the set: the last stretch of the bar breathes gold after the count steps up.
  const oneMoreStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const d = clockOn.value ? cc.value - planSV.value.tickAt : -1;
    if (d < 0) return { opacity: 0, transform: [{ translateX: 0 }] };
    return { opacity: 0.45 + 0.45 * Math.sin(d / 140), transform: [{ translateX: 0 }] };
  });
  // Round 5: the next goal pops onto the badge's corner, bobs, and its gold ring pulses (only on a common's clock).
  const nextStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const g = clockOn.value ? nextGoalAt(cc.value, planSV.value) : { scale: 0, bob: 0, ring: -1 };
    // The disc leaves the badge on the frame its where-next flight starts (one disc on screen, never two).
    const w = whereSV.value;
    const flown = w.on && cc.value >= w.at;
    return { opacity: g.scale > 0 && !flown ? 1 : 0, transform: [{ translateY: g.bob }, { rotate: '8deg' }, { scale: g.scale }] };
  });
  const nextRingStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const r = clockOn.value ? nextGoalAt(cc.value, planSV.value).ring : -1;
    return { opacity: r < 0 ? 0 : 0.8 * (1 - r), transform: [{ scale: 1 + 0.6 * Math.max(0, r) }] };
  });
  // Wave 5 round 2: the bar's next slot breathes with the disc's ring (on from the disc's pop).
  const ghostStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const g = clockOn.value ? nextGoalAt(cc.value, planSV.value) : { scale: 0, bob: 0, ring: -1 };
    return { opacity: g.scale <= 0 ? 0 : g.ring < 0 ? 0.7 : 0.35 + 0.45 * (1 - g.ring), transform: [{ translateX: 0 }] };
  });
  // Wave 5 round 2: the where-next disc: arcs from the badge onto the next find (or its edge arrow), lands with a pop
  // and a gold ring, bobs there a beat, then fades. On the same clock, so it never waits on JS.
  const whereStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    if (!onUi()) return HIDDEN;
    const w = whereSV.value;
    const at = w.on ? whereAt(cc.value - w.at, { x: w.x0, y: w.y0 }, { x: w.x1, y: w.y1 }) : null;
    if (!at) return { opacity: 0, transform: [{ translateX: -999 }, { translateY: -999 }, { scale: 0 }] };
    return { opacity: at.alpha, transform: [{ translateX: at.x - 30 }, { translateY: at.y - 30 }, { rotate: `${at.rot}deg` }, { scale: at.scale }] };
  });
  const whereRingStyle = useAnimatedStyle(() => {
    touchHeal(heal);
    const w = whereSV.value;
    const at = w.on ? whereAt(cc.value - w.at, { x: w.x0, y: w.y0 }, { x: w.x1, y: w.y1 }) : null;
    const r = at ? at.ring : -1;
    return { opacity: r < 0 ? 0 : 0.9 * (1 - r), transform: [{ scale: 1 + 0.9 * Math.max(0, r) }] };
  });
  const badgeStyles = useMemo<BadgeStyles>(() => ({ badge: badgeStyle, kick: stickerKick, landRing, bar: barStyle, barGlow: barGlowStyle,
    newPop: newStyle, grade: gradeStyle, ride: rideStyle, countOld, countNew, coinStamp: coinStampStyle, oneMore: oneMoreStyle,
    next: nextStyle, nextRing: nextRingStyle, ghost: ghostStyle }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const fxStyles = useMemo<FxStyles>(() => ({ halo: haloStyle, beam: beamStyle, splash: splashStyle, water: waterStyle,
    gather: gatherOrigin, spark: sparkOrigin, star: starOrigin, flash: flashStyle, item: itemStyle }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const fxValues = useMemo<FxValues>(() => ({ frame, clock: cc, plan: planSV, on: clockOn, beamOn, ringN, starN, sx: stageX, sy: stageY, homeStars: homeSV, starTo }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const burstValues = useMemo<BurstValues>(() => ({ frame, clock: cc, plan: planSV, on: clockOn, sx: stageX, sy: stageY, inkScale, inkTurn, grand: grandSV,
    fan: fanSV, ring2: ring2SV }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const color = item ? rarityColor(item.rarity) : BRAND.gold;
  const motionFx = !!item && !reducedMotion && catchStyleFor(item.rarity) === 'chomp';
  const sparks = motionFx ? momentParticles(PARTICLES.sparkles, power, reducedMotion) : 0;
  const stars = motionFx ? momentParticles(BURST_STARS_MAX, power, reducedMotion) : 0;
  const gatherCount = motionFx ? momentParticles(8, power, reducedMotion) : 0;
  // The grand catch's confetti (capped, thinner on Battery Saver, none in Reduce Motion).
  const confetti = motionFx && grandCatch ? momentParticles(CONFETTI.max, power, reducedMotion) : 0;
  const name = item ? findDisplayName(item.name, item.set_name) : '';
  const stageFor = rideItem ?? primed?.item ?? readyItem;
  const sceneArt = useRideArt();
  // Launch warm-up, on the first idle after the map settles (never a fixed timer): the reveal's sunburst
  // shader and every ride kind in every sky are drawn once, tiny and invisible, one per idle slice. No catch
  // then draws a ride, gradient or shader for the first time during its reward.
  const [warmStep, setWarmStep] = useState(-1);
  const warmIntensity = useSharedValue(0.01);
  const warmPlan = useMemo(() => READY_RIDES.flatMap(kind => (['day', 'sunset', 'night'] as Sky[]).map(sky => ({ kind, sky }))), []);
  const busyRef = useRef(false);
  busyRef.current = !!request || !!primed || !!ride;
  useEffect(() => {
    if (window.width === 0 || warmStep >= warmPlan.length) return;
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      ?? ((cb: () => void) => setTimeout(cb, 200));
    let live = true;
    const next = () => {
      if (!live) return;
      if (busyRef.current) { setTimeout(() => idle(next, { timeout: 4000 }), 600); return; }
      setWarmStep(step => step + 1);
    };
    const timer = setTimeout(() => idle(next, { timeout: 4000 }), warmStep < 0 ? 0 : 280);
    return () => { live = false; clearTimeout(timer); };
  }, [warmStep, window.width]); // eslint-disable-line react-hooks/exhaustive-deps
  const warming = warmStep >= 0 && warmStep < warmPlan.length ? warmPlan[warmStep] : null;
  const warmPics = useMemo(() => (warming ? warmStagePicture(warming.kind, warming.sky,
    { width: window.width, height: window.height }, insets, sceneArt) : null), [warming, sceneArt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (warming) catchMark(`warm ${warming.kind} ${warming.sky}`); }, [warming]);
  const warmKey = (warm ?? []).map(entry => `${entry.item.id}:${entry.forceRide?.kind ?? ''}:${entry.forceRide?.sky ?? ''}`).join(',');
  // The staged find (nearest in range) is prebuilt first and swapped in only once its stage exists.
  useEffect(() => {
    if (window.width === 0) return;
    const target = stageItem && catchStyleFor(stageItem.rarity) === 'ride_photo' ? stageItem : null;
    if (!target) return;
    const layerSize = { width: window.width, height: window.height };
    const ready = () => rideStageReady(target, forceRide ?? null, layerSize, insets, sceneArt);
    if (ready()) { setReadyItem(target); return; }
    let live = true;
    const kick = setTimeout(() => {
      if (live && settled()) prebuildRideStage(target, forceRide ?? null, layerSize, insets, sceneArt);
    }, 0);
    const poll = setInterval(() => {
      if (!live) return;
      if (settled() && !ready()) prebuildRideStage(target, forceRide ?? null, layerSize, insets, sceneArt);
      if (ready()) { setReadyItem(target); clearInterval(poll); }
    }, 150);
    return () => { live = false; clearTimeout(kick); clearInterval(poll); };
  }, [stageItem?.id, stageItem?.rarity, forceRide?.kind, forceRide?.sky, stageNonce, window.width, window.height, sceneArt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Next-find stages are never built during a reward: they wait until the catch layer is idle, plus 600 ms.
  // A reveal still on screen (a held RIDE AGAIN card included) counts as busy.
  const rewardBusy = !!request || !!primed || !!ride || !!showing || !!shownReveal;
  const rewardBusyRef = useRef(rewardBusy);
  rewardBusyRef.current = rewardBusy;
  const rewardEndRef = useRef(0);
  useEffect(() => { if (!rewardBusy) rewardEndRef.current = Date.now(); }, [rewardBusy]);
  const settled = () => !rewardBusyRef.current && Date.now() - rewardEndRef.current > 600;
  useEffect(() => {
    if (!warm || window.width === 0 || rewardBusy) return;
    // One stage per idle slice, each after two clean frames, and never once a reward has started again.
    const queue = warm.filter(entry => catchStyleFor(entry.item.rarity) === 'ride_photo');
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      ?? ((cb: () => void) => setTimeout(cb, 50));
    let live = true;
    const step = () => {
      const entry = queue.shift();
      if (!live || !entry || rewardBusyRef.current) return;
      requestAnimationFrame(() => requestAnimationFrame(() => idle(() => {
        if (!live || rewardBusyRef.current) return;
        prebuildRideStage(entry.item, entry.forceRide ?? null, { width: window.width, height: window.height }, insets, sceneArt);
        // At least 1 s between builds, so one build's raster and upload never overlap the next.
        later = setTimeout(step, PREBUILD_GAP_MS);
      }, { timeout: 2000 })));
    };
    let later: ReturnType<typeof setTimeout> | null = null;
    const timer = setTimeout(step, 600);
    return () => { live = false; clearTimeout(timer); if (later) clearTimeout(later); };
  }, [warmKey, rewardBusy, window.width, window.height, insets.top, insets.bottom, sceneArt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Stable props, so memo(RidePhotoCatch) holds through the open's renders.
  const fullLayer = useMemo(() => ({ width: window.width, height: window.height }), [window.width, window.height]);
  const showingFrom = showing?.from;
  const stageFrom = useMemo(() => primed?.from
    ?? (showingFrom ? { x: showingFrom.x + offset.x, y: showingFrom.y + offset.y } : null),
  [primed?.from, showingFrom, offset.x, offset.y]);

  return (
    <View ref={layerRef} collapsable={false} pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {/* The map steps back behind the viewfinder (seen only at the edges while it opens and closes) */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backdropStyle]}>
        {mapStill && <Image source={{ uri: mapStill }} style={StyleSheet.absoluteFill} blurRadius={7} contentFit="cover" transition={0} />}
        <View style={[StyleSheet.absoluteFill, styles.tint]} />
        {layer.width > 0 && <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={layer.width} height={layer.height}>
            <RadialGradient c={vec(layer.width / 2, layer.height * 0.45)} r={Math.max(layer.width, layer.height) * 0.7}
              colors={['rgba(4,18,38,0)', 'rgba(4,18,38,0.55)']} />
          </Rect>
        </Canvas>}
      </Animated.View>

      {/* A common catch: soft house-blue edge bands while it plays (opacity only, always mounted). */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, vignetteStyle]}>
        <LinearGradient colors={VIGNETTE_TOP} style={styles.vignetteTop} />
        <LinearGradient colors={VIGNETTE_BOTTOM} style={styles.vignetteBottom} />
      </Animated.View>
      {/* Tap anywhere after the burst to skip to the end (the tenth catch never makes a kid wait). */}
      {chompRequest && <GestureDetector gesture={skipTap}>
        <View style={StyleSheet.absoluteFill} accessible accessibilityRole="button" accessibilityLabel="Skip" onAccessibilityTap={onSkip} />
      </GestureDetector>}

      {/* Wave 4: the burst's gradients, rays and ink drawn once, tiny, at launch, so the first catch never compiles them mid-burst. */}
      {warmStep === 0 && !reducedMotion && <Canvas pointerEvents="none" style={styles.warmCanvas}>
        <Group transform={WARM_SCALE}><CatchRaysArt size={goldSize} /></Group>
        {burstInk && <SkImageNode image={burstInk} x={0} y={0} width={2} height={2} fit="contain" />}
      </Canvas>}
      {warming && warmPics && <Canvas pointerEvents="none" style={styles.warmCanvas}>
        <Group transform={WARM_SCALE}>
          <Picture picture={warmPics.backdrop} />
          {warmPics.foreground ? <Picture picture={warmPics.foreground} /> : null}
          <Picture picture={warmPics.moving} />
        </Group>
        <Sunburst cx={1} cy={1} radius={2} intensity={warmIntensity} width={2} height={2} />
      </Canvas>}
      {stageFor && layer.width > 0 && <View pointerEvents="box-none"
        style={{ position: 'absolute', left: -offset.x, top: -offset.y, width: window.width, height: window.height }}>
        <RidePhotoCatch ref={stage} item={stageFor} active={!!ride} insets={insets}
        from={stageFrom}
        layer={fullLayer} reducedMotion={reducedMotion} firstRide={ride?.hint ?? rideHintSeen !== true}
        closing={ride?.closing ?? false} flyTarget={ride?.flyTo ?? null}
        onCaught={onRideCaught} onPrintReady={onPrintReady} onPrintLanded={onPrintLanded} onRodeOff={onRodeOff} onClose={onClose} onCovered={onCovered} onIrisClosed={onIrisClosedGuarded} onChromeBack={onChromeBack}
        autoShots={autoShots} forceRide={forceRide} reveal={revealFlags} fadeClose={!!shownReveal}
        ridesUsed={ridesUsedFor.current.get(stageFor.id) ?? 0} /></View>}
      {layer.width > 0 && <View pointerEvents="box-none"
        style={{ position: 'absolute', left: -offset.x, top: -offset.y, width: window.width, height: window.height }}>
        <CatchReveal data={shownReveal} outcome={revealOutcome} escape={revealEscape} flags={revealFlags} width={window.width} height={window.height} insets={insets} reducedMotion={reducedMotion}
          onContinue={onRevealContinue} onShare={onRevealShare} onEscaped={onRevealEscaped} onActions={onRevealActions}
          autoContinue={autoShots ? 2600 : null} autoSkipMs={autoSkipReveal ? 1500 : null} autoEscape={autoEscape} />
      </View>}

      {item && <CatchFx fx={fxStyles} sv={fxValues} burst={burstValues} confetti={confetti} layerHeight={layer.height} art={art} color={color} motionFx={motionFx} sparks={sparks} stars={stars} gatherCount={gatherCount}
        goldSize={goldSize} fxT={fxT} gatherT={gatherT} onCopyShown={onCopyShown} />}

      {/* The badge stays mounted (hidden at badgeIn 0), so the first reward never mounts its views mid-cascade */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, !badgeOn && styles.gateOff]}>
      <CatchBadge st={badgeStyles} summary={summary} photo={photo} bonusXp={bonusXp} newRide={newRide} art={art} name={name} color={color}
        left={badgeLeft} bottom={badgeBottom} coinStamp={coinStamp} nextArt={nextArt} />
      </View>
      {/* Wave 5 round 2: where to walk next (the session's last catch in range): the next-goal disc flies onto the find. */}
      <Animated.View pointerEvents="none" style={[styles.whereAt, whereStyle]}>
        <Animated.View style={[styles.nextRing, whereRingStyle]} />
        <View style={styles.nextDisc}>
          {nextArt ? <RNImage source={nextArt as never} style={styles.nextArt} resizeMode="contain" fadeDuration={0} /> : null}
        </View>
      </Animated.View>
      {/* The coin stream (always mounted, still until a catch throws its coins). */}
      {layer.width > 0 && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: COIN_STREAM.max }, (_, index) => (
          <StreamCoin key={index} index={index} t={coinT} count={coinN} geo={coinGeo} source={STREAM_COIN_ART} />))}
      </View>}
    </View>
  );
});

export default memo(HomeCatchMoment);

const styles = StyleSheet.create({
  tint: { backgroundColor: 'rgba(11,47,92,0.35)' },
  gateOff: { opacity: 0 },
  warmCanvas: { position: 'absolute', left: 0, top: 0, width: 2, height: 2, opacity: 0.01 },
  ring: { position: 'absolute', left: 0, top: 0, width: 80, height: 80, borderRadius: 40, borderWidth: 5 },
  halo: { position: 'absolute', left: 0, top: 0, width: 140, height: 140 },
  fxFill: { width: '100%', height: '100%' },
  flash: { position: 'absolute', left: 0, top: 0, width: 220, height: 220 },
  burstSparkle: { position: 'absolute' },
  burstStar: { position: 'absolute', left: -14, top: -14, width: 28, height: 28 },
  waterRing: { position: 'absolute', left: 0, top: 0, width: WATER_W, height: WATER_H },
  streamCoin: { position: 'absolute', left: 0, top: 0, width: STREAM_COIN, height: STREAM_COIN },
  coinTrail: { position: 'absolute', left: 0, top: 0, width: 18, height: 18 },
  beam: { position: 'absolute', left: 0, top: 0, width: BEAM_W, transformOrigin: 'top' },
  beamSpark: { position: 'absolute', left: 0, top: 0, width: 18, height: 18 },
  splash: { position: 'absolute', left: 0, top: 0, width: 120, height: 120, borderRadius: 60, borderWidth: 6, borderColor: GOLD_FX.rays },
  oneMore: { position: 'absolute', right: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: BRAND.goldLight },
  coinStampAt: { position: 'absolute', right: 10, top: -22 },
  coinStamp: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 3, paddingRight: 9, height: 28,
    borderRadius: 14, backgroundColor: BRAND.white, borderWidth: 2.5, borderColor: BRAND.navy },
  coinStampIcon: { width: 22, height: 22 },
  coinStampText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 16 },
  vignetteTop: { position: 'absolute', left: 0, right: 0, top: 0, height: '15%' },
  vignetteBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '15%' },
  barGlow: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: '#fff3b0' },
  gatherSparkle: { position: 'absolute', left: -7, top: -7, width: 14, height: 14 },
  sparkOrigin: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  spark: { position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: 2 },
  item: { position: 'absolute', left: 0, top: 0, width: FIND_ART_SIZE, height: FIND_ART_SIZE },
  itemArt: { width: FIND_ART_SIZE, height: FIND_ART_SIZE },
  // Wave 5: the next goal at sticker size (it was a 28 pt shadow that barely registered). The badge's text and
  // bar make room for it, so the disc never covers the set count.
  badgeNextRoom: { paddingRight: 16 + 30 },
  nextAt: { position: 'absolute', right: -34, top: (BADGE_HEIGHT - 60) / 2, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  nextRing: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: GOLD_FX.rays },
  nextDisc: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ffffff', borderWidth: 3, borderColor: GOLD_FX.rays,
    alignItems: 'center', justifyContent: 'center' },
  nextArt: { width: 44, height: 44, opacity: 0.5 },
  whereAt: { position: 'absolute', left: 0, top: 0, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  ghostSlot: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4, backgroundColor: BRAND.goldLight },
  itemRim: { position: 'absolute', left: -18, top: -18, width: FIND_ART_SIZE + 36, height: FIND_ART_SIZE + 36, opacity: 0.85 },
  itemFallback: { width: FIND_ART_SIZE, height: FIND_ART_SIZE, borderRadius: FIND_ART_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', width: BADGE_WIDTH, height: BADGE_HEIGHT, borderRadius: BADGE_HEIGHT / 2,
    flexDirection: 'row', alignItems: 'center', paddingLeft: STICKER_LEFT + STICKER + 8, paddingRight: 16,
    backgroundColor: BRAND.blue, borderWidth: 3, borderColor: BRAND.gold },
  sticker: { position: 'absolute', left: STICKER_LEFT, top: -14, width: STICKER, height: STICKER, borderRadius: 16,
    backgroundColor: '#ffffff', borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stickerPhoto: { borderWidth: 5 },
  stickerArt: { width: STICKER - 8, height: STICKER - 8 },
  stickerOver: { position: 'absolute' },
  hiddenCanvas: { opacity: 0 },
  landRing: { position: 'absolute', left: STICKER_LEFT - 8, top: -22, width: STICKER + 16, height: STICKER + 16, borderRadius: 24, borderWidth: 3 },
  badgeCopy: { flex: 1, justifyContent: 'center' },
  badgeTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, color: BRAND.white, fontFamily: 'Shark', fontSize: 15,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  newPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 2, borderColor: BRAND.white },
  newText: { color: BRAND.white, fontFamily: 'Shark', fontSize: 13, letterSpacing: 0.5 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(5,52,110,0.45)', overflow: 'hidden' },
  fill: { width: '100%', height: 7, borderRadius: 4, transformOrigin: 'left' },
  count: { color: BRAND.white, fontFamily: 'Knockout', fontSize: 14 },
  countOver: { position: 'absolute', left: 0, top: 0 },
  setName: { color: BRAND.sky, fontFamily: 'Knockout', fontSize: 14, marginTop: 1 },
  // Anchored left of the copy and sized to its content (it used to clip "+25 XP" over the map).
  gradeChip: { position: 'absolute', left: STICKER_LEFT + STICKER + 2, top: -26, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 12, borderWidth: 2, borderColor: '#0b2f5c' },
  gradeText: { fontFamily: 'Shark', fontSize: 14, marginLeft: 3, flexShrink: 0 },
  xpPill: { marginLeft: 6, paddingHorizontal: 6, borderRadius: 8, backgroundColor: '#0b2f5c', flexShrink: 0 },
  xpText: { color: '#ffffff', fontFamily: 'Knockout', fontSize: 14 },
  // Centred under the banner, capped at the banner's width (16 pt screen margins hold for any ride name).
  rideRow: { position: 'absolute', left: 0, right: 0, bottom: -34, alignItems: 'center' },
  stamp: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#0b2f5c',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stampNew: { borderColor: '#ff8a00', transform: [{ scale: 1.15 }] },
  stampOpen: { opacity: 0.45 },
  // Coming soon: a dim ride silhouette at 60% of a stamp, no lock (there is no key in play).
  stampSoon: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center', opacity: 0.35 },
  rideDivider: { width: 1.5, height: 14, marginHorizontal: 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  stampArt: { width: 16, height: 12 },
  rideCount: { color: '#ffffff', fontFamily: 'Knockout', fontSize: 14 },
  rideChip: { maxWidth: BADGE_WIDTH, flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: '#0b2f5c', borderWidth: 2, borderColor: '#ffcf3b' },
  rideText: { color: '#ffcf3b', fontFamily: 'Shark', fontSize: 13 },
});
