import { forwardRef, memo, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Canvas, Group, Image as SkImageNode, Picture, Rect, RadialGradient, vec, type SkImage } from '@shopify/react-native-skia';

const WARM_SCALE = [{ scale: 0.01 }];
/** Stamp art per ride (the ride's own vehicle). Unbuilt rides show a lock instead. */
const RIDE_STAMP: Partial<Record<RideKind, number>> = {
  coaster: require('../../../assets/images/ride-photo/car-back.webp'),
  flume: require('../../../assets/images/ride-photo/log-boat.webp'),
  teacups: require('../../../assets/images/ride-photo/teacup-back.webp'),
};
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
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
import { findDisplayName } from './homeFindCopy';
import { setHomeHuntRankLine } from './homeHuntRankStore';
import { findImageSource, FIND_ART_SIZE } from './PrepItem';
import { burstSparkCount, CATCH_TIMING, catchSummary, rarityColor, rarityTier, type CatchSummary } from './findPresentation';
import { catchFind, type CatchResult } from './homeCatch';
import { GRADE_LABEL, GRADE_STARS, rideSpec, type PhotoGrade } from './ridePhoto';
import { Sunburst } from '../../gamekit/fx/ShaderFx';
import RidePhotoCatch, { BLANK_IMAGE, prebuildRideStage, warmStagePicture, type RideStageHandle } from './ridePhoto/RidePhotoCatch';
import { useRideArt } from './ridePhoto/rideAssets';
import { catchHaptic, catchMark, catchSound } from './ridePhoto/catchAudio';
import { setCatchOpen, showCatchChrome } from './catchPresence';
import { READY_RIDES, RIDES, rideStamps, ridesSnappedLine, type RideKind, type Sky } from './ridePhoto/rides';
import { loadRideMemory, recordRide, ridesSnapped } from './ridePhoto/rides/rideMemory';

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
  /** The moment is over; `caught` is false after a failure or a close (the find shows again). */
  readonly onDone: (caught: boolean) => void;
  /** A plain line for the slim chip; `retryable` when tapping again could work. */
  readonly onFailed: (line: string, retryable: boolean) => void;
  /** Development recordings only (see RidePhotoCatch). */
  readonly autoShots?: number[] | null;
  /** Development recordings: pin the ride and sky. */
  readonly forceRide?: { readonly kind?: RideKind; readonly sky?: Sky } | null;
  /** Ride Photo finds to warm in idle time (their stages are built before any tap). */
  /** The reward banner is on the map (map markers under it hide their tags). */
  readonly onCascade?: (active: boolean) => void;
  /** Development recordings: play this catch as if Reduce Motion were on. */
  readonly forceReducedMotion?: boolean;
  readonly warm?: readonly { readonly item: PrepItemType; readonly forceRide?: { readonly kind?: RideKind; readonly sky?: Sky } | null }[];
  /** Refresh the signed-in player after a catch (off in signed-out dev previews). */
  readonly refreshAfterCatch?: boolean;
}>(function HomeCatchMoment({ request, stageItem = null, badgeBottom, redeem = redeemPrepItem, getFix, mapStill = null,
  onCollected, onUnavailable, onDone, onFailed, autoShots, forceRide, warm, onCascade, forceReducedMotion = false, refreshAfterCatch = true }, ref) {
  const systemReduced = useReducedGameMotion();
  // Development recordings can show one catch with Reduce Motion on.
  const reducedMotion = (__DEV__ && forceReducedMotion) || systemReduced;
  const { refreshPlayer } = useContext(AuthContext);
  const { currencies } = useContext(CurrencyContext);
  const { triggerFly } = useCurrencyFly();
  const layerRef = useRef<View>(null);
  const stage = useRef<RideStageHandle>(null);
  const [layer, setLayer] = useState({ width: 0, height: 0 });
  const [summary, setSummary] = useState<CatchSummary | null>(null);
  const [showing, setShowing] = useState<CatchRequest | null>(null);
  const [ride, setRide] = useState<{ key: number; closing: boolean; hint: boolean; flyTo: { x: number; y: number } | null } | null>(null);
  const [rideItem, setRideItem] = useState<PrepItemType | null>(null);
  const [linger, setLinger] = useState<PrepItemType | null>(null);
  const rideItemRef = useRef<PrepItemType | null>(null);
  rideItemRef.current = rideItem;
  const [primed, setPrimed] = useState<{ item: PrepItemType; from: { x: number; y: number } | null } | null>(null);
  const [photo, setPhoto] = useState<{ image: SkImage | null; grade: PhotoGrade } | null>(null);
  const [cascade, setCascade] = useState(0);
  const [bonusXp, setBonusXp] = useState<number | null>(null);
  // The Ride Photo layer covers the whole screen (the header and tab bar slide away), so it is offset by
  // where this map container sits in the window.
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const redeemRun = useRef<Promise<CatchResult> | null>(null);
  const aliveRef = useRef(0);

  const pop = useSharedValue(0);
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

  const latest = useRef({ getFix, currencies, triggerFly, refreshPlayer, onCollected, onUnavailable, onDone, onFailed, redeem, reducedMotion, onCascade });
  latest.current = { getFix, currencies, triggerFly, refreshPlayer, onCollected, onUnavailable, onDone, onFailed, redeem, reducedMotion, onCascade };

  const badgeLeft = (layer.width - BADGE_WIDTH) / 2;
  const target = { x: badgeLeft + STICKER_LEFT + STICKER / 2, y: layer.height - badgeBottom - BADGE_HEIGHT / 2 - 8 };
  const fromPoint = (req: CatchRequest | null) => req?.from ?? { x: layer.width / 2, y: layer.height * 0.45 };

  // The map steps back: a cached blurred still, a navy tint and a vignette, never a live blur or a per-open snapshot.
  const showBackdrop = useCallback((on: boolean) => {
    backdrop.value = withTiming(on ? 1 : 0, { duration: latest.current.reducedMotion ? 1 : on ? 160 : 260 });
  }, [backdrop]);

  useImperativeHandle(ref, () => ({
    primeRide: (item, from) => {
      if (rideSpec(item.rarity).style !== 'ride_photo' || layer.width === 0) return false;
      setRideItem(item);
      const full = from ? { x: from.x + offset.x, y: from.y + offset.y } : null;
      setPrimed({ item, from: full });
      // Only the UI-thread chrome slide on the tap frame; React catch state commits once the map is covered.
      showCatchChrome(true);
      showBackdrop(true);
      return true;
    },
  }), [layer.width, showBackdrop, offset.x, offset.y]);

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
    if (data.hunt_week?.rank_line) setHomeHuntRankLine(data.hunt_week.rank_line);
    latest.current.onCollected(data);
    if (refreshAfterCatch) latest.current.refreshPlayer().catch(() => undefined);
    progress.value = next.progressFrom;
    // Via the print, the pad stays fully hidden until the print lands (arrive() springs it in with the kick).
    const pad = motion ? withSpring(1, { damping: 16, stiffness: 240 }) : withTiming(1, { duration: 120 });
    if (!viaPrint) badgeIn.value = pad;
    if (!viaPrint) {
      if (!data.replayed) catchSound('whoosh', { volume: 0.6 });
      fly.value = withTiming(1, { duration: motion ? CATCH_TIMING.fly : 1, easing: Easing.inOut(Easing.cubic) });
      await wait(motion ? CATCH_TIMING.fly : 60);
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
    if (badgeIn.value < 0.5) badgeIn.value = motion ? withSpring(1, { damping: 14, stiffness: 320 }) : withTiming(1, { duration: 1 });
    catchHaptic(tier >= 4 ? 'comboHeavy' : 'success', 4);
    badgeKick.value = motion ? withSequence(withTiming(1.22, { duration: 100 }), withSpring(1, { damping: 7, stiffness: 300 })) : 1;
    ringPop.value = 0;
    ringPop.value = withTiming(1, { duration: motion ? 520 : 1 });
    const beats: (() => void)[] = [];
    if (next.isNew) beats.push(() => { reveal.value = motion ? withSpring(1, { damping: 9, stiffness: 260 }) : 1; });
    beats.push(() => { progress.value = withTiming(next.progressTo, { duration: motion ? 420 : 1, easing: Easing.out(Easing.cubic) }); });
    beats.push(() => { gradeIn.value = motion ? withSpring(1, { damping: 10, stiffness: 260 }) : 1; });
    if (newRideRef.current) beats.push(() => { rideIn.value = motion ? withSpring(1, { damping: 10, stiffness: 240 }) : 1; });
    if (!data.replayed) beats.push(() => {
      layerRef.current?.measureInWindow((x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const startX = x + target.x, startY = y + target.y;
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
    for (let i = 0; i < beats.length; i++) {
      await wait(120);
      if (aliveRef.current !== token) return;
      setCascade(i + 1);
      beats[i]();
      catchSound('tick', { pitch: 2 + i * 2, volume: 0.7 });
    }
    AccessibilityInfo.announceForAccessibility(`Caught ${next.setName ? `for ${next.setName}` : ''}${next.isNew ? ', new' : ''}`);
    await wait(1300);
    if (aliveRef.current !== token) return;
    badgeIn.value = withTiming(0, { duration: CATCH_TIMING.exit });
    await wait(CATCH_TIMING.exit);
    if (aliveRef.current === token) finish(true);
  }, [target.x, target.y]); // eslint-disable-line react-hooks/exhaustive-deps

  // The photo sticker's image is native memory; free it once the sticker has re-rendered without it.
  const photoRef = useRef<SkImage | null>(null);
  photoRef.current = photo?.image ?? null;
  const releasePhoto = () => {
    const image = photoRef.current ?? pendingPhoto.current?.image ?? null;
    pendingPhoto.current = null;
    if (image) setTimeout(() => image.dispose(), 500);
  };

  const finish = (caught: boolean) => {
    catchMark('done');
    latest.current.onCascade?.(false);
    releasePhoto();
    newRideRef.current = false; setNewRide(null); rideIn.value = 0;
    // rideItem clears too: the next find never inherits this one's rarity, speed or hint rules. The stage keeps
    // showing the finished ride (hidden) for 1.2 s, so the next find's stage is never built in the hand-back;
    // it is prebuilt at +600 ms and swapped in after.
    setLinger(rideItemRef.current); setTimeout(() => setLinger(null), 1200);
    setShowing(null); setSummary(null); setRide(null); setPrimed(null); setRideItem(null); setPhoto(null); setCascade(0);
    reveal.value = 0; gradeIn.value = 0;
    showCatchChrome(false);
    setCatchOpen(false);
    latest.current.onDone(caught);
  };

  useEffect(() => {
    if (!request || layer.width === 0) return;
    const token = ++aliveRef.current;
    const alive = () => aliveRef.current === token;
    const { item, pivotId } = request;
    const motion = !latest.current.reducedMotion;
    [pop, lift, wobble, fly, badgeIn, reveal, progress, gradeIn].forEach(value => { cancelAnimation(value); value.value = 0; });
    badgeKick.value = 1;
    setSummary(null); setPhoto(null); setCascade(0); setBonusXp(null);
    setShowing(request);
    showCatchChrome(true);
    const start = fromPoint(request);
    flyFromX.value = start.x;
    flyFromY.value = start.y;

    // Uncommon and rarer: the Ride Photo viewfinder (usually already opening from the tap).
    if (rideSpec(item.rarity).style === 'ride_photo') {
      itemGone.value = 1;
      redeemRun.current = null;
      setRideItem(item);
      setRide({ key: token, closing: false, hint: rideHintSeen !== true, flyTo: null });
      if (!primed) showBackdrop(true);
      return;
    }
    itemGone.value = 0;
    setCatchOpen(true);

    void (async () => {
      catchHaptic('hitMedium', 2);
      catchSound('pop');
      pop.value = withTiming(1, { duration: motion ? CATCH_TIMING.pop * 2.6 : 1, easing: Easing.out(Easing.quad) });
      lift.value = motion ? withSpring(1, { damping: 9, stiffness: 260 }) : 1;
      wobble.value = motion ? withDelay(CATCH_TIMING.pop, withSequence(
        withTiming(1, { duration: 90 }), withTiming(-1, { duration: 120 }), withTiming(0.6, { duration: 110 }),
        withTiming(0, { duration: 90 }))) : 0;
      const [result] = await Promise.all([
        catchFind(latest.current.redeem, item.id, pivotId, latest.current.getFix(), { catch_style: 'chomp' }),
        wait(CATCH_TIMING.pop + CATCH_TIMING.minHover),
      ]);
      if (!alive()) return;
      if (result.kind !== 'caught') {
        catchHaptic('failBuzz', 3);
        lift.value = withTiming(0, { duration: 220 });
        await wait(300);
        if (!alive()) return;
        itemGone.value = withTiming(1, { duration: 160 });
        if (result.kind === 'gone') latest.current.onUnavailable();
        latest.current.onFailed(result.line, result.kind === 'failed');
        await wait(170);
        if (alive()) finish(false);
        return;
      }
      await land(item, result.data, token, false);
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
    if (!caught) setTimeout(() => setRide(null), 420);
  };

  // "Rides snapped": a ride the player never snapped before gets a "New ride!" beat in the cascade.
  const rideKindRef = useRef<RideKind | null>(null);
  const [newRide, setNewRide] = useState<{ name: string; line: string; stamps: ReturnType<typeof rideStamps> } | null>(null);
  const newRideRef = useRef(false);
  useEffect(() => { void loadRideMemory(); }, []);

  const soundScheduled = useRef(false);
  const pendingPhoto = useRef<{ image: SkImage | null; grade: PhotoGrade } | null>(null);
  const pendingLand = useRef<{ data: RedeemPrepItemResponseType['data']; token: number; item: PrepItemType } | null>(null);
  const onPrintReady = useCallback(async (grade: PhotoGrade, image: SkImage | null) => {
    const req = request;
    const token = aliveRef.current;
    if (!req || !redeemRun.current) return;
    const result = await redeemRun.current;
    if (aliveRef.current !== token) return;
    if (result.kind !== 'caught') {
      catchHaptic('failBuzz', 3);
      closeRide(false);
      if (result.kind === 'gone') latest.current.onUnavailable();
      latest.current.onFailed(result.line, result.kind === 'failed');
      setTimeout(() => { if (aliveRef.current === token) finish(false); }, 320);
      return;
    }
    // One hand-off: the viewfinder irises out behind the print, which flies into the badge on the map.
    const kind = rideKindRef.current;
    const served = (result.data.dex as { rides_snapped?: string[] } | null | undefined)?.rides_snapped ?? null;
    const fresh = kind ? recordRide(kind, served) : false;
    newRideRef.current = fresh;
    setNewRide(fresh && kind ? { name: RIDES[kind].name, line: ridesSnappedLine(ridesSnapped()), stamps: rideStamps(ridesSnapped(), kind) } : null);
    // The sticker keeps the item art until the print lands: the photo is never on screen twice.
    pendingPhoto.current = { image, grade };
    pendingLand.current = { data: result.data, token, item: req.item };
    closeRide(true);
    // The landing thunk is scheduled by the stage on the JS clock, in the same turn the 460 ms flight
    // starts (the UI completion still drives the kick and the cascade).
    soundScheduled.current = true;
    setRide(current => (current ? { ...current, flyTo: { x: target.x + offset.x, y: target.y + offset.y } } : current));
    await land(req.item, result.data, token, true);
  }, [request, land, target.x, target.y, offset.x, offset.y]); // eslint-disable-line react-hooks/exhaustive-deps

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
    latest.current.onFailed('It rode off. Might be back tomorrow.', false);
    setTimeout(() => { if (aliveRef.current === token) finish(false); }, 320);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The viewfinder covers the map: the React-level catch state (map chrome, ambient pause) commits unseen.
  const onCovered = useCallback(() => setCatchOpen(true), []);
  const onChromeBack = useCallback(() => showCatchChrome(false), []);
  const onIrisClosed = useCallback(() => { showCatchChrome(false); setCatchOpen(false); }, []);

  const onClose = useCallback(() => {
    const token = ++aliveRef.current;
    closeRide(false);
    setTimeout(() => { if (aliveRef.current === token) finish(false); }, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Styles ─────────────────────────────────────────────────────────────
  const from = fromPoint(showing);
  const itemStyle = useAnimatedStyle(() => {
    const f = fly.value;
    const fx0 = flyFromX.value, fy0 = flyFromY.value;
    const arc = Math.min(180, Math.max(90, Math.abs(target.y - fy0) * 0.45));
    const x = fx0 + (target.x - fx0) * f;
    const y = fy0 + (target.y - fy0) * f - arc * 4 * f * (1 - f) - 18 * lift.value * (1 - f);
    return {
      opacity: 1 - itemGone.value,
      transform: [{ translateX: x - FIND_ART_SIZE / 2 }, { translateY: y - FIND_ART_SIZE / 2 },
        { rotate: `${wobble.value * 14 + f * 200}deg` }, { scale: (1 + 0.45 * lift.value) * (1 - 0.55 * f) }],
    };
  });
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pop.value <= 0 || pop.value >= 1 ? 0 : 0.9 * (1 - pop.value),
    transform: [{ translateX: from.x - 40 }, { translateY: from.y - 40 }, { scale: 0.4 + 1.8 * pop.value }],
  }));
  const sparkOrigin = useAnimatedStyle(() => ({ transform: [{ translateX: from.x }, { translateY: from.y }] }));
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

  const item = showing?.item ?? null;
  const art = item ? findImageSource(item) : null;
  const color = item ? rarityColor(item.rarity) : BRAND.gold;
  const sparks = item && !reducedMotion && rideSpec(item.rarity).style === 'chomp' ? burstSparkCount(item.rarity) : 0;
  const name = item ? findDisplayName(item.name, item.set_name) : '';
  const stageFor = rideItem ?? primed?.item ?? linger ?? stageItem;
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
  // Next-find stages are never built during a reward: they wait until the catch layer is idle, plus 600 ms.
  const rewardBusy = !!request || !!primed || !!ride || !!showing;
  useEffect(() => {
    if (!warm || window.width === 0 || rewardBusy) return;
    const timer = setTimeout(() => {
      for (const entry of warm) {
        if (rideSpec(entry.item.rarity).style !== 'ride_photo') continue;
        prebuildRideStage(entry.item, entry.forceRide ?? null, { width: window.width, height: window.height }, insets, sceneArt);
      }
    }, 600);
    return () => clearTimeout(timer);
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
        onCaught={onRideCaught} onPrintReady={onPrintReady} onPrintLanded={onPrintLanded} onRodeOff={onRodeOff} onClose={onClose} onCovered={onCovered} onIrisClosed={onIrisClosed} onChromeBack={onChromeBack}
        autoShots={autoShots} forceRide={forceRide} /></View>}

      {item && <>
        <Animated.View style={[styles.ring, { borderColor: color }, ringStyle]} pointerEvents="none" />
        <Animated.View style={[styles.sparkOrigin, sparkOrigin]} pointerEvents="none">
          {Array.from({ length: sparks }, (_, index) => <Spark key={index} index={index} count={sparks} pop={pop} color={color} />)}
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
    </View>
  );
});

export default memo(HomeCatchMoment);

const styles = StyleSheet.create({
  tint: { backgroundColor: 'rgba(11,47,92,0.35)' },
  warmCanvas: { position: 'absolute', left: 0, top: 0, width: 2, height: 2, opacity: 0.01 },
  ring: { position: 'absolute', left: 0, top: 0, width: 80, height: 80, borderRadius: 40, borderWidth: 5 },
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
