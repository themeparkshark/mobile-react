import { useCallback, useEffect, useRef, useState } from 'react';
import { useCatchOpen } from '../screens/ExploreScreen/catchPresence';
import { AppState, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import client from '../api/client';
import { navigationRef } from '../RootNavigation';
import * as Haptics from '../helpers/haptics';
import { connectionState, onConnectionState, isOfflineMarkOwned, onOfflineMarkOwner, type ConnectionState } from '../services/connectivity';
import { SHARK_LOADER_ART } from '../ui/SharkLoader';
import { BRAND, FONT, GameButton, HIT_SLOP, OUTLINE, Z } from '../ui';
import { useOfflineChipDock } from './map/offlineDock';

export const OFFLINE_SHOW_DELAY_MS = 1200;
/** A slow server shows only once it has stayed slow a little while (one slow screen is not news). */
export const SLOW_SHOW_DELAY_MS = 3000;
/** On the map a tap on the chip opens the full card this long, so the retry is seen. */
export const CHIP_EXPAND_MS = 4500;
/** What each state says (T172, T176): slow is never "check your internet". */
export const BANNER_COPY = {
  offline: { title: 'RECONNECTING', body: 'Some things may not load', chip: 'Offline', label: 'Offline. Your game is safe. Tap to try again.' },
  slow: { title: 'GAME IS SLOW', body: 'Your game is safe. Try again', chip: 'Slow', label: 'The game is slow right now. Your game is safe. Tap to try again.' },
  back: { title: 'BACK ONLINE', body: 'Your park is live again', chip: 'Back', label: 'Back online' },
} as const;
export const OFFLINE_PROBE_INTERVAL_MS = 15000;
const BACK_ONLINE_HOLD_MS = 1400;
// After this long the card shrinks to his illustrated offline icon, so a long
// outage in the park never sits on top of map cards or header counters.
export const OFFLINE_COMPACT_AFTER_MS = 4000;
const CHIP_SIZE = 44;
// Explore: map-control column on the right, below the recenter button.
const MAP_CHIP_TOP = 0.43;
// Screens whose HUD cards sit right under the header (home: collection and
// park story cards; park: team banner, boss and ride goal cards). There the full
// card would cover them, so the banner is only the small chip, docked on the
// right edge of the map under the recenter button like the other map controls.
// Sign-in too: the full card would sit over the title art.
export const CHIP_ONLY_ROUTES: ReadonlySet<string> = new Set(['Explore', 'Login']);
// The map declutter preview mirrors Explore, so its captures show the real docked chip, in internal
// Release builds too (the route only exists when the preview is registered; store builds never have it).
const DEV_CHIP_ONLY_ROUTES: ReadonlySet<string> = new Set(['MapDeclutterPreview']);

function currentRouteName(): string | undefined {
  try {
    return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
  } catch {
    return undefined;
  }
}

type Phase = 'hidden' | 'offline' | 'slow' | 'back';

// Drawn with the art pipeline (GPT Image 2.5 with Alex's original gift,
// compass, foam finger and sunglasses art as references) and checked beside
// his originals at 128px and 40px. Raw outputs, prompts, references and the
// review sheet: tps-prime-time-audit/art-pilot/raw/ws9/offline-v2/.
const OFFLINE_ICON = require('../../assets/images/offline/offline.png');
const BACK_ONLINE_ICON = require('../../assets/images/offline/back-online.png');
const ICON_SIZE = 34;
// Topbar: 70pt art under the status bar, plus a small gap.
export const HEADER_CLEARANCE = 70 + 8;
/** Screens with a control right under the header: the banner drops below it (Standings: its tab rail). */
export const ROUTE_EXTRA_TOP: Readonly<Record<string, number>> = { Leaderboard: 66 };

function probe(): Promise<unknown> {
  // Any quick HTTP response marks the app reachable (client.ts interceptor); a late one keeps it slow.
  return client.get('/crumbs', { timeout: 10000, tpsNoRetry: true, tpsNoDedupe: true } as never).catch(() => undefined);
}

/**
 * One branded offline surface for the whole app. Appears after a short
 * debounce when API calls fail at the network level (or time out twice in a
 * row), probes quietly every 15s, and says "Back online" before sliding away.
 * The copy promises nothing about cached data: only crumbs, currencies and
 * the theme are kept last-good, so the park view itself may not load.
 */
export default function OfflineBanner() {
  const catchOpen = useCatchOpen();
  const reduceMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  // On the map, the map says where the chip docks (under or beside its whole button rail).
  const mapDock = useOfflineChipDock();
  const [phase, setPhase] = useState<Phase>('hidden');
  // A screen showing its own full offline state owns the mark: no second one here.
  const [markOwned, setMarkOwned] = useState(isOfflineMarkOwned());
  useEffect(() => onOfflineMarkOwner(setMarkOwned), []);
  const [probing, setProbing] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>('hidden');
  phaseRef.current = phase;

  const enter = useSharedValue(0);
  const pulse = useSharedValue(1);
  const shrink = useSharedValue(0);
  const [timedCompact, setCompact] = useState(false);
  const [routeName, setRouteName] = useState<string | undefined>(currentRouteName);
  useEffect(() => {
    const sync = () => setRouteName(currentRouteName());
    sync();
    return navigationRef.addListener('state', sync);
  }, []);
  // On the map a tap on the chip opens the full card for a moment, so the player sees the retry (T172).
  const [expanded, setExpanded] = useState(false);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (expandTimer.current) clearTimeout(expandTimer.current); }, []);
  const dockedRoute = routeName !== undefined && (CHIP_ONLY_ROUTES.has(routeName) || DEV_CHIP_ONLY_ROUTES.has(routeName));
  const chipOnly = dockedRoute && !expanded;
  const compact = timedCompact && !expanded;

  // Full card first so the player learns what happened, then the small chip.
  useEffect(() => {
    if (phase !== 'offline' && phase !== 'slow') {
      setCompact(false);
      return undefined;
    }
    const timer = setTimeout(() => setCompact(true), OFFLINE_COMPACT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    shrink.value = reduceMotion
      ? withTiming(compact ? 1 : 0, { duration: 160 })
      : withSpring(compact ? 1 : 0, { damping: 16, stiffness: 200, mass: 0.7 });
  }, [compact, reduceMotion, shrink]);

  useEffect(() => {
    const apply = (state: ConnectionState) => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (state !== 'online') {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        // Offline to slow (an answer came back, late) changes the words at once; anything new waits a beat.
        const showing = phaseRef.current === 'offline' || phaseRef.current === 'slow';
        showTimer.current = setTimeout(() => setPhase(state), showing ? 0 : state === 'offline' ? OFFLINE_SHOW_DELAY_MS : SLOW_SHOW_DELAY_MS);
      } else if (phaseRef.current === 'offline') {
        setPhase('back');
        Haptics.notificationAsync('success');
        hideTimer.current = setTimeout(() => setPhase('hidden'), BACK_ONLINE_HOLD_MS);
      } else if (phaseRef.current === 'slow') {
        // The game caught up: the slow note just slides away (nothing was lost, nothing to celebrate).
        setPhase('hidden');
      }
    };
    if (connectionState() !== 'online') apply(connectionState());
    const unsubscribe = onConnectionState(apply);
    return () => {
      unsubscribe();
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const visible = phase !== 'hidden';
    if (visible) {
      setMounted(true);
      enter.value = reduceMotion
        ? withTiming(1, { duration: 180 })
        : withSpring(1, { damping: 15, stiffness: 180, mass: 0.8 });
      return;
    }
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(setMounted)(false);
    };
    enter.value = withTiming(0, { duration: reduceMotion ? 180 : 220, easing: Easing.in(Easing.quad) }, done);
  }, [enter, phase, reduceMotion]);

  useEffect(() => {
    if (probing && !reduceMotion) {
      pulse.value = withRepeat(withSequence(withTiming(0.45, { duration: 420 }), withTiming(1, { duration: 420 })), -1);
    } else {
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [probing, pulse, reduceMotion]);

  const runProbe = useCallback(() => {
    setProbing(true);
    probe().finally(() => setProbing(false));
  }, []);

  useEffect(() => {
    if (phase !== 'offline' && phase !== 'slow') return undefined;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') runProbe();
    }, OFFLINE_PROBE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase, runProbe]);

  // GameButton plays its own light tap haptic.
  const onRetry = runProbe;
  const onChip = useCallback(() => {
    Haptics.selectionAsync();
    runProbe();
    if (expandTimer.current) clearTimeout(expandTimer.current);
    setExpanded(true);
    expandTimer.current = setTimeout(() => { expandTimer.current = null; setExpanded(false); }, CHIP_EXPAND_MS);
  }, [runProbe]);
  useEffect(() => { if (phase === 'hidden') setExpanded(false); }, [phase]);

  const cardStyle = useAnimatedStyle(() => {
    const progress = enter.value;
    return {
      opacity: Math.min(1, progress * 1.4),
      transform: reduceMotion
        ? []
        : [{ translateY: (1 - progress) * -28 }, { scale: 0.92 + 0.08 * progress }],
    };
  });
  const iconStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const fullStyle = useAnimatedStyle(() => ({
    opacity: 1 - shrink.value,
    transform: reduceMotion ? [] : [{ scale: 1 - 0.18 * shrink.value }],
  }));
  const chipStyle = useAnimatedStyle(() => ({
    opacity: shrink.value,
    transform: reduceMotion ? [] : [{ scale: 0.6 + 0.4 * shrink.value }],
  }));

  // A catch moment owns the screen, and the offline screen shows its own mark: the banner waits (its probe keeps running).
  if (!mounted || catchOpen || markOwned) return null;
  const back = phase === 'back';
  const slow = phase === 'slow';
  const copy = back ? BANNER_COPY.back : slow ? BANNER_COPY.slow : BANNER_COPY.offline;
  // Slow: his shark says "still here, your game is safe"; only a real outage shows the no-signal art.
  const stateIcon = back ? BACK_ONLINE_ICON : slow ? SHARK_LOADER_ART : OFFLINE_ICON;
  // Below his header bar (Topbar is 70pt under the status bar) so the logo,
  // currency counters and header buttons stay visible and tappable offline.
  const top = (initialWindowMetrics?.insets.top ?? 47) + HEADER_CLEARANCE + (routeName ? ROUTE_EXTRA_TOP[routeName] ?? 0 : 0);
  // On sign-in the chip tucks under the status bar, clear of the title art and the sign-in card.
  const onMap = routeName !== 'Login' && !!mapDock;
  const dockTop = routeName === 'Login' ? (initialWindowMetrics?.insets.top ?? 47) + 8
    : onMap ? mapDock.top : Math.round(windowHeight * MAP_CHIP_TOP);

  return (
    <View
      pointerEvents="box-none"
      style={chipOnly ? [styles.hostDocked, { top: dockTop }, onMap && { right: mapDock.right }] : [styles.host, { top }]}
    >
      <Animated.View
        style={cardStyle}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        accessibilityLabel={copy.label}
      >
        {!chipOnly && (
        <Animated.View style={[styles.lip, fullStyle]} pointerEvents={compact ? 'none' : 'auto'}>
        <View style={[styles.card, back && styles.cardBack]}>
          <Animated.View style={iconStyle}>
            <Image source={stateIcon} style={styles.icon} accessibilityElementsHidden importantForAccessibility="no" />
          </Animated.View>
          <View style={styles.copy}>
            <Text style={styles.title} maxFontSizeMultiplier={1.3}>{copy.title}</Text>
            <Text style={styles.body} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {copy.body}
            </Text>
          </View>
          {!back && (
            <GameButton
              label="Retry"
              size="compact"
              fullWidth={false}
              loading={probing}
              onPress={onRetry}
              accessibilityLabel={slow ? 'Try again' : 'Try to reconnect'}
              style={styles.retry}
            />
          )}
        </View>
        </Animated.View>
        )}
        {/* On a HUD screen the chip is the whole banner: it enters with the
            card animation and never sits on a hidden card. */}
        <Animated.View
          style={chipOnly ? styles.chipAlone : [styles.chipHost, chipStyle]}
          pointerEvents={chipOnly || compact ? 'box-none' : 'none'}
        >
          <Pressable
            onPress={onChip}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={copy.label}
            disabled={back}
            style={styles.chipStack}
          >
            <View style={styles.chip}>
              <Animated.View style={iconStyle}>
                <Image source={stateIcon} style={styles.chipIcon} accessibilityElementsHidden importantForAccessibility="no" />
              </Animated.View>
            </View>
            {/* T176: the picture always says what it means, like every other map button. */}
            <View style={styles.chipTag} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={styles.chipTagText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{copy.chip}</Text>
            </View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// Sits above screens but under GameDialog (Z.dialog) and toasts.
const BANNER_Z = Z.dialog - 1;

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: BANNER_Z, elevation: BANNER_Z },
  hostDocked: { position: 'absolute', right: 16, zIndex: BANNER_Z, elevation: BANNER_Z },
  lip: { borderRadius: 24, backgroundColor: BRAND.navy, paddingBottom: 4, maxWidth: 360, marginHorizontal: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.cream,
    borderColor: BRAND.navy,
    borderWidth: OUTLINE.thick,
    borderRadius: 24,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    minHeight: 48,
  },
  cardBack: { backgroundColor: BRAND.sky },
  icon: { width: ICON_SIZE, height: ICON_SIZE, resizeMode: 'contain' },
  copy: { marginLeft: 10, marginRight: 12, flexShrink: 1 },
  title: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navy, letterSpacing: 0.5 },
  body: { fontFamily: FONT.body, fontSize: 14, color: BRAND.blue, marginTop: -1 },
  // His yellow button art at 3.8:1, so 112 wide is about 30pt tall.
  retry: { width: 112 },
  // The compact chip sits centred where the full card was, small enough to
  // fit between the map cards under the header.
  chipHost: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-start' },
  chipAlone: { alignItems: 'center' },
  chip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    backgroundColor: BRAND.cream,
    borderColor: BRAND.navy,
    borderWidth: OUTLINE.thick,
    borderBottomWidth: OUTLINE.thick + 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIcon: { width: 30, height: 30, resizeMode: 'contain' },
  chipStack: { alignItems: 'center' },
  // The same small navy name tag the map's Shelf button wears.
  chipTag: {
    marginTop: -6,
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: BRAND.cream,
    borderColor: BRAND.navy,
    borderWidth: OUTLINE.thin,
  },
  chipTagText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.navy, letterSpacing: 0.3 },
});
