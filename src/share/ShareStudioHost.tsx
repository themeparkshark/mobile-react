/**
 * ShareStudioHost shows the queued request as either
 *   - the Flex moment (after an earn): rays, the card slams in with a burst of
 *     Alex's stars, the brag number counts up, the shark pops in, Share rises; or
 *   - the Flex sheet (re-share): live preview, Story / Square, Share.
 * Both capture a full-size off-screen copy of the card and open the OS share
 * sheet. Nothing else leaves the device except the no-PII share event.
 *
 * Root mounts one host. A screen that is itself an RN Modal mounts
 * <ShareStudioHost portal /> inside it: the newest host shows the request, so
 * the sheet presents from that modal (iOS silently refuses a second
 * presentation from a root that is already presenting). Every sheet also has a
 * watchdog: if it hasn't shown within SHOW_WATCHDOG_MS, the request is dropped
 * so the queue can never wedge.
 */
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withRepeat, withSequence,
  withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { AuthContext } from '../context/AuthProvider';
import { LocationStatusContext } from '../context/LocationProvider';
import { playSfx } from '../gamekit/SFX';
import * as Haptics from '../helpers/haptics';
import { BRAND, GameButton, gameAlert } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { isDimFlashingLightsEnabled } from '../../modules/flash-safety';
import { captureFlex, openShareSheet } from './capture';
import { flexCopy } from './copy';
import { CARD_CHROME, FLEX_SIZE, FlexCard } from './FlexCard';
import { HERO_ART } from './FlexHero';
import { PROP_ART } from './FlexShark';
import { FRAMES } from './frames';
import { shareUrl } from './link';
import { QR_BY_KIND } from './qr';
import { resolveFlexPayload, RESOLVE_BUDGET_MS } from './resolve';
import {
  currentFlex, finishFlex, holdFlex, holdWhileInPark, registerFlexHost, releaseHeldFlex, subscribeFlex,
  subscribeFlexHosts, subscribeWarm, topFlexHost, unregisterFlexHost, warmKinds,
} from './store';
import { BURST, countSteps, countTarget, revealIntensity } from './reveal';
import { useDevAutoPress } from './devDrive';
import { trackShare } from './track';
import type { FlexFormat, FlexPayload, FlexRequest } from './types';

export const REVEAL_TAP_GUARD_MS = 900;
/** A sheet that hasn't appeared by now never will (e.g. presented over a modal): drop it. */
export const SHOW_WATCHDOG_MS = 1500;
/** One close word everywhere. */
export const CLOSE_WORD = 'Nice!';
export const PREVIEW_HOLD_MS = 400;

const FPS_PROBE = __DEV__ && process.env.EXPO_PUBLIC_SHARE_STUDIO_FPS === '1';

export function ShareStudioHost({ portal = false }: { readonly portal?: boolean }) {
  const [hostId] = useState(() => registerFlexHost(portal));
  const [top, setTop] = useState(() => topFlexHost() === hostId);
  useEffect(() => {
    const update = () => setTop(topFlexHost() === hostId);
    const off = subscribeFlexHosts(update);
    update();
    return () => { off(); unregisterFlexHost(hostId); };
  }, [hostId]);
  const [request, setRequest] = useState<FlexRequest | null>(currentFlex);
  useEffect(() => subscribeFlex(() => setRequest(currentFlex())), []);
  // Park-identifying reveals (park day, ride coin) wait until the player has left the park.
  const { park } = useContext(LocationStatusContext);
  const inPark = !!park;
  useEffect(() => { if (top && request && holdWhileInPark(request, inPark)) holdFlex(request.id); }, [top, request, inPark]);
  useEffect(() => { if (top && !inPark) releaseHeldFlex(); }, [top, inPark]);
  const active = top && request && !holdWhileInPark(request, inPark) ? request : null;
  return <>
    {!portal && <WarmChrome />}
    {active && <Resolved key={active.id} request={active} />}
  </>;
}

