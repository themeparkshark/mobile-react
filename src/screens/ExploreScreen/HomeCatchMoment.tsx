import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { PrepItemType } from '../../models/prep-item-type';
import type { RedeemPrepItemResponseType } from '../../models/redeem-prep-item-response-type';
import redeemPrepItem from '../../api/endpoints/me/prep-items/redeem';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { CurrencyContext } from '../../context/CurrencyProvider';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { queueHaptic } from '../../gamekit/Haptics';
import { playLimited, SFX_PRIORITY } from '../../audio/sfxLimiter';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';
import { findDisplayName } from './homeFindCopy';
import { setHomeHuntRankLine } from './homeHuntRankStore';
import { findImageSource, FIND_ART_SIZE } from './PrepItem';
import { burstSparkCount, CATCH_TIMING, catchProgressLine, catchSummary, rarityColor, rarityTier, type CatchSummary } from './findPresentation';
import { catchFind, pickupFix, type CatchResult } from './homeCatch';
import { rideSpec, type PhotoGrade } from './ridePhoto';
import RidePhotoCatch from './ridePhoto/RidePhotoCatch';
import type { RedeemCatchDetails } from '../../api/endpoints/me/prep-items/redeem';

const RIDE_HINT_KEY = 'ride_photo_hint_seen_v1';
let rideHintSeen: boolean | null = null;
/** Development recordings: show the first-catch finger again. */
export function resetRideHintForPreview(): void {
  rideHintSeen = false;
  void AsyncStorage.removeItem(RIDE_HINT_KEY).catch(() => undefined);
}
void AsyncStorage.getItem(RIDE_HINT_KEY).then(value => { rideHintSeen = value === '1'; }).catch(() => { rideHintSeen = false; });

const TICKET_ICON = require('../../../assets/images/ticket-icon.png');
const SFX = {
  pop: require('../../../assets/sounds/firework_pop.mp3'),
  whoosh: require('../../../assets/sounds/whoosh.mp3'),
  land: require('../../../assets/sounds/coin.mp3'),
  reveal: require('../../../assets/sounds/reveal.mp3'),
};

export interface CatchRequest {
  readonly item: PrepItemType;
  readonly pivotId: number;
  /** The find's spot in this layer's coordinates; null falls back to the layer centre. */
  readonly from: { x: number; y: number } | null;
  /** Bumped on retry so the same find can play again. */
  readonly attempt: number;
}

/** The collection badge: a 60 pt pill, centred, this far above the layer's bottom edge. */
const BADGE_HEIGHT = 60;
const BADGE_WIDTH = 270;
const BADGE_ICON = 48;
const BADGE_ICON_LEFT = 6;

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

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

/**
 * The catch: tap, the find pops with a burst, flies in an arc into a small
 * collection badge, and the badge shows NEW! (in the rarity colour) on a first
 * find and ticks the set's progress. About 3 s, all motion on the UI thread,
 * and it never blocks the map: the layer ignores touches.
 */
