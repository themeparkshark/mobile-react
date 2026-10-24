import { forwardRef, memo, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Canvas, Group, Image as SkImageNode, ImageFormat, Picture, Rect, RadialGradient, vec, type SkImage } from '@shopify/react-native-skia';

const WARM_SCALE = [{ scale: 0.01 }];
/** Stamp art per ride (the ride's own vehicle). Unbuilt rides show a lock instead. */
const RIDE_STAMP: Partial<Record<RideKind, number>> = {
  coaster: require('../../../assets/images/ride-photo/car-back.webp'),
  flume: require('../../../assets/images/ride-photo/log-boat.webp'),
  teacups: require('../../../assets/images/ride-photo/teacup-back.webp'),
};
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { PrepItemType } from '../../models/prep-item-type';
import type { RedeemPrepItemResponseType } from '../../models/redeem-prep-item-response-type';
import redeemPrepItem, { type RedeemCatchDetails } from '../../api/endpoints/me/prep-items/redeem';
import { AuthContext } from '../../context/AuthProvider';
import { CurrencyContext } from '../../context/CurrencyProvider';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';
import { GoldBurst } from '../../ui/GoldBurst';
import { DURATION, EASE, SPRING, flashPeak, momentParticles } from '../../ui/motionEasing';
import { GOLD_FX, PARTICLES } from '../../ui/motion';
import { arcPoint, catchHaptics, catchPlan, coinStreamAt, coinStreamPlan, COIN_STREAM, type CatchPlan } from '../../components/map/alive/mapWow';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';
import { usePowerBudget } from '../../power';
import { holdHud, pulseHud, punchHud } from '../../components/Topbar/hudPulse';
import { findDisplayName } from './homeFindCopy';
import { setHomeHuntRankLine } from './homeHuntRankStore';
import { findImageSource, FIND_ART_SIZE } from './PrepItem';
import { burstSparkCount, CATCH_TIMING, catchSummary, rarityColor, rarityTier, type CatchSummary } from './findPresentation';
import { catchFind, type CatchResult } from './homeCatch';
import { GRADE_LABEL, GRADE_STARS, catchStyleFor, type PhotoGrade } from './ridePhoto';
import { Sunburst } from '../../gamekit/fx/ShaderFx';
import RidePhotoCatch, { BLANK_IMAGE, prebuildRideStage, rideStageReady, setRidePhotoPlayer, warmStagePicture, type RideStageHandle } from './ridePhoto/RidePhotoCatch';
import { useRideArt } from './ridePhoto/rideAssets';
import { catchHaptic, catchMark, catchSound } from './ridePhoto/catchAudio';
import { catchDim, dimCatchChrome, setCatchOpen, showCatchChrome } from './catchPresence';
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
/** Development previews: the next catch plays as the first of a session again. */
export function resetCatchSessionForPreview(): void { sessionCatches = 0; }
/** The common catch's flight home and arc (mapWow catchPlan). */
const CATCH_FLY_MS = 600;
const CATCH_ARC_PT = 80;
const CATCH_RISE_PT = 24;
/** The rising haptic ladder under the wobbles (tap, tick, light, medium); the burst's own haptics fire on the burst. */
function catchHapticPlan(plan: CatchPlan, t0: number, alive: () => boolean): void {
  for (const step of catchHaptics(plan)) {
    if (step.at >= plan.hitStopAt) continue;
    const fire = () => { if (alive()) catchHaptic(step.intent, step.at === 0 ? 3 : 2); };
    const delay = step.at - (Date.now() - t0);
    if (delay <= 0) fire(); else setTimeout(fire, delay);
  }
}
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

