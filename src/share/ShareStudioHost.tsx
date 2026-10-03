/**
 * ShareStudioHost: mounted once in Root. Shows the queued request as either
 *   - the Flex moment (after an earn): rays, the card slams in, Share rises, or
 *   - the Flex sheet (re-share): live preview, Story / Square, Share.
 * Both capture a full-size off-screen copy of the card and open the OS share
 * sheet. Nothing else leaves the device except the no-PII share event.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { AuthContext } from '../context/AuthProvider';
import { playSfx } from '../gamekit/SFX';
import * as Haptics from '../helpers/haptics';
import { BRAND, GameButton, gameAlert } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { captureFlex, openShareSheet } from './capture';
import { flexCopy } from './copy';
import { CARD_CHROME, FLEX_SIZE, FlexCard } from './FlexCard';
import { HERO_ART } from './FlexHero';
import { Image } from 'expo-image';
import { FRAMES } from './frames';
import { currentFlex, finishFlex, holdFlex, holdWhileInPark, releaseHeldFlex, subscribeFlex } from './store';
import { LocationStatusContext } from '../context/LocationProvider';
import { trackShare } from './track';
import type { FlexFormat, FlexRequest } from './types';

export const REVEAL_TAP_GUARD_MS = 900;

export function ShareStudioHost() {
  const [request, setRequest] = useState<FlexRequest | null>(currentFlex);
  useEffect(() => subscribeFlex(() => setRequest(currentFlex())), []);
  // Park-identifying reveals (park day, ride coin) wait until the player has left the park.
  const { park } = useContext(LocationStatusContext);
  const inPark = !!park;
  useEffect(() => { if (request && holdWhileInPark(request, inPark)) holdFlex(request.id); }, [request, inPark]);
  useEffect(() => { if (!inPark) releaseHeldFlex(); }, [inPark]);
  if (request && holdWhileInPark(request, inPark)) return <WarmChrome />;
  return <>
    <WarmChrome />
    {request && (request.mode === 'reveal'
      ? <FlexMoment key={request.id} request={request} />
      : <FlexSheet key={request.id} request={request} />)}
  </>;
}

/**
 * Decodes the card chrome (wordmark, ribbon, water, QR, sparkles, crown...) once,
 * a few seconds after launch, so a Flex moment never slams in with blank art.
 * Tiny, invisible, and unmounted once drawn.
 */
function WarmChrome() {
  const [phase, setPhase] = useState<'wait' | 'warm' | 'done'>('wait');
  const left = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => setPhase('warm'), 3000);
    return () => clearTimeout(t);
  }, []);
  if (phase !== 'warm') return null;
  const sources = [...Object.values(CARD_CHROME), ...Object.values(HERO_ART)];
  left.current = left.current || sources.length;
  const loaded = () => { left.current -= 1; if (left.current <= 0) setPhase('done'); };
  return (
    <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {sources.map((source, i) => <Image key={i} source={source} style={styles.warm} onLoad={loaded} onError={loaded} />)}
    </View>
  );
}

/** Capture + share for one request. Owns the off-screen full-size card. */
function useFlexShare(request: FlexRequest, format: FlexFormat) {
  const { player } = useContext(AuthContext);
  const cardRef = useRef<View>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
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
      // Wait (briefly) for slow art; the card falls back to bundled art at 4 s anyway.
      for (let i = 0; i < 50 && !readyRef.current; i++) await new Promise(r => setTimeout(r, 100));
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
  }, [event, format]);

  const offscreen = (
    <View style={[styles.offscreen, FLEX_SIZE[format]]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <FlexCard key={format} ref={cardRef} kind={request.kind} payload={request.payload} format={format}
        inventory={player?.inventory} onReadyChange={setReady} />
    </View>
  );
  return { share, busy, ready, offscreen, event, inventory: player?.inventory };
}

/* ------------------------------------------------------------- Flex sheet */

