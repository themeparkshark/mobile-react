/**
 * HelpSheet: the one sheet every "?" in the app opens (Standings, Shark Shop,
 * Park shelf, Pin Trading, Redeem, Shark Social, word explainers, Home Hunt
 * rules and drop odds).
 *
 * Look: a cream bottom sheet with a hero window (a small live scene of the
 * real screen, HelpHero), a short headline and up to three icon-led points per
 * page. 1 to 3 pages, swiped sideways or stepped with Next; the last button
 * says Got it.
 *
 * Feel: the scrim fades and the sheet springs up on the UI thread; the hero,
 * headline and points arrive in a quick stagger. Close by Got it, the X, a tap
 * on the scrim, a swipe down, or Android back. Reduce Motion fades instead and
 * shows each hero as one still frame. Scenes only run on the visible page while
 * the sheet is open. The sheet never rises under the status bar or the Dynamic
 * Island, and keeps the home indicator clear.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Animated, {
  Easing, interpolate, runOnJS, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { playSfx } from '../../gamekit/SFX';
import type { HelpPage, HelpSheetSpec } from '../../services/help/helpSheets';
import { BRAND, GameButton, GameIcon, SharkLoader } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import HelpHero, { type HeroData } from './HelpHero';
import { markUserActivity } from '../../hooks/useUserIdle';
import { HELP_TOUR_ON, onTourNext } from './helpTour';

// A gesture-handler scroll view, so the swipe-down pan and sideways paging negotiate instead of the native pager eating every touch.
const PagerScroll = Animated.createAnimatedComponent(GestureScrollView);

const openSound = require('../../../assets/sounds/modal_open.mp3');
const closeSound = require('../../../assets/sounds/modal_close.mp3');

/** A page with optional live data for its hero (word icon and balance, drop odds). */
export type HelpSheetPage = HelpPage & { readonly heroData?: HeroData };
export type HelpSheetContent = Omit<HelpSheetSpec, 'pages'> & { readonly pages: readonly HelpSheetPage[] };

/** A small overshoot and settle, like the game's popups. */
const SPRING_IN = { damping: 16, stiffness: 260, mass: 0.85 } as const;
const OUT_MS = 190;
const seatTick = () => { void Haptics.selectionAsync().catch(() => undefined); };
const SIDE = 16;
/** The sheet's white side border; pages are exactly the space inside it, so a swiped page lands centered. */
const BORDER = 3;
/** Text never grows past this, so a page never needs to scroll at large text sizes. */
const MAX_FONT = 1.35;

export interface HelpLink { readonly label: string; readonly onPress: () => void }