/** Resolve the payload (art prefetch + percent line, at most 600 ms), then show it. */
function Resolved({ request }: { readonly request: FlexRequest }) {
  const [payload, setPayload] = useState<FlexPayload | null>(null);
  useEffect(() => {
    let live = true;
    void resolveFlexPayload(request.kind, request.payload).then(next => { if (live) setPayload(next); });
    return () => { live = false; };
  }, [request]);
  if (!payload) return null;
  const resolved = { ...request, payload } as FlexRequest;
  return request.mode === 'reveal' ? <FlexMoment request={resolved} /> : <FlexSheet request={resolved} />;
}

/** The props a kind's card can show (warmed with it). */
const KIND_PROPS: Partial<Record<FlexRequest['kind'], readonly (keyof typeof PROP_ART)[]>> = {
  find: ['magnifier'], set_complete: ['treasure'], boss_win: ['foam-finger'], stamp: ['compass'], coin_level: ['coins'],
  ride_coin: ['coins'], park_day: ['coins'], standings: ['foam-finger'], fright_night: ['lantern'], fright_badge: ['lantern'],
  fright_lifetime: ['lantern'], streak: ['flame'], level_up: ['xp'],
};

/**
 * Decodes a kind's art ahead of time: the card chrome and hero art once, then
 * that kind's QR and props. Nothing happens at launch: it starts when a
 * share-eligible screen mounts a FlexShareButton or a share is asked for.
 * Tiny, invisible, and unmounted once drawn.
 */
function WarmChrome() {
  const [kinds, setKinds] = useState<readonly FlexRequest['kind'][]>(warmKinds);
  useEffect(() => subscribeWarm(() => setKinds(warmKinds())), []);
  const sources = useMemo(() => {
    if (!kinds.length) return [];
    const out = new Set<number>([...Object.values(CARD_CHROME), ...Object.values(HERO_ART)]);
    kinds.forEach(kind => { out.add(QR_BY_KIND[kind]); (KIND_PROPS[kind] ?? []).forEach(prop => out.add(PROP_ART[prop])); });
    return [...out];
  }, [kinds]);
  const [done, setDone] = useState(0);
  if (!sources.length || done >= sources.length) return null;
  return (
    <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {sources.map((source, i) => <Image key={String(source)} source={source} style={styles.warm} onLoad={() => setDone(n => n + 1)} onError={() => setDone(n => n + 1)} />)}
    </View>
  );
}

/** Drops the request if its Modal never reports onShow (the queue must never wedge). */
function useShowWatchdog(request: FlexRequest, format: FlexFormat) {
  const shown = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (shown.current) return;
      if (__DEV__) console.log(`SHARE_DEBUG watchdog dropped ${request.kind}`);
      trackShare({ kind: request.kind, surface: request.options.surface, format, action: 'failed', activity: 'not_shown' });
      finishFlex(request.id);
    }, SHOW_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return () => { shown.current = true; };
}