function FlexSheet({ request }: { readonly request: FlexRequest }) {
  const [format, setFormat] = useState<FlexFormat>(request.options.format ?? 'story');
  const { share, busy, offscreen, event, inventory } = useFlexShare(request, format);
  const { width, height } = useWindowDimensions();
  useEffect(() => { event('opened'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => finishFlex(request.id);
  const size = FLEX_SIZE[format];
  const scale = Math.min((width - 48) / size.width, (height - 300) / size.height, 1);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close} statusBarTranslucent>
      <View style={styles.scrim}>
        {offscreen}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.previewBox, { width: size.width * scale, height: size.height * scale }]} pointerEvents="none">
          <View style={{ width: size.width, height: size.height, transform: [{ scale }], transformOrigin: 'top left' }}>
            <FlexCard kind={request.kind} payload={request.payload} format={format} inventory={inventory} />
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
          <GameButton label="Close" variant="ghost" tone="onBlue" onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------ Flex moment */

/**
 * The post-earn beat, in order:
 *   0 ms     scrim fades in, rays start a slow turn (6 rpm)
 *   120 ms   the card slams in (0.6 -> 1.06 -> 1), heavy haptic + reveal sting
 *   520 ms   the ribbon line ("SHARK CROWN!") pops above
 *   800 ms   Share rises, "Nice!" fades in under it
 * Backdrop taps are ignored for the first 900 ms. Reduce Motion: all still.
 */
function FlexMoment({ request }: { readonly request: FlexRequest }) {
  const reduced = useUiReducedMotion();
  const { share, busy, offscreen, event, inventory } = useFlexShare(request, 'story');
  const { width, height } = useWindowDimensions();
  const copy = flexCopy(request.kind, request.payload);
  const frame = FRAMES[copy.frame];
  const openedAt = useRef(Date.now());
  const spin = useSharedValue(0);
  const slam = useSharedValue(reduced ? 1 : 0);
  const cta = useSharedValue(reduced ? 1 : 0);

  // The slam waits for the card's art (at most 2.5 s), so nothing pops in after the hit.
  const [artReady, setArtReady] = useState(false);
  const [go, setGo] = useState(false);
  useEffect(() => { event('opened'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (artReady) { setGo(true); return; }
    const t = setTimeout(() => setGo(true), 2500);
    return () => clearTimeout(t);
  }, [artReady]);

  useEffect(() => {
    if (!go) return;
    openedAt.current = Date.now(); // the backdrop tap guard counts from the slam
    if (reduced) return;
    spin.value = withRepeat(withTiming(1, { duration: 10_000, easing: Easing.linear }), -1, false);
    slam.value = withDelay(120, withSequence(
      withTiming(1.06, { duration: 220, easing: Easing.out(Easing.back(1.6)) }),
      withSpring(1, { damping: 9, stiffness: 180 }),
    ));
    cta.value = withDelay(800, withSpring(1, { damping: 12, stiffness: 160 }));
    const t = setTimeout(() => {
      playSfx('fx.reveal', 0.9);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Heavy).catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (Date.now() - openedAt.current < REVEAL_TAP_GUARD_MS) return;
    finishFlex(request.id);
  };
  const size = FLEX_SIZE.story;
  const scale = Math.min((width - 56) / size.width, (height - 230) / size.height);
  const raysSize = Math.max(width, height) * 1.3;

  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, slam.value * 1.6), transform: [{ scale: 0.6 + 0.4 * slam.value }] }));
  const ctaStyle = useAnimatedStyle(() => ({ opacity: cta.value, transform: [{ translateY: (1 - cta.value) * 40 }] }));

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => finishFlex(request.id)} statusBarTranslucent>
      <View style={[styles.scrim, styles.momentScrim]}>
        {offscreen}
        <Animated.View pointerEvents="none" style={[styles.momentRays, { width: raysSize, height: raysSize, marginLeft: -raysSize / 2, marginTop: -raysSize / 2 }, raysStyle]}>
          <RaysSvg size={raysSize} color={frame.rays} />
        </Animated.View>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
        <Animated.View pointerEvents="none" style={[{ width: size.width * scale, height: size.height * scale }, styles.momentCard, cardStyle]}>
          <View style={{ width: size.width, height: size.height, transform: [{ scale }], transformOrigin: 'top left' }}>
            <FlexCard kind={request.kind} payload={request.payload} format="story" inventory={inventory} onReadyChange={setArtReady} />
          </View>
        </Animated.View>
        <Animated.View style={[styles.actions, ctaStyle]}>
          <GameButton label="Share" onPress={share} loading={busy} accessibilityHint="Opens your share sheet" />
          <GameButton label="Nice!" variant="ghost" tone="onBlue" onPress={() => finishFlex(request.id)} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function RaysSvg({ size, color }: { readonly size: number; readonly color: string }) {
  const n = 16;
  const r = size / 2;
  const d = Array.from({ length: n }, (_, i) => {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + Math.PI / n;
    return `M${r},${r} L${r + r * Math.cos(a0)},${r + r * Math.sin(a0)} L${r + r * Math.cos(a1)},${r + r * Math.sin(a1)} Z`;
  }).join(' ');
  return <Svg width={size} height={size}><Path d={d} fill={color} opacity={0.14} /></Svg>;
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -4000, top: 0 },
  warm: { width: 48, height: 48 },
  scrim: { flex: 1, backgroundColor: 'rgba(5,34,79,0.94)', alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  momentScrim: { backgroundColor: 'rgba(5,34,79,0.96)' },
  momentRays: { position: 'absolute', left: '50%', top: '42%' },
  momentCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 3, borderColor: '#ffffff' },
  previewBox: { borderRadius: 18, overflow: 'hidden', borderWidth: 3, borderColor: '#ffffff' },
  toggle: { flexDirection: 'row', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 22, padding: 4, gap: 4 },
  toggleItem: { minWidth: 96, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  toggleOn: { backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy },
  toggleText: { fontFamily: 'Shark', fontSize: 17, color: '#ffffff' },
  toggleTextOn: { color: BRAND.navy },
  actions: { width: '100%', paddingHorizontal: 32, marginTop: 14, gap: 4, alignItems: 'center' },
});