export default function HelpSheet({ visible, sheet, onClose, state = 'ready', onRetry, links }: {
  readonly visible: boolean;
  readonly sheet: HelpSheetContent | null;
  readonly onClose: () => void;
  /** Sheets built from server data show a loader or an error with Try again while it loads. */
  readonly state?: 'ready' | 'loading' | 'error';
  readonly onRetry?: () => void;
  /** Quiet links under the main button (How to play, Get more), secondary to the explanation. */
  readonly links?: readonly HelpLink[];
}) {
  const [mounted, setMounted] = useState(visible);
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const open = useSharedValue(0);
  const drag = useSharedValue(0);
  const reveal = useSharedValue(0);
  const closing = useRef(false);

  const finishClose = useCallback(() => { closing.current = false; setMounted(false); }, []);

  useEffect(() => {
    if (visible) {
      closing.current = false;
      setMounted(true);
      drag.value = 0;
      open.value = 0;
      reveal.value = 0;
      playSound(openSound);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      open.value = reduced ? withTiming(1, { duration: 180 }) : withSpring(1, SPRING_IN);
      reveal.value = reduced ? 1 : withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    } else if (mounted && !closing.current) {
      closing.current = true;
      playSound(closeSound);
      // A tiny lift before the drop, so the exit has a beat of anticipation.
      const end = (done?: boolean) => { 'worklet'; if (done) runOnJS(finishClose)(); };
      open.value = reduced ? withTiming(0, { duration: 140 }, end)
        : withSequence(withTiming(1.012, { duration: 50 }), withTiming(0, { duration: OUT_MS, easing: Easing.in(Easing.quad) }, end));
    }
    // Only the visible flag drives open and close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* Its own safe-area root: the sheet also renders from HelpProvider, above the app's SafeAreaProvider. */}
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          {mounted && sheet && (
            <SheetBody sheet={sheet} open={open} drag={drag} reveal={reveal} reduced={reduced} active={visible}
              onClose={onClose} state={state} onRetry={onRetry} links={links} />
          )}
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}

function SheetBody({ sheet, open, drag, reveal, reduced, active, onClose, state, onRetry, links }: {
  readonly sheet: HelpSheetContent;
  readonly open: SharedValue<number>;
  readonly drag: SharedValue<number>;
  readonly reveal: SharedValue<number>;
  readonly reduced: boolean;
  readonly active: boolean;
  readonly onClose: () => void;
  readonly state: 'ready' | 'loading' | 'error';
  readonly onRetry?: () => void;
  readonly links?: readonly HelpLink[];
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pages = sheet.pages;
  const [page, setPage] = useState(0);
  const scroll = useAnimatedRef<GestureScrollView>();
  const scrollX = useSharedValue(0);
  const pageW = width - BORDER * 2;
  // Short phones (SE) get a shorter hero so a page never needs to scroll.
  const heroH = Math.round(Math.min(188, Math.max(140, height * 0.22)));
  const heroW = pageW - SIDE * 2;
  const last = page >= pages.length - 1;
  const ready = state === 'ready' && pages.length > 0;

  const close = useCallback(() => onClose(), [onClose]);

  const goTo = useCallback((index: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, index));
    scroll.current?.scrollTo({ x: next * pageW, animated: !reduced });
    if (reduced) setPage(next);
  }, [pages.length, pageW, reduced, scroll]);

  const onSettle = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageW);
    if (next !== page && next >= 0 && next < pages.length) {
      setPage(next);
      playSfx('ui.select', 0.45);
      void Haptics.selectionAsync().catch(() => undefined);
    }
  }, [page, pageW, pages.length]);

  useEffect(() => {
    if (!HELP_TOUR_ON) return undefined;
    onTourNext(() => goTo(page + 1));
    return () => onTourNext(null);
  }, [goTo, page]);

  const onScroll = useAnimatedScrollHandler(event => { scrollX.value = event.contentOffset.x; });

  // Swipe down to close. Sideways swipes belong to the pages.
  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetY([-12, 12])
    .failOffsetX([-14, 14])
    .onUpdate(event => {
      drag.value = event.translationY > 0 ? event.translationY : event.translationY * 0.15;
    })
    .onEnd(event => {
      if (event.translationY > 110 || event.velocityY > 900) {
        runOnJS(close)();
      } else {
        drag.value = withSpring(0, { damping: 18, stiffness: 260 });
      }
    }), [close, drag]);

  const linkRow = links?.length ? (
              <View style={styles.links}>
                {links.map(link => (
                  <Pressable key={link.label} onPress={link.onPress} accessibilityRole="button" accessibilityLabel={link.label} hitSlop={6}
                    style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.moreText}>{link.label}</Text>
                    <GameIcon name="arrow" size={16} />
                  </Pressable>
                ))}
              </View>
            
  ) : null;
  // The footer arrives with the points, after the gold button art has decoded, so it never shows empty.
  const footerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(reveal.value, [0.3, 0.55], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(reveal.value, [0.3, 0.62, 0.8], [0.94, 1.04, 1], 'clamp') }],
  }));
  // A soft tick the first time the sheet reaches its seat (not when the spring finally rests).
  const seated = useSharedValue(0);
  useAnimatedReaction(() => open.value >= 0.995, (now, before) => {
    if (now && !before && seated.value === 0 && !reduced) { seated.value = 1; runOnJS(seatTick)(); }
  });
  const scrim = useAnimatedStyle(() => ({
    // On the way out the scrim clears a little ahead of the sheet.
    opacity: interpolate(open.value, [0.2, 1], [0, 1], 'clamp') * interpolate(drag.value, [0, 300], [1, 0.4], 'clamp'),
  }));
  const sheetStyle = useAnimatedStyle(() => (reduced
    ? { opacity: Math.min(1, open.value), transform: [{ translateY: Math.max(0, drag.value) }] }
    // Slide from below the window, a fixed distance, so a late height measure never makes the sheet sag mid-spring.
    : { transform: [{ translateY: (1 - open.value) * height + drag.value }] }));

  return (
    // A Modal is its own native root, so the app's idle tracker never sees these touches: report them.
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onTouchStart={() => markUserActivity()}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close help" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.sheet, { maxHeight: height - insets.top - 12, paddingBottom: Math.max(insets.bottom, 14) + 4 }, sheetStyle]}>
          {/* Header row on the cream: the drag handle, and the close button, which never sits on the art. */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close help" hitSlop={6}
              style={({ pressed }) => [styles.close, pressed && { transform: [{ scale: 0.92 }] }]}>
              <GameIcon name="close" size={32} />
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={styles.srOnly}>
            {`${sheet.name} help${pages.length > 1 ? `, page ${page + 1} of ${pages.length}` : ''}`}
          </Text>
          {ready ? (
            <PagerScroll ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={pages.length > 1}
              scrollEnabled={pages.length > 1} onScroll={onScroll} scrollEventThrottle={16} onMomentumScrollEnd={onSettle}
              decelerationRate="fast">
              {pages.map((p, index) => Math.abs(index - page) > 1 ? (
                // Pages two or more away mount when they come near (spreads the open cost on long sheets).
                <View key={p.key} style={{ width: pageW }} />
              ) : (
                <PageView key={p.key} page={p} index={index} width={pageW} heroW={heroW} heroH={heroH}
                  running={active && index === page} reduced={reduced} reveal={reveal} scrollX={scrollX} />
              ))}
            </PagerScroll>
          ) : (
            <View style={{ height: heroH + 190, justifyContent: 'center', paddingHorizontal: SIDE }}>
              <SharkLoader state={state === 'error' ? 'error' : 'loading'} title={state === 'error' ? 'Couldn\'t load this' : undefined} onRetry={onRetry} />
            </View>
          )}
          <Animated.View style={[styles.footer, footerStyle]}>
            {/* Always the same slot, so the button sits at one height on every sheet. */}
            <View style={styles.dots}>
              {/* One-page sheets put their quiet links in this slot, so the gold button sits where it does everywhere. */}
              {ready && pages.length <= 1 && !!links?.length && linkRow}
              {ready && pages.length > 1 && pages.map((p, index) => (
                <Dot key={p.key} index={index} width={pageW} scrollX={scrollX} count={pages.length} onPress={() => goTo(index)} />
              ))}
            </View>
            <GameButton label={!ready || last ? 'Got it' : 'Next'} onPress={!ready || last ? close : () => goTo(page + 1)}
              icon={!ready || last ? undefined : 'arrow'}
              accessibilityHint={!ready || last ? 'Closes help' : `Shows page ${page + 2} of ${pages.length}`}
              style={{ alignSelf: 'center', width: Math.min(pageW - SIDE * 4, 300) }} />
            {!!links?.length && pages.length > 1 && linkRow}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function PageView({ page, index, width, heroW, heroH, running, reduced, reveal, scrollX }: {
  readonly page: HelpSheetPage; readonly index: number; readonly width: number; readonly heroW: number; readonly heroH: number;
  readonly running: boolean; readonly reduced: boolean; readonly reveal: SharedValue<number>; readonly scrollX: SharedValue<number>;
}) {
  // The first page staggers in with the sheet; later pages drift in a little as they are swiped to.
  const heroStyle = useAnimatedStyle(() => {
    const k = index === 0 ? interpolate(reveal.value, [0, 0.45], [0, 1], 'clamp') : 1;
    const away = Math.min(1, Math.abs(scrollX.value / width - index));
    const pop = index === 0 ? interpolate(reveal.value, [0, 0.3, 0.45], [0.88, 1.03, 1], 'clamp') : 1;
    return { opacity: k, transform: [{ scale: pop * (1 - away * 0.05) }] };
  });
  const textStyle = (at: number) => () => {
    'worklet';
    const k = index === 0 ? interpolate(reveal.value, [at, at + 0.4], [0, 1], 'clamp') : 1;
    const away = scrollX.value / width - index;
    return { opacity: k * (1 - Math.min(1, Math.abs(away)) * 0.6), transform: [{ translateY: (1 - k) * 16 }, { translateX: -away * 26 }] };
  };
  const head = useAnimatedStyle(textStyle(0.22));
  const p0 = useAnimatedStyle(textStyle(0.34));
  const p1 = useAnimatedStyle(textStyle(0.44));
  const p2 = useAnimatedStyle(textStyle(0.54));
  const pointStyles = [p0, p1, p2];
  const label = `${page.headline}. ${page.points.map(point => point.text).join(' ')}`;
  return (
    <View style={{ width, paddingHorizontal: SIDE }}>
      <Animated.View style={[styles.heroWindow, { height: heroH }, heroStyle]}>
        <HelpHero hero={page.hero} width={heroW - 6} height={heroH - 6} running={running} reduced={reduced} data={page.heroData} />
      </Animated.View>
      <View accessible accessibilityLabel={label} style={styles.textBlock}>
        <Animated.Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}
          style={[styles.headline, head]}>{page.headline}</Animated.Text>
        {page.points.length > 3 ? (
          // Server-written rules (Home Hunt, odds) can run longer: they scroll inside the page, smaller.
          <ScrollView style={[styles.points, { maxHeight: 156 }]} contentContainerStyle={{ gap: 6, paddingBottom: 6 }}
            showsVerticalScrollIndicator nestedScrollEnabled>
            {page.points.map((point, i) => (
              <View key={`${i}:${point.text}`} style={[styles.point, { minHeight: 32 }]}>
                <View style={[styles.pointIcon, styles.pointIconSmall]}><GameIcon name={point.icon} size={18} /></View>
                <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.pointText, styles.pointTextSmall]}>{point.text}</Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.points}>
            {page.points.map((point, i) => (
              <Animated.View key={`${i}:${point.text}`} style={[styles.point, pointStyles[Math.min(i, 2)]]}>
                <View style={styles.pointIcon}><GameIcon name={point.icon} size={26} /></View>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.pointText}>{point.text}</Text>
              </Animated.View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Dot({ index, width, scrollX, count, onPress }: {
  readonly index: number; readonly width: number; readonly scrollX: SharedValue<number>; readonly count: number; readonly onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(scrollX.value / width - index));
    return { width: 10 + 16 * (1 - d), backgroundColor: d < 0.5 ? BRAND.blue : '#b9d8f2' };
  });
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Page ${index + 1} of ${count}`}
      hitSlop={{ top: 7, bottom: 7, left: 6, right: 6 }} style={{ height: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.dot, style]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(5,40,96,0.42)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: BRAND.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30,
    borderWidth: 3, borderBottomWidth: 0, borderColor: BRAND.white, paddingTop: 10,
    shadowColor: BRAND.navy, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 16,
  },
  header: { height: 40, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(5,52,110,0.18)' },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  heroWindow: {
    borderRadius: 24, borderWidth: 3, borderColor: BRAND.white, overflow: 'hidden', backgroundColor: BRAND.skyDeep,
    shadowColor: BRAND.navy, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  textBlock: { alignItems: 'center', paddingTop: 14, paddingHorizontal: 6 },
  headline: { fontFamily: 'Shark', fontSize: 27, lineHeight: 31, color: BRAND.navy, textAlign: 'center' },
  points: { alignSelf: 'stretch', marginTop: 10, gap: 8, paddingHorizontal: 4 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  pointIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.blueBright,
    borderBottomWidth: 4.5, borderBottomColor: BRAND.blueLip,
    alignItems: 'center', justifyContent: 'center',
  },
  pointText: { flex: 1, fontFamily: 'Knockout', fontSize: 19, lineHeight: 23, color: BRAND.navy },
  pointIconSmall: { width: 30, height: 30, borderRadius: 15 },
  pointTextSmall: { fontSize: 16, lineHeight: 20 },
  footer: { paddingTop: 4, gap: 6, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'center', minHeight: 30 },
  dot: { height: 10, borderRadius: 5 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12 },
  moreText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.blue, marginTop: 2 },
  close: { position: 'absolute', right: 10, top: -2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