/** Capture + share for one request. Owns the off-screen full-size card. */
function useFlexShare(request: FlexRequest, format: FlexFormat) {
  const { player } = useContext(AuthContext);
  const cardRef = useRef<View>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const busyRef = useRef(false);
  const readyRef = useRef(false);
  readyRef.current = ready;
  const rarity = flexCopy(request.kind, request.payload).rarity;
  const event = useCallback((action: 'opened' | 'shared' | 'dismissed' | 'failed', activity?: string | null) => trackShare({
    kind: request.kind, surface: request.options.surface, format, action, activity, rarity,
  }), [request, format, rarity]);

  const share = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // The link (with its per-kind campaign, never a player id) goes on the clipboard,
      // so it can be pasted as an Instagram link sticker.
      void Clipboard.setStringAsync(shareUrl(request.kind)).then(() => setLinkCopied(true)).catch(() => undefined);
      for (let i = 0; i < 30 && !readyRef.current; i++) await new Promise(r => setTimeout(r, 100));
      const uri = await captureFlex(cardRef, format);
      const outcome = await openShareSheet(uri);
      if (outcome.shared === false) event('dismissed');
      else {
        event('shared', outcome.activity);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType?.Success).catch(() => undefined);
      }
    } catch {
      event('failed');
      gameAlert('Card not made', 'Your stuff is safe. Try sharing again.', undefined, { icon: 'retry' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [event, format, request.kind]);

  const offscreen = (
    <View style={[styles.offscreen, FLEX_SIZE[format]]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <FlexCard key={format} ref={cardRef} kind={request.kind} payload={request.payload} format={format}
        inventory={player?.inventory} onReadyChange={setReady} />
    </View>
  );
  return { share, busy, ready, offscreen, event, linkCopied, inventory: player?.inventory };
}

function LinkHint({ show }: { readonly show: boolean }) {
  if (!show) return null;
  return <Text style={styles.hint} accessibilityLiveRegion="polite">Link copied. On Instagram, paste it as a link sticker.</Text>;
}

/* ------------------------------------------------------------- Flex sheet */

function FlexSheet({ request }: { readonly request: FlexRequest }) {
  const [format, setFormat] = useState<FlexFormat>(request.options.format ?? 'story');
  const { share, busy, offscreen, event, inventory, linkCopied } = useFlexShare(request, format);
  const onShow = useShowWatchdog(request, format);
  const { width, height } = useWindowDimensions();
  useEffect(() => { event('opened'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFpsProbe('sheet');
  // No pop-in: the preview stays hidden until its art has drawn, at most PREVIEW_HOLD_MS.
  const [previewShown, setPreviewShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPreviewShown(true), PREVIEW_HOLD_MS);
    return () => clearTimeout(t);
  }, []);
  const close = () => finishFlex(request.id);
  useDevAutoPress(['sheet_share', `sheet_share@${request.options.surface}`], () => { void share(); });
  useDevAutoPress(['sheet_close', `sheet_close@${request.options.surface}`], close);
  const size = FLEX_SIZE[format];
  const scale = Math.min((width - 48) / size.width, (height - 300) / size.height, 1);

  return (
    <Modal transparent animationType="fade" visible onShow={onShow} onRequestClose={close} statusBarTranslucent>
      <View style={styles.scrim}>
        {offscreen}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={CLOSE_WORD} accessibilityRole="button" />
        <View style={[styles.previewBox, { width: size.width * scale, height: size.height * scale }]} pointerEvents="none">
          <View style={{ width: size.width, height: size.height, transform: [{ scale }], transformOrigin: 'top left', opacity: previewShown ? 1 : 0 }}>
            <FlexCard kind={request.kind} payload={request.payload} format={format} inventory={inventory} onReadyChange={ready => { if (ready) setPreviewShown(true); }} />
          </View>
        </View>
        <View style={styles.toggle} accessibilityRole="radiogroup">
          {(['story', 'square'] as const).map(option => (
            <Pressable key={option} onPress={() => { setFormat(option); void Haptics.selectionAsync(); }}
              accessibilityRole="radio" accessibilityState={{ selected: format === option }}
              style={[styles.toggleItem, format === option && styles.toggleOn]} hitSlop={6}>
              <Text style={[styles.toggleText, format === option && styles.toggleTextOn]}>{option === 'story' ? 'Story' : 'Square'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <GameButton label="Share" onPress={share} loading={busy} accessibilityHint="Opens your share sheet" />
          <LinkHint show={linkCopied} />
          <GameButton label={CLOSE_WORD} variant="ghost" tone="onBlue" onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------ Flex moment */

/**
 * The post-earn beat (art is ready or 600 ms have passed before any of it):
 *   0 ms     scrim, rays start a slow turn
 *   80 ms    the card slams in (0.6 -> 1.06 -> 1), heavy haptic + reveal sting,
 *            Alex's stars burst out (6/10/14 by intensity), a shake on big ones
 *   330 ms   the brag number counts up with ticks (light haptic each, at most 10)
 *   450 ms   the player's shark pops in with a bounce
 *   900 ms   Share rises, "Nice!" under it
 * Backdrop taps are ignored for 900 ms. Reduce Motion: everything still.
 */
function FlexMoment({ request }: { readonly request: FlexRequest }) {
  const reduced = useUiReducedMotion();
  const { share, busy, offscreen, event, inventory, linkCopied } = useFlexShare(request, 'story');
  const onShow = useShowWatchdog(request, 'story');
  const { width, height } = useWindowDimensions();
  const copy = useMemo(() => flexCopy(request.kind, request.payload), [request]);
  const frame = FRAMES[copy.frame];
  const intensity = revealIntensity(request.kind, copy.rarity);
  const target = countTarget(copy.big);
  const openedAt = useRef(Date.now());
  const spin = useSharedValue(0);
  const slam = useSharedValue(reduced ? 1 : 0);
  const shake = useSharedValue(0);
  const burst = useSharedValue(reduced ? 1 : 0);
  const sharkPop = useSharedValue(reduced ? 1 : 0);
  const bigPunch = useSharedValue(1);
  const cta = useSharedValue(reduced ? 1 : 0);
  const flash = useSharedValue(0);
  const shine = useSharedValue(0);
  const sharkHop = useSharedValue(0);
  const sharkTilt = useSharedValue(0);
  const flourish = useSharedValue(0);
  const [tick, setTick] = useState<number | null>(null);
  // The giant number stays hidden until its first tick, so a "0" never shows.
  const bigIn = useSharedValue(reduced || target == null ? 1 : 0);
  useFpsProbe('reveal');

  // The slam waits for the card's art, at most RESOLVE_BUDGET_MS.
  const [artReady, setArtReady] = useState(false);
  const [go, setGo] = useState(false);
  useEffect(() => { event('opened'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (artReady) { setGo(true); return; }
    const t = setTimeout(() => setGo(true), RESOLVE_BUDGET_MS);
    return () => clearTimeout(t);
  }, [artReady]);

  useEffect(() => {
    if (!go) return;
    openedAt.current = Date.now(); // the backdrop tap guard counts from the slam
    if (reduced) { setTick(null); return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    // The shark reacts: a happy hop with a wiggle (after it pops in, and again when the number lands).
    const hop = (height: number) => {
      sharkHop.value = withSequence(withTiming(-height, { duration: 140, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 6, stiffness: 220 }));
      sharkTilt.value = withSequence(withTiming(-8, { duration: 90 }), withTiming(7, { duration: 120 }), withSpring(0, { damping: 6, stiffness: 200 }));
    };
    const land = () => {
      bigPunch.value = withSequence(withTiming(1.35, { duration: 90 }), withSpring(1, { damping: 7, stiffness: 220 }));
      flourish.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
      hop(intensity === 'big' ? 22 : 14);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType?.Success).catch(() => undefined);
    };
    spin.value = withRepeat(withTiming(1, { duration: 10_000, easing: Easing.linear }), -1, false);
    slam.value = withDelay(80, withSequence(
      withTiming(1.06, { duration: 220, easing: Easing.out(Easing.back(1.6)) }),
      withSpring(1, { damping: 9, stiffness: 180 }),
    ));
    at(260, () => {
      playSfx('fx.reveal', 0.9);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Heavy).catch(() => undefined);
      burst.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
      // The white flash follows the system's Dim Flashing Lights setting as well as Reduce Motion.
      if (!isDimFlashingLightsEnabled()) flash.value = withSequence(withTiming(0.75, { duration: 60 }), withTiming(0, { duration: 260 }));
      shine.value = withDelay(260, withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }));
      if (intensity === 'big') shake.value = withSequence(...[8, -7, 5, -3, 0].map(v => withTiming(v, { duration: 45 })));
    });
    sharkPop.value = withDelay(450, withSpring(1, { damping: 8, stiffness: 170 }));
    at(780, () => hop(16));
    const steps = countSteps(target);
    if (steps.length) {
      steps.forEach((value, i) => at(330 + (i + 1) * 45, () => {
        if (i === 0) bigIn.value = 1;
        setTick(value);
        playSfx('fx.coinTick', 0.6);
        void Haptics.selectionAsync();
      }));
      at(Math.max(330 + steps.length * 45 + 20, 1100), () => { setTick(null); land(); });
    } else {
      at(330, () => { bigIn.value = 1; });
      at(1100, land);
    }
    cta.value = withDelay(900, withSpring(1, { damping: 12, stiffness: 160 }));
    return () => timers.forEach(clearTimeout);
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps

  // Never leave the endless ray loop ticking under the next screen.
  useEffect(() => () => {
    [spin, slam, burst, sharkPop, sharkHop, sharkTilt, flash, shine, flourish, bigPunch, cta].forEach(value => cancelAnimation(value));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (Date.now() - openedAt.current < REVEAL_TAP_GUARD_MS) return;
    finishFlex(request.id);
  };
  const size = FLEX_SIZE.story;
  const scale = Math.min((width - 56) / size.width, (height - 230) / size.height);
  const raysSize = Math.max(width, height) * 1.3;
  // Where the hero sits on the story card (left of the shark, or centred when there is no shark).
  const heroX = copy.hideShark ? 0.5 : 0.3;

  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, slam.value * 1.6),
    transform: [{ translateX: shake.value }, { scale: 0.6 + 0.4 * slam.value }],
  }));
  const sharkStyle = useAnimatedStyle(() => ({
    opacity: sharkPop.value,
    transform: [{ translateY: (1 - sharkPop.value) * 40 + sharkHop.value }, { rotate: `${sharkTilt.value}deg` }, { scale: 0.6 + 0.4 * sharkPop.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.value > 0 && shine.value < 1 ? 0.55 : 0,
    transform: [{ translateX: -size.width * scale + shine.value * size.width * scale * 2.2 }, { rotate: '20deg' }],
  }));
  const bigStyle = useAnimatedStyle(() => ({ opacity: bigIn.value, transform: [{ rotate: '-8deg' }, { scale: bigPunch.value }] }));
  const ctaStyle = useAnimatedStyle(() => ({ opacity: cta.value, transform: [{ translateY: (1 - cta.value) * 40 }] }));
  const bigText = tick != null && copy.big ? copy.big.replace(/\d+/, String(tick)) : undefined;

  return (
    <Modal transparent animationType="fade" visible onShow={onShow} onRequestClose={() => finishFlex(request.id)} statusBarTranslucent>
      <View style={[styles.scrim, styles.momentScrim]}>
        {offscreen}
        <Animated.View pointerEvents="none" style={[styles.momentRays, { width: raysSize, height: raysSize, marginLeft: -raysSize / 2, marginTop: -raysSize / 2 }, raysStyle]}>
          <RaysSvg size={raysSize} color={frame.rays === '#ffffff' ? '#ffcf3b' : frame.rays} />
        </Animated.View>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={CLOSE_WORD} accessibilityRole="button" />
        <View pointerEvents="none">
          <Animated.View style={[{ width: size.width * scale, height: size.height * scale }, styles.momentCard, cardStyle]}>
            <View style={{ width: size.width, height: size.height, transform: [{ scale }], transformOrigin: 'top left' }}>
              <FlexCard kind={request.kind} payload={request.payload} format="story" inventory={inventory} onReadyChange={setArtReady}
                motion={reduced ? undefined : { bigText, bigStyle, sharkStyle }} />
            </View>
            {!reduced && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />}
            {!reduced && <Animated.View pointerEvents="none" style={[styles.shine, { height: size.height * scale * 1.6, top: -size.height * scale * 0.3 }, shineStyle]} />}
          </Animated.View>
          {!reduced && <StarBurst progress={burst} count={BURST[intensity]} cx={heroX * size.width * scale} cy={size.height * scale * 0.36} reach={size.width * scale * 0.7} />}
          {!reduced && <Flourish kind={request.kind} progress={flourish} cx={heroX * size.width * scale} cy={size.height * scale * 0.36} unit={size.width * scale} />}
        </View>
        <Animated.View style={[styles.actions, ctaStyle]}>
          <GameButton label="Share" onPress={share} loading={busy} accessibilityHint="Opens your share sheet" />
          <LinkHint show={linkCopied} />
          <GameButton label={CLOSE_WORD} variant="ghost" tone="onBlue" onPress={() => finishFlex(request.id)} />
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Alex's stars flying out from the hero on the slam (UI thread only). */
function StarBurst({ progress, count, cx, cy, reach }: {
  readonly progress: SharedValue<number>; readonly count: number; readonly cx: number; readonly cy: number; readonly reach: number;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => <BurstStar key={i} i={i} count={count} progress={progress} cx={cx} cy={cy} reach={reach} />)}
    </View>
  );
}

function BurstStar({ i, count, progress, cx, cy, reach }: {
  readonly i: number; readonly count: number; readonly progress: SharedValue<number>; readonly cx: number; readonly cy: number; readonly reach: number;
}) {
  const inner = i % 3 === 0;
  const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  const dist = reach * (inner ? 0.42 : 0.72 + ((i * 37) % 30) / 100);
  const size = inner ? 26 + ((i * 29) % 12) : 36 + ((i * 53) % 28);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p <= 0 || p >= 1 ? 0 : p < 0.7 ? 1 : (1 - p) / 0.3,
      transform: [
        { translateX: cx - size / 2 + Math.cos(angle) * dist * p },
        { translateY: cy - size / 2 + Math.sin(angle) * dist * p },
        { rotate: `${p * 220 * (i % 2 ? 1 : -1)}deg` },
        { scale: 0.4 + p * 0.8 },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
      <Image source={HERO_ART.star} style={{ width: size, height: size }} contentFit="contain" />
    </Animated.View>
  );
}

/**
 * Dev-only frame probe (EXPO_PUBLIC_SHARE_STUDIO_FPS=1): counts UI-thread and
 * JS-thread frames for the first 3 s of a reveal or sheet and logs
 * "SHARE_FPS <mode> ui=<fps> js=<fps> uiDropped=<n> uiWorstMs=<ms>".
 */
function useFpsProbe(mode: string) {
  const frames = useSharedValue(0);
  const dropped = useSharedValue(0);
  const worst = useSharedValue(0);
  const started = useSharedValue(0);
  const done = useSharedValue(0);
  const jsFrames = useRef(0);
  const report = useCallback((ui: number, drops: number, worstMs: number) => {
    console.log(`SHARE_FPS ${mode} ui=${ui.toFixed(1)} js=${(jsFrames.current / 3).toFixed(1)} uiDropped=${drops} uiWorstMs=${worstMs.toFixed(1)}`);
  }, [mode]);
  useEffect(() => {
    if (!FPS_PROBE) return;
    let raf = 0;
    const start = Date.now();
    const loop = () => { if (Date.now() - start < 3000) jsFrames.current += 1; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  useFrameCallback(info => {
    'worklet';
    if (done.value) return;
    if (!started.value) started.value = info.timestamp;
    frames.value += 1;
    const dt = info.timeSincePreviousFrame ?? 0;
    if (frames.value > 2 && dt > 20) dropped.value += 1;
    if (frames.value > 2 && dt > worst.value) worst.value = dt;
    const elapsed = info.timestamp - started.value;
    if (elapsed >= 3000) {
      done.value = 1;
      runOnJS(report)((frames.value * 1000) / elapsed, dropped.value, worst.value);
    }
  }, FPS_PROBE);
}

function RaysSvg({ size, color }: { readonly size: number; readonly color: string }) {
  const n = 16;
  const r = size / 2;
  const d = Array.from({ length: n }, (_, i) => {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + Math.PI / n;
    return `M${r},${r} L${r + r * Math.cos(a0)},${r + r * Math.sin(a0)} L${r + r * Math.cos(a1)},${r + r * Math.sin(a1)} Z`;
  }).join(' ');
  return <Svg width={size} height={size}><Path d={d} fill={color} opacity={0.25} /></Svg>;
}

/**
 * One category flourish when the number lands, all real art: a trophy drops onto
 * the Shark Crown medallion, the streak flame flares, KO stars ring the boss, the
 * lantern glows; anything else gets an Alex diamond pop.
 */
const FLOURISH_ART: Partial<Record<FlexRequest['kind'], number>> = {
  crowned: HERO_ART.trophy, title: HERO_ART.trophy, streak: HERO_ART.flame, boss_win: HERO_ART.star,
  fright_night: HERO_ART.lantern, fright_badge: HERO_ART.lantern, fright_lifetime: HERO_ART.lantern,
};

function Flourish({ kind, progress, cx, cy, unit }: {
  readonly kind: FlexRequest['kind']; readonly progress: SharedValue<number>; readonly cx: number; readonly cy: number; readonly unit: number;
}) {
  const art = FLOURISH_ART[kind] ?? HERO_ART.diamond;
  const ring = kind === 'boss_win';
  const drop = kind === 'crowned' || kind === 'title';
  const size = unit * (ring ? 0.12 : drop ? 0.34 : 0.3);
  const pieces = ring ? 5 : 1;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: pieces }, (_, i) => <FlourishPiece key={i} i={i} pieces={pieces} art={art} size={size} progress={progress}
        cx={cx} cy={cy} unit={unit} mode={ring ? 'ring' : drop ? 'drop' : 'flare'} />)}
    </View>
  );
}

function FlourishPiece({ i, pieces, art, size, progress, cx, cy, unit, mode }: {
  readonly i: number; readonly pieces: number; readonly art: number; readonly size: number; readonly progress: SharedValue<number>;
  readonly cx: number; readonly cy: number; readonly unit: number; readonly mode: 'ring' | 'drop' | 'flare';
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    if (p <= 0 || p >= 1) return { opacity: 0 };
    if (mode === 'ring') {
      const a = (i / pieces) * Math.PI * 2 + p * Math.PI * 2;
      return { opacity: p < 0.8 ? 1 : (1 - p) / 0.2, transform: [
        { translateX: cx - size / 2 + Math.cos(a) * unit * 0.2 }, { translateY: cy - unit * 0.22 - size / 2 + Math.sin(a) * unit * 0.07 }] };
    }
    if (mode === 'drop') {
      const fall = Math.min(1, p / 0.35);
      const bounce = p < 0.35 ? 0 : Math.sin(((p - 0.35) / 0.65) * Math.PI) * 0.06;
      return { opacity: p < 0.75 ? 1 : (1 - p) / 0.25, transform: [
        { translateX: cx - size / 2 }, { translateY: cy - unit * 0.42 - size / 2 - (1 - fall) * unit * 0.5 - bounce * unit }, { scale: 1 + (1 - fall) * 0.3 }] };
    }
    return { opacity: p < 0.5 ? 1 : (1 - p) / 0.5, transform: [
      { translateX: cx - size / 2 }, { translateY: cy - size / 2 - p * unit * 0.1 }, { scale: 0.6 + Math.sin(p * Math.PI) * 1.1 }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
      <Image source={art} style={{ width: size, height: size }} contentFit="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flash: { backgroundColor: '#ffffff' },
  shine: { position: 'absolute', left: 0, width: 46, backgroundColor: 'rgba(255,255,255,0.75)' },
  offscreen: { position: 'absolute', left: -4000, top: 0 },
  warm: { width: 48, height: 48 },
  // Opaque: nothing behind the sheet bleeds through.
  scrim: { flex: 1, backgroundColor: '#05224f', alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  momentScrim: { backgroundColor: '#041a3d' },
  momentRays: { position: 'absolute', left: '50%', top: '42%' },
  momentCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 3, borderColor: '#ffffff' },
  previewBox: { borderRadius: 18, overflow: 'hidden', borderWidth: 3, borderColor: '#ffffff' },
  toggle: { flexDirection: 'row', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 22, padding: 4, gap: 4 },
  toggleItem: { minWidth: 96, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  toggleOn: { backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy },
  toggleText: { fontFamily: 'Shark', fontSize: 17, color: '#ffffff' },
  toggleTextOn: { color: BRAND.navy },
  actions: { width: '100%', paddingHorizontal: 32, marginTop: 14, gap: 4, alignItems: 'center' },
  hint: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff', textAlign: 'center', marginTop: 2 },
});