export default function HomeCatchMoment({ request, badgeBottom, redeem = redeemPrepItem, onCollected, onUnavailable,
  onDone, onFailed, mapFocus, autoShots }: {
  /** Development recordings only (see RidePhotoCatch). */
  readonly autoShots?: number[] | null;
  readonly request: CatchRequest | null;
  readonly badgeBottom: number;
  /** 0..1: the map behind leans in (scale) while a Ride Photo is open. */
  readonly mapFocus?: SharedValue<number>;
  readonly redeem?: typeof redeemPrepItem;
  readonly onCollected: (data: RedeemPrepItemResponseType['data']) => void;
  readonly onUnavailable: () => void;
  /** The moment is over; `caught` is false after a failure (the marker shows again). */
  readonly onDone: (caught: boolean) => void;
  /** A plain line for the slim chip; `retryable` when tapping again could work. */
  readonly onFailed: (line: string, retryable: boolean) => void;
}) {
  const reducedMotion = useReducedGameMotion();
  const { refreshPlayer } = useContext(AuthContext);
  const { location, latestLocationSampleRef } = useContext(LocationContext);
  const { currencies } = useContext(CurrencyContext);
  const { triggerFly } = useCurrencyFly();
  const { playSound } = useContext(SoundEffectContext);
  const layerRef = useRef<View>(null);
  const [layer, setLayer] = useState({ width: 0, height: 0 });
  const [summary, setSummary] = useState<CatchSummary | null>(null);
  const [showing, setShowing] = useState<CatchRequest | null>(null);
  const [ride, setRide] = useState<{ key: number; closing: boolean; hint: boolean } | null>(null);
  const redeemRun = useRef<Promise<CatchResult> | null>(null);
  const aliveRef = useRef(0);

  const pop = useSharedValue(0);
  const lift = useSharedValue(0);
  const wobble = useSharedValue(0);
  const fly = useSharedValue(0);
  const itemGone = useSharedValue(0);
  const badgeIn = useSharedValue(0);
  const badgeKick = useSharedValue(1);
  const progress = useSharedValue(0);
  const reveal = useSharedValue(0);
  const blur = useSharedValue(0);
  const flyFromX = useSharedValue(0);
  const flyFromY = useSharedValue(0);

  const latest = useRef({ location, latestLocationSampleRef, currencies, playSound, triggerFly, refreshPlayer,
    onCollected, onUnavailable, onDone, onFailed, redeem, reducedMotion });
  latest.current = { location, latestLocationSampleRef, currencies, playSound, triggerFly, refreshPlayer,
    onCollected, onUnavailable, onDone, onFailed, redeem, reducedMotion };

  const sfx = (name: keyof typeof SFX, priority: number) => {
    playLimited(`catch-${name}`, { priority, durationMs: 700, dropIfActive: name === 'whoosh' },
      () => { latest.current.playSound(SFX[name]); });
  };

  const fromPoint = (req: CatchRequest | null) => req?.from ?? { x: layer.width / 2, y: layer.height * 0.45 };
  const badgeLeft = (layer.width - BADGE_WIDTH) / 2;
  const target = {
    x: badgeLeft + BADGE_ICON_LEFT + BADGE_ICON / 2,
    y: layer.height - badgeBottom - BADGE_HEIGHT / 2,
  };

  /** Steps 2 and 3, shared by every catch style: fly into the badge, then the reveal. */
  const land = useCallback(async (item: PrepItemType, data: RedeemPrepItemResponseType['data'], token: number) => {
    const motion = !latest.current.reducedMotion;
    const next = catchSummary(item, data);
    setSummary(next);
    if (data.hunt_week?.rank_line) setHomeHuntRankLine(data.hunt_week.rank_line);
    latest.current.onCollected(data);
    latest.current.refreshPlayer().catch(() => undefined);

    progress.value = next.progressFrom;
    badgeIn.value = motion ? withSpring(1, { damping: 14, stiffness: 220 }) : withTiming(1, { duration: 120 });
    if (!data.replayed) sfx('whoosh', SFX_PRIORITY.whoosh);
    fly.value = withTiming(1, { duration: motion ? CATCH_TIMING.fly : 1, easing: Easing.inOut(Easing.cubic) });
    await wait(motion ? CATCH_TIMING.fly : 60);
    if (aliveRef.current !== token) return;

    itemGone.value = withTiming(1, { duration: 80 });
    const tier = rarityTier(data.item?.rarity ?? item.rarity);
    queueHaptic(tier >= 4 ? 'comboHeavy' : 'success', 4);
    sfx(next.isNew ? 'reveal' : 'land', SFX_PRIORITY.land);
    badgeKick.value = motion ? withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 300 })) : 1;
    progress.value = withTiming(next.progressTo, { duration: motion ? 520 : 1, easing: Easing.out(Easing.cubic) });
    reveal.value = motion ? withSpring(1, { damping: 10, stiffness: 240 }) : 1;

    // Rewards fly from the badge to the header counters.
    if (!data.replayed) {
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
    }

    await wait(CATCH_TIMING.reveal + CATCH_TIMING.hold);
    if (aliveRef.current !== token) return;
    badgeIn.value = withTiming(0, { duration: CATCH_TIMING.exit });
    await wait(CATCH_TIMING.exit);
    if (aliveRef.current === token) { setShowing(null); setSummary(null); setRide(null); latest.current.onDone(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.x, target.y]);

  const focusMap = (on: boolean) => {
    const motion = !latest.current.reducedMotion;
    blur.value = withTiming(on ? 1 : 0, { duration: motion ? (on ? 380 : 300) : 1, easing: Easing.out(Easing.cubic) });
    if (mapFocus) mapFocus.value = motion ? (on ? withSpring(1, { damping: 18, stiffness: 120 }) : withTiming(0, { duration: 320 })) : 0;
  };

  useEffect(() => {
    if (!request || layer.width === 0) return;
    const token = ++aliveRef.current;
    const alive = () => aliveRef.current === token;
    const { item, pivotId } = request;
    const motion = !latest.current.reducedMotion;
    [pop, lift, wobble, fly, itemGone, badgeIn, reveal, progress].forEach(value => { cancelAnimation(value); value.value = 0; });
    badgeKick.value = 1;
    setSummary(null);
    setShowing(request);
    const start = fromPoint(request);
    flyFromX.value = start.x;
    flyFromY.value = start.y;

    // Uncommon and rarer: Ride Photo. The map blurs and leans in, the ride opens out of the find.
    if (rideSpec(item.rarity).style === 'ride_photo') {
      itemGone.value = 1;
      redeemRun.current = null;
      setRide({ key: token, closing: false, hint: rideHintSeen !== true });
      focusMap(true);
      return () => { aliveRef.current += 0; };
    }

    void (async () => {
      // 1. Tap: pop and burst right away, before the server answers.
      queueHaptic('hitMedium', 2);
      sfx('pop', SFX_PRIORITY.tap);
      pop.value = withTiming(1, { duration: motion ? CATCH_TIMING.pop * 2.6 : 1, easing: Easing.out(Easing.quad) });
      lift.value = motion ? withSpring(1, { damping: 9, stiffness: 260 }) : 1;
      wobble.value = motion ? withDelay(CATCH_TIMING.pop, withSequence(
        withTiming(1, { duration: 90 }), withTiming(-1, { duration: 120 }), withTiming(0.6, { duration: 110 }),
        withTiming(0, { duration: 90 }))) : 0;
      const fix = pickupFix(latest.current.latestLocationSampleRef.current, latest.current.location, Date.now());
      const [result] = await Promise.all([
        catchFind(latest.current.redeem, item.id, pivotId, fix, { catch_style: 'chomp' }),
        wait(CATCH_TIMING.pop + CATCH_TIMING.minHover),
      ]);
      if (!alive()) return;

      if (result.kind !== 'caught') {
        queueHaptic('failBuzz', 3);
        wobble.value = motion ? withSequence(withTiming(1, { duration: 60 }), withTiming(-1, { duration: 80 }),
          withTiming(1, { duration: 80 }), withTiming(0, { duration: 60 })) : 0;
        lift.value = withTiming(0, { duration: 220 });
        await wait(300);
        if (!alive()) return;
        itemGone.value = withTiming(1, { duration: 160 });
        if (result.kind === 'gone') latest.current.onUnavailable();
        latest.current.onFailed(result.line, result.kind === 'failed');
        await wait(170);
        if (alive()) { setShowing(null); latest.current.onDone(false); }
        return;
      }
      await land(item, result.data, token);
    })();
  // A new request (or a retry of the same find) starts a fresh moment.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.pivotId, request?.attempt, layer.width > 0]);

  // ── Ride Photo hand-offs ───────────────────────────────────────────────
  const onRideCaught = useCallback((details: RedeemCatchDetails, _grade: PhotoGrade) => {
    const req = request;
    if (!req) return;
    if (rideHintSeen !== true) { rideHintSeen = true; void AsyncStorage.setItem(RIDE_HINT_KEY, '1').catch(() => undefined); }
    const fix = pickupFix(latest.current.latestLocationSampleRef.current, latest.current.location, Date.now());
    // The server call runs while the photo develops, so the wait hides inside the suspense beats.
    redeemRun.current = catchFind(latest.current.redeem, req.item.id, req.pivotId, fix, details);
  }, [request]);

  const closeRide = (caught: boolean) => {
    setRide(current => (current ? { ...current, closing: true } : current));
    focusMap(false);
    if (!caught) setTimeout(() => setRide(null), 320);
  };

  const onPrintReady = useCallback(async (at: { x: number; y: number }) => {
    const req = request;
    const token = aliveRef.current;
    if (!req || !redeemRun.current) return;
    const result = await redeemRun.current;
    if (aliveRef.current !== token) return;
    if (result.kind !== 'caught') {
      queueHaptic('failBuzz', 3);
      closeRide(false);
      if (result.kind === 'gone') latest.current.onUnavailable();
      latest.current.onFailed(result.line, result.kind === 'failed');
      setTimeout(() => { if (aliveRef.current === token) { setShowing(null); latest.current.onDone(false); } }, 320);
      return;
    }
    // The photo becomes the find again and flies into the badge as the ride folds away.
    flyFromX.value = at.x;
    flyFromY.value = at.y;
    lift.value = 0.4;
    itemGone.value = 0;
    closeRide(true);
    await land(req.item, result.data, token);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, land]);

  const onRodeOff = useCallback(() => {
    const token = aliveRef.current;
    queueHaptic('warning', 3);
    closeRide(false);
    latest.current.onFailed('It rode off. Might be back tomorrow.', false);
    setTimeout(() => { if (aliveRef.current === token) { setShowing(null); latest.current.onDone(false); } }, 320);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const from = fromPoint(showing);
  const itemStyle = useAnimatedStyle(() => {
    const f = fly.value;
    const fx0 = flyFromX.value, fy0 = flyFromY.value;
    const arc = Math.min(180, Math.max(90, Math.abs(target.y - fy0) * 0.45));
    const x = fx0 + (target.x - fx0) * f;
    const y = fy0 + (target.y - fy0) * f - arc * 4 * f * (1 - f) - 18 * lift.value * (1 - f);
    const grow = 1 + 0.45 * lift.value;
    const shrink = 1 - 0.55 * f;
    return {
      opacity: 1 - itemGone.value,
      transform: [{ translateX: x - FIND_ART_SIZE / 2 }, { translateY: y - FIND_ART_SIZE / 2 },
        { rotate: `${wobble.value * 14 + f * 200}deg` }, { scale: grow * shrink }],
    };
  });
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pop.value <= 0 || pop.value >= 1 ? 0 : 0.9 * (1 - pop.value),
    transform: [{ translateX: from.x - 40 }, { translateY: from.y - 40 }, { scale: 0.4 + 1.8 * pop.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: pop.value <= 0 ? 0 : Math.max(0, 0.85 - pop.value * 3),
    transform: [{ translateX: from.x - 36 }, { translateY: from.y - 36 }, { scale: 0.6 + pop.value }],
  }));
  const sparkOrigin = useAnimatedStyle(() => ({ transform: [{ translateX: from.x }, { translateY: from.y }] }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badgeIn.value,
    transform: [{ translateY: (1 - badgeIn.value) * 40 }, { scale: 0.9 + 0.1 * badgeIn.value }],
  }));
  const iconKick = useAnimatedStyle(() => ({ transform: [{ scale: badgeKick.value }] }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, progress.value) }] }));
  const newStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, reveal.value * 1.4),
    transform: [{ translateY: (1 - reveal.value) * 12 }, { scale: 0.6 + 0.4 * reveal.value }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: blur.value }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayer(current => (current.width === width && current.height === height ? current : { width, height }));
  };

  const item = showing?.item ?? null;
  const art = item ? findImageSource(item) : null;
  const color = item ? rarityColor(item.rarity) : BRAND.gold;
  const sparks = item && !reducedMotion ? burstSparkCount(item.rarity) : 0;
  const progressLine = summary ? catchProgressLine(summary) : null;
  const name = item ? findDisplayName(item.name, item.set_name) : '';

  return (
    <View ref={layerRef} collapsable={false} pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={onLayout}
      accessibilityLiveRegion="polite">
      {ride && <>
        {/* Animating a BlurView's intensity is unreliable on iOS; fade a fixed blur instead. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, scrimStyle]}>
          <BlurView tint="systemThinMaterialDark" intensity={55} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </Animated.View>
      </>}
      {ride && item && <RidePhotoCatch key={ride.key} item={item} art={artSource(art)} from={showing?.from ?? null} layer={layer}
        reducedMotion={reducedMotion} showHint={ride.hint} closing={ride.closing}
        onCaught={onRideCaught} onPrintReady={onPrintReady} onRodeOff={onRodeOff} autoShots={autoShots} />}
      {item && <>
        <Animated.View style={[styles.flash, flashStyle]} />
        <Animated.View style={[styles.ring, { borderColor: color }, ringStyle]} />
        <Animated.View style={[styles.sparkOrigin, sparkOrigin]}>
          {Array.from({ length: sparks }, (_, index) =>
            <Spark key={index} index={index} count={sparks} pop={pop} color={color} />)}
        </Animated.View>
        <Animated.View style={[styles.item, itemStyle]}>
          {art ? <Image source={art} style={styles.itemArt} contentFit="contain" transition={0} />
            : <View style={[styles.itemFallback, { backgroundColor: color }]}><GameIcon name="gift" size={30} /></View>}
        </Animated.View>
        <Animated.View style={[styles.badge, { left: badgeLeft, bottom: badgeBottom,
          borderColor: summary?.setColor ?? BRAND.white }, badgeStyle]}
          accessibilityLabel={summary ? `Caught ${name}${summary.isNew ? ', new' : ''}. ${progressLine ?? ''}` : undefined}>
          <Animated.View style={[styles.badgeIcon, { backgroundColor: summary?.setColor ?? BRAND.gold }, iconKick]}>
            {art ? <Image source={art} style={styles.badgeArt} contentFit="contain" transition={0} />
              : <GameIcon name="gift" size={26} />}
          </Animated.View>
          <View style={styles.badgeCopy}>
            <View style={styles.badgeTop}>
              {summary?.isNew && <Animated.View style={[styles.newPill, { backgroundColor: summary.rarityColor }, newStyle]}>
                <Text style={styles.newText}>NEW!</Text>
              </Animated.View>}
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
            </View>
            <View style={styles.track}>
              <Animated.View style={[styles.fill, { backgroundColor: summary?.setColor ?? BRAND.gold }, barStyle]} />
            </View>
            {progressLine && <Text style={styles.progress} numberOfLines={1}>
              {progressLine}{summary && !summary.isNew && !summary.complete ? ' · spare copy' : ''}
            </Text>}
          </View>
        </Animated.View>
      </>}
    </View>
  );
}

/** expo-image source to a Skia image source (a bundled module id or a URL). */
function artSource(art: unknown): number | { uri: string } | null {
  if (typeof art === 'number') return art;
  if (art && typeof art === 'object' && typeof (art as { uri?: unknown }).uri === 'string') return { uri: (art as { uri: string }).uri };
  return null;
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(6,52,110,0.22)' },
  flash: { position: 'absolute', left: 0, top: 0, width: 72, height: 72, borderRadius: 36, backgroundColor: BRAND.white },
  ring: { position: 'absolute', left: 0, top: 0, width: 80, height: 80, borderRadius: 40, borderWidth: 5 },
  sparkOrigin: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  spark: { position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: 2 },
  item: { position: 'absolute', left: 0, top: 0, width: FIND_ART_SIZE, height: FIND_ART_SIZE,
    shadowColor: BRAND.navy, shadowOffset: { width: 0, height: 4 }, shadowRadius: 2, shadowOpacity: 0.35 },
  itemArt: { width: FIND_ART_SIZE, height: FIND_ART_SIZE },
  itemFallback: { width: FIND_ART_SIZE, height: FIND_ART_SIZE, borderRadius: FIND_ART_SIZE / 2,
    alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', width: BADGE_WIDTH, height: BADGE_HEIGHT, borderRadius: BADGE_HEIGHT / 2,
    flexDirection: 'row', alignItems: 'center', paddingLeft: BADGE_ICON_LEFT, paddingRight: 16,
    backgroundColor: 'rgba(5,52,110,0.94)', borderWidth: 3,
    shadowColor: BRAND.shadow, shadowOffset: { width: 0, height: 4 }, shadowRadius: 0, shadowOpacity: 0.3 },
  badgeIcon: { width: BADGE_ICON, height: BADGE_ICON, borderRadius: BADGE_ICON / 2, alignItems: 'center',
    justifyContent: 'center', borderWidth: 2, borderColor: BRAND.white },
  badgeArt: { width: 38, height: 38 },
  badgeCopy: { flex: 1, marginLeft: 10, justifyContent: 'center' },
  badgeTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newPill: { borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1.5, borderColor: BRAND.white },
  newText: { color: BRAND.white, fontFamily: 'Shark', fontSize: 11, letterSpacing: 0.5 },
  name: { flexShrink: 1, color: BRAND.white, fontFamily: 'Shark', fontSize: 14 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 5, overflow: 'hidden' },
  fill: { width: '100%', height: 6, borderRadius: 3, transformOrigin: 'left' },
  progress: { color: '#d6efff', fontFamily: 'Knockout', fontSize: 12, marginTop: 2 },
});