function Spark({ index, count, pop, color }: { index: number; count: number; pop: SharedValue<number>; color: string }) {
  const angle = (index / count) * Math.PI * 2 + (index % 2 ? 0.18 : 0);
  const reach = index % 2 ? 54 : 74;
  const style = useAnimatedStyle(() => {
    const t = pop.value;
    const out = 1 - (1 - t) ** 3;
    return {
      opacity: t <= 0 || t >= 1 ? 0 : 1 - t,
      transform: [{ translateX: Math.sin(angle) * reach * out }, { translateY: -Math.cos(angle) * reach * out },
        { scale: 1.2 - 0.8 * t }, { rotate: `${45 + t * 90}deg` }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.spark, { backgroundColor: index % 3 ? color : BRAND.white }, style]} />;
}

const MAP_SPARKLE = require('../../../assets/images/map/fx/sparkle.png');
/** House art (already in the app): Alex's inked gold burst, the blue water ring and the gold star. */
const INK_BURST = require('../../../assets/fx/burst-gold.webp');
const WATER_RING = require('../../../assets/fx/waterring.webp');
const MINI_STAR = require('../../../assets/fx/mini-star.webp');
const COIN_FALLBACK = require('../../../assets/images/coingold.png');
const STREAM_COIN = 30;
const INK_SIZE = 240;
const WATER_W = 150;
const WATER_H = 85;
const VIGNETTE_TOP = ['rgba(7,104,185,0.28)', 'rgba(7,104,185,0)'] as const;
const VIGNETTE_BOTTOM = ['rgba(7,104,185,0)', 'rgba(7,104,185,0.3)'] as const;
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
    <Image source={MAP_SPARKLE} tintColor={SPARK_TINTS[index % SPARK_TINTS.length]} style={styles.fxFill} contentFit="contain" transition={0} />
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
    <Image source={MAP_SPARKLE} tintColor={GOLD_FX.raysSoft} style={styles.fxFill} contentFit="contain" transition={0} />
  </Animated.View>;
}

/** A star flung from the burst (bigger than a sparkle, so it reads even at 10 frames a second). */
function BurstStar({ index, t }: { index: number; t: SharedValue<number> }) {
  const angle = -Math.PI / 2 + (index - 1.5) * 0.9;
  const reach = index % 2 ? 96 : 120;
  const style = useAnimatedStyle(() => {
    const p = t.value;
    if (p <= 0 || p >= 1) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0 }, { rotate: '0deg' }] };
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
 * One coin of the stream (Monopoly GO): out of the find on the burst, then a throw into the counter.
 * Always mounted and still (opacity 0) until a stream runs, so no catch mounts views on its burst frame.
 */
function StreamCoin({ index, t, count, geo, source }: {
  index: number; t: SharedValue<number>; count: SharedValue<number>;
  geo: SharedValue<{ fx: number; fy: number; tx: number; ty: number }>; source: string | number;
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
  return <Animated.View pointerEvents="none" style={[styles.streamCoin, style]}>
    <Image source={typeof source === 'number' ? source : { uri: source }} placeholder={COIN_FALLBACK} style={styles.fxFill} contentFit="contain" transition={0} />
  </Animated.View>;
}

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
}>(function HomeCatchMoment({ request, stageItem = null, badgeBottom, redeem = redeemPrepItem, getFix, mapStill = null,
  onCollected, onUnavailable, onRodeOff: onRodeOffProp, onDone, onFailed, autoShots, forceRide, warm, onCascade, forceReducedMotion = false, autoSkipReveal = false, autoEscape = 'map', loadSetPage, onRideAgain, refreshAfterCatch = true }, ref) {
  const systemReduced = useReducedGameMotion();
  // Development recordings can show one catch with Reduce Motion on.
  const reducedMotion = (__DEV__ && forceReducedMotion) || systemReduced;
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
  const [cascade, setCascade] = useState(0);
  const [bonusXp, setBonusXp] = useState<number | null>(null);
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

  const pop = useSharedValue(0);
  // The four-beat catch: press squash, gather (rise, halo, inward sparkles), held flash, burst pop and gold.
  const squash = useSharedValue(0);
  const charge = useSharedValue(0);
  const flash = useSharedValue(0);
  const popScale = useSharedValue(1);
  const burstFx = useSharedValue(0);
  const gold = useSharedValue(0);
  const goldBloom = useSharedValue(0);
  const lift = useSharedValue(0);
  const wobble = useSharedValue(0);
  const fly = useSharedValue(0);
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
  // Round 2: the halo's floor once a catch starts (no blink between the squash and the gather), the coin
  // stream's clock and geometry, the inked burst and water ring, and the set bar's gold tick.
  const started = useSharedValue(0);
  const coinT = useSharedValue(0);
  const coinN = useSharedValue(0);
  const coinGeo = useSharedValue({ fx: 0, fy: 0, tx: 0, ty: 0 });
  const ink = useSharedValue(0);
  const barGlow = useSharedValue(0);
  /** The running common catch's clock, so land() and arrive() keep its beats (and a tap can skip it). */
  const clockRef = useRef<{ t0: number; plan: CatchPlan; skippable: boolean; streamed: boolean } | null>(null);
  const skipped = useRef(false);
  const skipWake = useRef<(() => void) | null>(null);
  /** A wait a skip can cut short (only after the burst: the server has answered by then). */
  const pause = (ms: number) => new Promise<void>(resolve => {
    if (skipped.current || ms <= 0) { resolve(); return; }
    const timer = setTimeout(() => { skipWake.current = null; resolve(); }, ms);
    skipWake.current = () => { clearTimeout(timer); skipWake.current = null; resolve(); };
  });
  const pauseUntil = (at: number) => { const c = clockRef.current; return pause(c ? c.t0 + at - Date.now() : 0); };

  const latest = useRef({ getFix, currencies, triggerFly, getTarget, refreshPlayer, onCollected, onUnavailable, onRodeOff: onRodeOffProp, onDone, onFailed, redeem, reducedMotion, onCascade, request, onRideAgain });
  latest.current = { getFix, currencies, triggerFly, getTarget, refreshPlayer, onCollected, onUnavailable, onRodeOff: onRodeOffProp, onDone, onFailed, redeem, reducedMotion, onCascade, request, onRideAgain };

  const badgeLeft = (layer.width - BADGE_WIDTH) / 2;
  const target = { x: badgeLeft + STICKER_LEFT + STICKER / 2, y: layer.height - badgeBottom - BADGE_HEIGHT / 2 - 8 };
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
    fly.value = 0; itemGone.value = 0; lift.value = 0; wobble.value = 0; popScale.value = 1;
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
    const pad = motion ? withSpring(1, { damping: 16, stiffness: 240 }) : withTiming(1, { duration: 120 });
    if (!viaPrint) badgeIn.value = pad;
    if (!viaPrint) {
      if (!data.replayed) catchSound('whoosh', { volume: 0.6 });
      const flyMs = clockRef.current?.plan.flyMs ?? CATCH_FLY_MS;
      fly.value = withTiming(1, { duration: motion && !skipped.current ? flyMs : 120, easing: EASE.inOut });
      await pause(motion ? flyMs : 60);
      if (skipped.current) await wait(120);
      if (aliveRef.current !== token) return;
      itemGone.value = withTiming(1, { duration: 80 });
      await arrive(next, data, token);
    }
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
    reveal.value = 0; gradeIn.value = 0;
    // The (already invisible) reveal clears two frames later, off the done frame; its photo is released after.
    revealedRef.current = false; revealCovered.value = false; revealHand.current = null; escapeHand.current = null;
    if (!keepReveal) requestAnimationFrame(() => requestAnimationFrame(() => { setReveal(null); setRevealEscape(null); revealHidden.value = false; }));
    // RIDE AGAIN: the app chrome and the map stay hidden under the covering card (the next ride opens there).
    if (!keepReveal) { showCatchChrome(false); setCatchOpen(false); }
    dimCatchChrome(false);
    clockRef.current = null; skipped.current = false; skipWake.current = null;
    cancelAnimation(started); started.value = 0; barGlow.value = 0;
    latest.current.onDone(caught);
  };

  /**
   * The coins burst out of the find on the gold-burst frame and stream into the counter one after another
   * (40 ms apart). The first to land starts the counter's roll, each one punches its icon, every third
   * gives a tiny tick in the hand, the last bumps it full size and "+N" pops under it.
   */
  const streamCoins = (data: RedeemPrepItemResponseType['data'], plan: CatchPlan, motion: boolean) => {
    const clock = clockRef.current;
    if (!clock || data.replayed) return;
    const coins = data.rewards.coins;
    const off = offsetRef.current;
    const lifted = { x: flyFromX.value, y: flyFromY.value - plan.risePt };
    const { getTarget, triggerFly: flyTo } = latest.current;
    if (data.rewards.tickets > 0) {
      flyTo({ imageSource: TICKET_ICON, amount: Math.min(data.rewards.tickets, 6), startX: lifted.x + off.x, startY: lifted.y + off.y, targetPosition: 'tickets' });
    }
    if (!(coins > 0)) return;
    clock.streamed = true;
    const stream = coinStreamPlan(coins, !motion);
    const chip = getTarget('coins');
    if (!chip || stream.count === 0) {
      // No counter on screen (or Reduce Motion): the counter simply rolls once, a beat after the burst.
      setTimeout(() => pulseHud('coins', coins), motion ? 300 : DURATION.quick);
      return;
    }
    coinGeo.value = { fx: lifted.x, fy: lifted.y, tx: chip.x - off.x, ty: chip.y - off.y };
    coinN.value = stream.count;
    const total = stream.landAt[stream.landAt.length - 1] + 40;
    coinT.value = 0;
    coinT.value = withTiming(total, { duration: total, easing: Easing.linear });
    holdHud('coins', total + 400);
    stream.landAt.forEach((ms, i) => setTimeout(() => {
      const last = i === stream.count - 1;
      if (i === 0) pulseHud('coins', coins); else punchHud('coins', last);
      if (i % 3 === 2) catchHaptic('tickSelection', 1);
      if (i % 2 === 0 || last) catchSound('tick', { pitch: 2 + i, volume: 0.45 });
    }, ms));
  };

  /** Tap anywhere after the burst: the catch jumps to its end (the find home, the badge away). */
  const onSkip = useCallback(() => {
    const clock = clockRef.current;
    if (!clock?.skippable || skipped.current) return;
    skipped.current = true;
    catchMark('skip');
    skipWake.current?.();
  }, []);

  useEffect(() => {
    if (!request || layer.width === 0) return;
    const token = ++aliveRef.current;
    primeSeq.current += 1;
    const alive = () => aliveRef.current === token;
    const { item, pivotId } = request;
    const motion = !latest.current.reducedMotion;
    [pop, lift, wobble, fly, badgeIn, reveal, progress, gradeIn, squash, charge, flash, burstFx, gold, goldBloom, ink, barGlow].forEach(value => { cancelAnimation(value); value.value = 0; });
    cancelAnimation(popScale); popScale.value = 1;
    badgeKick.value = 1;
    setSummary(null); setPhoto(null); setCascade(0); setBonusXp(null);
    setShowing(request);
    const start = fromPoint(request);
    flyFromX.value = start.x;
    flyFromY.value = start.y;

    // Uncommon and rarer: the Ride Photo viewfinder (usually already opening from the tap). It owns the
    // whole screen, so the header and tab bar slide away for it.
    if (catchStyleFor(item.rarity) === 'ride_photo') {
      showCatchChrome(true);
      itemGone.value = 1;
      redeemRun.current = null;
      setRideItem(item);
      setRide({ key: token, closing: false, hint: rideHintSeen !== true, flyTo: null });
      if (!primed) showBackdrop(true);
      return;
    }
    itemGone.value = 0;
    // A common never moves the header or the tab bar (the counter stays put for its coins): the tab bar
    // softens and the map's own controls fade, on the UI thread from this frame.
    dimCatchChrome(true);
    setCatchOpen(true);

    void (async () => {
      // The catch, four beats (src/ui/motion.ts, mapWow catchPlan): a squish under the finger, then
      // wobble wobble wobble while it rises and the gold gathers, one held frame with a soft flash,
      // a gold burst that throws the coins into the counter, and the find flies home to its badge.
      // The server answers during the wobbles. Later catches this session play the short repeat.
      const plan = catchPlan({ reduced: !motion, repeat: sessionCatches > 0 });
      const t0 = Date.now();
      clockRef.current = { t0, plan, skippable: false, streamed: false };
      skipped.current = false;
      catchMark(plan.repeat ? 'tap-repeat' : 'tap');
      catchHapticPlan(plan, t0, alive);
      catchSound('pop');
      const run = catchFind(latest.current.redeem, item.id, pivotId, latest.current.getFix(), { catch_style: 'chomp' });
      // The halo never blinks out between the squash and the gather: it holds a floor once the catch starts.
      started.value = motion ? withTiming(1, { duration: DURATION.tap }) : 1;
      if (motion) {
        squash.value = withSequence(withTiming(1, { duration: plan.squashMs, easing: EASE.out }), withSpring(0, SPRING.stamp));
        charge.value = withDelay(plan.squashMs, withTiming(1, { duration: plan.anticipationMs, easing: EASE.charge }));
        lift.value = withDelay(plan.squashMs, withTiming(1, { duration: plan.anticipationMs, easing: EASE.out }));
        // Each wobble swings out and back over 150 ms, alternating sides, each one stronger.
        const swings: number[] = [];
        let after = 0;
        const steps = plan.wobbles.flatMap((w, i) => {
          const side = i % 2 === 0 ? 1 : -1;
          const gap = Math.max(0, w.at - after);
          after = w.at + 150;
          swings.push(side * w.deg);
          return [withDelay(gap, withTiming(side * w.deg, { duration: 75 })), withTiming(0, { duration: 75 })];
        });
        if (steps.length > 0) wobble.value = withSequence(...(steps as [number, ...number[]]));
      }
      // The answer usually lands inside the wobbles; a slow one keeps a small held wobble going (never a freeze).
      let result: CatchResult | null = null;
      void run.then(r => { result = r; });
      await wait(Math.max(0, plan.hitStopAt - (Date.now() - t0)));
      if (!alive()) return;
      if (!result && motion) wobble.value = withRepeat(withSequence(withTiming(5, { duration: 90 }), withTiming(-5, { duration: 90 })), -1, true);
      const settled = result ?? await run;
      if (!alive()) return;
      cancelAnimation(wobble);
      if (settled.kind !== 'caught') {
        // A funny miss, never a sad one: the find boings out of the grab and hops back to its spot.
        catchHaptic('hitSoft', 3);
        catchMark('miss');
        wobble.value = motion ? withSequence(withTiming(-14, { duration: 90 }), withSpring(0, SPRING.pop)) : 0;
        charge.value = withTiming(0, { duration: DURATION.exit, easing: EASE.in });
        started.value = withTiming(0, { duration: DURATION.exit, easing: EASE.in });
        lift.value = withSpring(0, SPRING.pop);
        await wait(300);
        if (!alive()) return;
        itemGone.value = withTiming(1, { duration: 160 });
        if (settled.kind === 'gone') latest.current.onUnavailable();
        latest.current.onFailed(settled.line, settled.kind === 'failed');
        await wait(170);
        if (alive()) finish(false);
        return;
      }
      wobble.value = withTiming(0, { duration: 40 });
      // Hit-stop: one held beat with the soft flash (none with Dim Flashing Lights or Reduce Motion).
      catchMark('hitstop');
      const peak = flashPeak(isDimFlashingLightsEnabled(), !motion);
      flash.value = withSequence(withTiming(peak, { duration: 40 }), withTiming(0, { duration: DURATION.flash - 40, easing: EASE.in }));
      await wait(motion ? DURATION.hitStop : 0);
      if (!alive()) return;
      // Burst: the find pops past full size, the gold blooms, Alex's inked burst and a blue water ring
      // splash out, sparkles and stars fly, and the coins burst out toward the counter.
      catchMark('burst');
      sessionCatches += 1;
      if (clockRef.current) clockRef.current.skippable = true;
      catchHaptic('comboHeavy', 3);
      setTimeout(() => { if (alive()) catchHaptic('success', 3); }, 180);
      catchSound('chime', { volume: 0.8 });
      streamCoins(settled.data, plan, motion);
      if (motion) {
        popScale.value = withSequence(withTiming(plan.burstScale, { duration: 90, easing: EASE.out }), withSpring(1.18, SPRING.pop));
        pop.value = 0;
        pop.value = withTiming(1, { duration: DURATION.bloom, easing: EASE.out });
        burstFx.value = 0;
        burstFx.value = withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear });
        ink.value = 0;
        ink.value = withTiming(1, { duration: plan.repeat ? 620 : DURATION.sparkle, easing: Easing.linear });
        const hold = plan.repeat ? 140 : 360;
        gold.value = withSequence(withTiming(1, { duration: 120, easing: EASE.out }), withDelay(hold, withTiming(0, { duration: plan.repeat ? 300 : 480, easing: EASE.in })));
        goldBloom.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: DURATION.bloom - 140 }));
        charge.value = withTiming(0, { duration: 260 });
        // The find holds its pop for a beat, then flies home (land() plays the arc).
        await pause(Math.max(0, plan.flyAt - plan.burstAt));
        if (!alive()) return;
      }
      catchMark('fly');
      await land(item, settled.data, token, false);
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
  const from = fromPoint(showing ?? chompRequest);
  // The rays reach about 80 percent of the screen width (a burst you can screenshot, not a lens glow).
  const goldSize = Math.round(Math.min(window.width, 440) * 0.8);
  const itemStyle = useAnimatedStyle(() => {
    const f = fly.value;
    // The flight home: a quadratic arc with an 80 pt apex, an edge-spin and a shrink to half size.
    const start = { x: flyFromX.value, y: flyFromY.value - CATCH_RISE_PT * lift.value };
    const p = arcPoint(start, target, CATCH_ARC_PT, f);
    const press = 1 - 0.14 * squash.value;
    return {
      opacity: 1 - itemGone.value,
      transform: [{ translateX: p.x - FIND_ART_SIZE / 2 }, { translateY: p.y - FIND_ART_SIZE / 2 },
        { rotate: `${wobble.value + f * 360}deg` },
        { scale: press * (1 + 0.12 * charge.value) * popScale.value * (1 - 0.6 * f) },
        // A coin-like edge turn while it flies (never thinner than a third, so it reads as the same find).
        { scaleX: f > 0 && f < 1 ? Math.max(0.35, Math.abs(Math.cos(f * Math.PI * 1.5))) : 1 }],
    };
  });
  // The gather: a gold halo builds under the find while it rises; the soft flash on the held frame.
  const haloStyle = useAnimatedStyle(() => ({
    // A floor of 0.4 once the catch has started, so the halo never blinks out between the squash and the gather.
    opacity: Math.max(0.4 * started.value, Math.min(1, 0.55 + 0.45 * charge.value) * Math.max(charge.value, gold.value)) * (1 - fly.value),
    transform: [{ translateX: from.x - 70 }, { translateY: from.y - CATCH_RISE_PT * lift.value - 70 }, { scale: 0.7 + 0.5 * charge.value + 0.3 * goldBloom.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value,
    transform: [{ translateX: from.x - 110 }, { translateY: from.y - CATCH_RISE_PT - 110 }],
  }));
  const goldStyle = useAnimatedStyle(() => ({ transform: [{ translateX: from.x - goldSize / 2 }, { translateY: from.y - CATCH_RISE_PT - goldSize / 2 }] }));
  // Alex's inked gold burst: snaps out past full size on the burst, then fades (the hand-drawn frame of the moment).
  const inkStyle = useAnimatedStyle(() => {
    const p = ink.value;
    // Snaps out in the first fifth, holds full size (the screenshot frame), then fades in the last third.
    const grow = p < 0.2 ? p / 0.2 : 1;
    return {
      opacity: p <= 0 || p >= 1 ? 0 : p < 0.66 ? 1 : 1 - (p - 0.66) / 0.34,
      transform: [{ translateX: from.x - INK_SIZE / 2 }, { translateY: from.y - CATCH_RISE_PT - INK_SIZE / 2 },
        { scale: 0.35 + 0.85 * (1 - (1 - grow) * (1 - grow)) + 0.08 * p }, { rotate: `${12 * p}deg` }],
    };
  });
  // A blue water ring splashes out on the ground under the find.
  const waterStyle = useAnimatedStyle(() => {
    const p = ink.value;
    return {
      opacity: p <= 0 || p >= 1 ? 0 : 0.95 * (1 - p),
      transform: [{ translateX: from.x - WATER_W / 2 }, { translateY: from.y + 10 - WATER_H / 2 }, { scale: 0.4 + 1.5 * (1 - (1 - p) * (1 - p)) }],
    };
  });
  const starOrigin = useAnimatedStyle(() => ({ transform: [{ translateX: from.x }, { translateY: from.y - CATCH_RISE_PT }] }));
  // Edge bands in house blue while a common plays: the map steps back a touch, the counter stays bright.
  const vignetteStyle = useAnimatedStyle(() => ({ opacity: catchDim.value }));
  const barGlowStyle = useAnimatedStyle(() => ({ opacity: barGlow.value }));
  const gatherOrigin = useAnimatedStyle(() => ({ transform: [{ translateX: from.x }, { translateY: from.y - CATCH_RISE_PT * lift.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pop.value <= 0 || pop.value >= 1 ? 0 : 0.9 * (1 - pop.value),
    transform: [{ translateX: from.x - 40 }, { translateY: from.y - CATCH_RISE_PT - 40 }, { scale: 0.5 + 1.9 * pop.value }],
  }));
  const sparkOrigin = useAnimatedStyle(() => ({ transform: [{ translateX: from.x }, { translateY: from.y - CATCH_RISE_PT }] }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badgeIn.value,
    transform: [{ translateY: (1 - badgeIn.value) * 40 }, { scale: 0.92 + 0.08 * badgeIn.value }],
  }));
  const stickerKick = useAnimatedStyle(() => ({ transform: [{ scale: badgeKick.value }, { rotate: '-6deg' }] }));
  const landRing = useAnimatedStyle(() => ({
    opacity: ringPop.value <= 0 || ringPop.value >= 1 ? 0 : 1 - ringPop.value,
    transform: [{ scale: 0.6 + 1.2 * ringPop.value }],
  }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, progress.value) }] }));
  const newStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, reveal.value * 1.4),
    transform: [{ rotate: '-10deg' }, { scale: reveal.value > 0 ? 0.4 + 0.6 * reveal.value : 0.4 }],
  }));
  const rideStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, rideIn.value * 1.5), transform: [{ translateY: (1 - rideIn.value) * 12 }, { scale: 0.7 + 0.3 * rideIn.value }] }));
  const gradeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, gradeIn.value * 1.5), transform: [{ translateY: (1 - gradeIn.value) * 10 }, { scale: 0.7 + 0.3 * gradeIn.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayer(current => (current.width === width && current.height === height ? current : { width, height }));
    layerRef.current?.measureInWindow((x, y) => {
      if (Number.isFinite(x) && Number.isFinite(y)) setOffset(current => (current.x === x && current.y === y ? current : { x, y }));
    });
  };

  const item = showing?.item ?? chompRequest?.item ?? null;
  const art = item ? findImageSource(item) : null;
  const color = item ? rarityColor(item.rarity) : BRAND.gold;
  const motionFx = !!item && !reducedMotion && catchStyleFor(item.rarity) === 'chomp';
  const sparks = motionFx ? momentParticles(PARTICLES.sparkles, power, reducedMotion) : 0;
  const stars = motionFx ? momentParticles(4, power, reducedMotion) : 0;
  const coinSource: string | number = currencies[0]?.icon_url ?? COIN_FALLBACK;
  const gatherCount = motionFx ? momentParticles(8, power, reducedMotion) : 0;
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
  const total = summary?.total, collected = summary?.collected;
  const shownCount = collected != null && total != null ? (cascade >= 2 || !summary?.isNew ? collected : Math.max(0, collected - 1)) : null;

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
      {chompRequest && <Pressable style={StyleSheet.absoluteFill} onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip" />}

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

      {item && <>
        {/* Gather: a gold halo builds under the find (ground-glow art, tinted gold). */}
        <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none">
          <Image source={GLOW_TEX} tintColor={GOLD_FX.glow} style={styles.fxFill} contentFit="fill" transition={0} />
        </Animated.View>
        {motionFx && <Animated.View style={[styles.waterRing, waterStyle]} pointerEvents="none">
          <Image source={WATER_RING} style={styles.fxFill} contentFit="contain" transition={0} />
        </Animated.View>}
        {motionFx && <Animated.View style={[styles.goldAt, { width: goldSize, height: goldSize }, goldStyle]} pointerEvents="none">
          <GoldBurst size={goldSize} amount={gold} bloom={goldBloom} spin reduced={reducedMotion} />
        </Animated.View>}
        {motionFx && <Animated.View style={[styles.inkBurst, inkStyle]} pointerEvents="none">
          <Image source={INK_BURST} style={styles.fxFill} contentFit="contain" transition={0} />
        </Animated.View>}
        <Animated.View style={[styles.ring, { borderColor: GOLD_FX.rays }, ringStyle]} pointerEvents="none" />
        <Animated.View style={[styles.sparkOrigin, gatherOrigin]} pointerEvents="none">
          {Array.from({ length: gatherCount }, (_, index) => <GatherSparkle key={index} index={index} count={gatherCount} charge={charge} />)}
        </Animated.View>
        <Animated.View style={[styles.sparkOrigin, sparkOrigin]} pointerEvents="none">
          {Array.from({ length: sparks }, (_, index) => <BurstSparkle key={index} index={index} count={sparks} t={burstFx} />)}
        </Animated.View>
        <Animated.View style={[styles.sparkOrigin, starOrigin]} pointerEvents="none">
          {Array.from({ length: stars }, (_, index) => <BurstStar key={index} index={index} t={burstFx} />)}
        </Animated.View>
        <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none">
          <Image source={GLOW_TEX} tintColor={GOLD_FX.core} style={styles.fxFill} contentFit="fill" transition={0} />
        </Animated.View>
        <Animated.View style={[styles.item, itemStyle]} pointerEvents="none">
          {art ? <Image source={art} style={styles.itemArt} contentFit="contain" transition={0} />
            : <View style={[styles.itemFallback, { backgroundColor: color }]}><GameIcon name="gift" size={30} /></View>}
        </Animated.View>
      </>}

      {/* The badge stays mounted (hidden at badgeIn 0), so the first reward never mounts its views mid-cascade */}
      <>
        <Animated.View pointerEvents="none" style={[styles.badge, { left: badgeLeft, bottom: badgeBottom,
          borderColor: summary?.setColor ?? BRAND.gold }, badgeStyle]}>
          {/* Sticker: the photo (or the item) breaks out of the badge with a die-cut edge */}
          <Animated.View style={[styles.sticker, photo && styles.stickerPhoto,
            photo && { borderColor: photo.grade === 'frame_it' ? '#ffcf3b' : photo.grade === 'great' ? '#c9d5e3' : '#ffffff' }, stickerKick]}>
            {/* The sticker canvas stays mounted; it shows the actual photo once there is one. */}
            <Canvas style={[{ width: STICKER - 10, height: STICKER - 10 }, !photo?.image && styles.hiddenCanvas]}>
              <SkImageNode image={photo?.image ?? BLANK_IMAGE} x={0} y={0} width={STICKER - 10} height={STICKER - 10} fit="cover" />
            </Canvas>
            {!photo?.image && art ? <Image source={art} style={[styles.stickerArt, styles.stickerOver]} contentFit="contain" transition={0} /> : null}
          </Animated.View>
          <Animated.View style={[styles.landRing, { borderColor: color }, landRing]} />
          <View style={styles.badgeCopy}>
            <View style={styles.badgeTop}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {summary?.isNew && <Animated.View style={[styles.newPill, { backgroundColor: summary.rarityColor }, newStyle]}>
                <Text style={styles.newText}>NEW!</Text>
              </Animated.View>}
            </View>
            <View style={styles.progressRow}>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, { backgroundColor: summary?.setColor ?? BRAND.gold }, barStyle]} />
                <Animated.View pointerEvents="none" style={[styles.barGlow, barGlowStyle]} />
              </View>
              {shownCount != null && <Text style={styles.count}>{shownCount}/{total}</Text>}
            </View>
            {summary?.setName && <Text style={styles.setName} numberOfLines={1}>{summary.complete ? `${summary.setName} complete!` : summary.setName}</Text>}
          </View>
          {photo && <Animated.View style={[styles.gradeChip, { backgroundColor: GRADE_CHIP[photo.grade][0] }, gradeStyle]}>
            {Array.from({ length: GRADE_STARS[photo.grade] }, (_, i) => <GameIcon key={i} name="star" size={14} />)}
            <Text style={[styles.gradeText, { color: GRADE_CHIP[photo.grade][1] }]} numberOfLines={1}>{GRADE_LABEL[photo.grade]}</Text>
            {bonusXp ? <View style={styles.xpPill}><Text style={styles.xpText} numberOfLines={1}>+{bonusXp} XP</Text></View> : null}
          </Animated.View>}
          {/* A ride the player never snapped: "New ride!", the 3 ride stamps, "n of 3", then (after a divider) the
              unbuilt rides as dim "coming soon" silhouettes, no locks and no number. No progress-bar fill. */}
          {newRide && <View style={styles.rideRow} pointerEvents="none"><Animated.View style={[styles.rideChip, rideStyle]}>
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
      </>
      {/* The coin stream (always mounted, still until a catch throws its coins). */}
      {layer.width > 0 && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: COIN_STREAM.max }, (_, index) => (
          <StreamCoin key={index} index={index} t={coinT} count={coinN} geo={coinGeo} source={coinSource} />))}
      </View>}
    </View>
  );
});

export default memo(HomeCatchMoment);

const styles = StyleSheet.create({
  tint: { backgroundColor: 'rgba(11,47,92,0.35)' },
  warmCanvas: { position: 'absolute', left: 0, top: 0, width: 2, height: 2, opacity: 0.01 },
  ring: { position: 'absolute', left: 0, top: 0, width: 80, height: 80, borderRadius: 40, borderWidth: 5 },
  halo: { position: 'absolute', left: 0, top: 0, width: 140, height: 140 },
  fxFill: { width: '100%', height: '100%' },
  flash: { position: 'absolute', left: 0, top: 0, width: 220, height: 220 },
  goldAt: { position: 'absolute', left: 0, top: 0 },
  burstSparkle: { position: 'absolute' },
  burstStar: { position: 'absolute', left: -14, top: -14, width: 28, height: 28 },
  inkBurst: { position: 'absolute', left: 0, top: 0, width: INK_SIZE, height: INK_SIZE },
  waterRing: { position: 'absolute', left: 0, top: 0, width: WATER_W, height: WATER_H },
  streamCoin: { position: 'absolute', left: 0, top: 0, width: STREAM_COIN, height: STREAM_COIN },
  vignetteTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 150 },
  vignetteBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 190 },
  barGlow: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: '#fff3b0' },
  gatherSparkle: { position: 'absolute', left: -7, top: -7, width: 14, height: 14 },
  sparkOrigin: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  spark: { position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: 2 },
  item: { position: 'absolute', left: 0, top: 0, width: FIND_ART_SIZE, height: FIND_ART_SIZE },
  itemArt: { width: FIND_ART_SIZE, height: FIND_ART_SIZE },
  itemFallback: { width: FIND_ART_SIZE, height: FIND_ART_SIZE, borderRadius: FIND_ART_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', width: BADGE_WIDTH, height: BADGE_HEIGHT, borderRadius: BADGE_HEIGHT / 2,
    flexDirection: 'row', alignItems: 'center', paddingLeft: STICKER_LEFT + STICKER + 8, paddingRight: 16,
    backgroundColor: '#0b2f5c', borderWidth: 3 },
  sticker: { position: 'absolute', left: STICKER_LEFT, top: -14, width: STICKER, height: STICKER, borderRadius: 16,
    backgroundColor: '#ffffff', borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stickerPhoto: { borderWidth: 5 },
  stickerArt: { width: STICKER - 8, height: STICKER - 8 },
  stickerOver: { position: 'absolute' },
  hiddenCanvas: { opacity: 0 },
  landRing: { position: 'absolute', left: STICKER_LEFT - 8, top: -22, width: STICKER + 16, height: STICKER + 16, borderRadius: 24, borderWidth: 3 },
  badgeCopy: { flex: 1, justifyContent: 'center' },
  badgeTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, color: BRAND.white, fontFamily: 'Shark', fontSize: 15 },
  newPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 2, borderColor: BRAND.white },
  newText: { color: BRAND.white, fontFamily: 'Shark', fontSize: 13, letterSpacing: 0.5 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  fill: { width: '100%', height: 7, borderRadius: 4, transformOrigin: 'left' },
  count: { color: BRAND.white, fontFamily: 'Knockout', fontSize: 14 },
  setName: { color: '#bcd6f5', fontFamily: 'Knockout', fontSize: 14, marginTop: 1 },
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
