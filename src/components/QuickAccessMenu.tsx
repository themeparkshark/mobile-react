/**
 * The home map menu: Alex's round blue button opens a stack of framed rows
 * (round Alex badge + blue fin bar label). The whole row is the tap target.
 * Opening springs in with a stagger; closing runs the stagger in reverse.
 * Collections shows a gift badge when a set reward is waiting.
 *
 * Motion runs on the UI thread (Reanimated); Reduce Motion swaps every move
 * for a short fade.
 */
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSfx } from '../gamekit/SFX';
import * as Haptics from '../helpers/haptics';
import * as RootNavigation from '../RootNavigation';
import { cachedBook, invalidateBook, prefetchBook, rewardWaitingFrom } from '../screens/SetCollection/dexCache';
import { BRAND, GameIcon, type GameIconName } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';

const ROUND = {
  gold: require('../../assets/images/alex-ui/round-gold.webp'),
  green: require('../../assets/images/alex-ui/round-green.webp'),
  blue: require('../../assets/images/alex-ui/round-blue.webp'),
  purple: require('../../assets/images/alex-ui/round-purple.webp'),
  slate: require('../../assets/images/alex-ui/round-slate.webp'),
} as const;
const FAB = require('../../assets/images/alex-ui/fab-blue.webp');
const CLOSE = require('../../assets/images/alex-ui/close-red.webp');
const LABEL_BAR = require('../../assets/images/alex-ui/label-bar.webp');
const RIBBON = require('../../assets/images/ribbon.png');
const AnimatedBlur = Animated.createAnimatedComponent(BlurView);
const FAB_SIZE = 68;

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon: GameIconName;
  readonly round: keyof typeof ROUND;
  readonly screen: string;
  readonly params?: object;
}

export const MENU_ITEMS: readonly MenuItem[] = [
  { id: 'sets', label: 'Collections', icon: 'chest', round: 'gold', screen: 'SetCollection' },
  { id: 'stamps', label: 'Stamp Book', icon: 'medal1', round: 'green', screen: 'StampBook' },
  { id: 'shop', label: 'Shark Shop', icon: 'coins', round: 'blue', screen: 'Store', params: { store: 'shark-shop' } },
  { id: 'help', label: 'How to Play', icon: 'info', round: 'purple', screen: 'HowToPlay' },
  { id: 'settings', label: 'Settings', icon: 'settings', round: 'slate', screen: 'Settings' },
];

/** Open: top row first, 50 ms apart. Close: bottom row first, 30 ms apart. */
export function menuDelay(index: number, count: number, opening: boolean): number {
  return opening ? index * 50 : (count - 1 - index) * 30;
}

// "Is a set reward waiting": from the shared book cache (one request set, reused by the book itself).
function useRewardWaiting(open: boolean): boolean {
  const [waiting, setWaiting] = useState(() => rewardWaitingFrom(cachedBook()));
  useEffect(() => {
    let live = true;
    void prefetchBook().then(entry => { if (live) setWaiting(rewardWaitingFrom(entry)); });
    return () => { live = false; };
  }, [open]);
  return waiting;
}

/** Collections calls this after a claim so the badge clears at once. */
export function invalidateMenuRewardBadge(): void {
  invalidateBook();
}

/** `position` is accepted for the existing home map call; the menu only ships bottom-left. */
interface Props { readonly position?: 'left' }

/** The home map menu, bottom-left (the only place it ships). */
export default function QuickAccessMenu(_props: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reduced = useUiReducedMotion();
  const insets = useSafeAreaInsets();
  const rewardWaiting = useRewardWaiting(open);
  const scrim = useSharedValue(0);
  const fabSpin = useSharedValue(0);
  const [popIndex, setPopIndex] = useState<number | null>(null);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  // The open menu lives in a Modal so nothing from the map (the focus card) can draw above its scrim.
  // The Modal's close button sits exactly where the inline button is.
  const fabRef = useRef<View>(null);
  const [fabAt, setFabAt] = useState<{ x: number; y: number } | null>(null);

  // Rows animate themselves from `open`; this drives the scrim and button and waits out the close.
  const animateTo = useCallback((next: boolean, then?: () => void) => {
    scrim.value = withTiming(next ? 1 : 0, { duration: next ? 200 : 180 });
    fabSpin.value = reduced ? withTiming(next ? 1 : 0, { duration: 150 }) : withSpring(next ? 1 : 0, { damping: 12, stiffness: 220 });
    const total = next ? 0 : (reduced ? 150 : menuDelay(0, MENU_ITEMS.length, false) + 140);
    timers.current.push(setTimeout(() => then?.(), total));
  }, [reduced, scrim, fabSpin]);

  const openMenu = () => {
    if (busy.current) return;
    fabRef.current?.measureInWindow((x, y) => setFabAt({ x, y }));
    void prefetchBook(); // the book opens instantly from this copy
    setMounted(true);
    setOpen(true);
    playSfx('fx.whoosh', 0.45);
    if (Platform.OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPopIndex(null);
    requestAnimationFrame(() => animateTo(true));
  };

  const closeMenu = (then?: () => void) => {
    if (busy.current) return;
    busy.current = true;
    setOpen(false);
    playSfx('fx.whoosh', 0.25);
    animateTo(false, () => {
      busy.current = false;
      setMounted(false);
      then?.();
    });
  };

  const choose = (item: MenuItem, index: number) => {
    if (busy.current) return;
    playSfx('ui.tap', 0.6);
    if (Platform.OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPopIndex(index);
    later(() => closeMenu(() => RootNavigation.navigate(item.screen, item.params)), reduced ? 0 : 140);
  };

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const headerStyle = useAnimatedStyle(() => (reduced ? { opacity: scrim.value } : {
    opacity: scrim.value,
    transform: [{ translateY: (1 - scrim.value) * 16 }],
  }));
  // The blur stays at full layer opacity (iOS drops the effect under a fading parent); its strength animates instead.
  const blurProps = useAnimatedProps(() => ({ intensity: 32 * scrim.value }));
  const barsStyle = useAnimatedStyle(() => ({ opacity: 1 - fabSpin.value, transform: [{ scale: 1 - 0.3 * fabSpin.value }] }));
  const closeStyle = useAnimatedStyle(() => ({ opacity: fabSpin.value, transform: [{ scale: 0.6 + 0.4 * fabSpin.value }] }));
  const bottom = Math.max(insets.bottom, 12) + 66;
  const windowH = useWindowDimensions().height;

  const fab = (inModal: boolean) => (
    <Pressable ref={inModal ? undefined : fabRef} accessibilityRole="button" accessibilityLabel={open ? 'Close menu' : 'Open menu'}
      accessibilityHint={!open && rewardWaiting ? 'A collection reward is waiting' : undefined}
      onPress={() => (open ? closeMenu() : openMenu())} hitSlop={8} style={styles.fab}>
      <Image source={FAB} style={StyleSheet.absoluteFill} contentFit="contain" />
      <Animated.View style={[styles.bars, barsStyle]}>
        {[0, 1, 2].map(line => <View key={line} style={styles.bar} />)}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, closeStyle]}>
        <Image source={CLOSE} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
      {!open && rewardWaiting && <View style={styles.fabBadge}><GameIcon name="gift" size={22} /></View>}
    </Pressable>
  );

  return (
    <>
      <View pointerEvents="box-none" style={[styles.stack, { bottom, left: 14 }]}>
        {fab(false)}
      </View>
      <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={() => closeMenu()}>
        <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
          <AnimatedBlur animatedProps={blurProps} tint="dark" style={StyleSheet.absoluteFill} />
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,52,110,0.6)' }, scrimStyle]} />
          <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => closeMenu()} />
        </View>
        {/* One modal scope for VoiceOver: the rows AND the close button, with the escape gesture closing the menu. */}
        <View pointerEvents="box-none" accessibilityViewIsModal={open} onAccessibilityEscape={() => { if (open) closeMenu(); }}
          style={[styles.stack, fabAt ? { top: undefined, left: fabAt.x, bottom: windowH - fabAt.y - FAB_SIZE } : { bottom, left: 14 }]}>
          <View accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
            pointerEvents={open ? 'box-none' : 'none'} style={{ alignItems: 'flex-start' }}>
            <Animated.View style={[styles.header, headerStyle]}>
              <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" />
              <Text style={styles.headerText} accessibilityRole="header" maxFontSizeMultiplier={1.2}>Menu</Text>
            </Animated.View>
            {MENU_ITEMS.map((item, index) => (
              <MenuRow key={item.id} item={item} index={index} open={open} reduced={reduced} popped={popIndex === index}
                badge={item.id === 'sets' && rewardWaiting} onPress={() => choose(item, index)} />
            ))}
          </View>
          {fab(true)}
        </View>
      </Modal>
    </>
  );
}

function MenuRow({ item, index, open, reduced, popped, badge, onPress }: {
  readonly item: MenuItem; readonly index: number; readonly open: boolean; readonly reduced: boolean; readonly popped: boolean;
  readonly badge: boolean; readonly onPress: () => void;
}) {
  const t = useSharedValue(0);
  const pop = useSharedValue(1);
  useEffect(() => {
    const delay = menuDelay(index, MENU_ITEMS.length, open);
    if (reduced) t.value = withTiming(open ? 1 : 0, { duration: 150 });
    else if (open) t.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 190 }));
    else t.value = withDelay(delay, withTiming(0, { duration: 130 }));
  }, [open, reduced, index, t]);
  useEffect(() => {
    if (popped && !reduced) pop.value = withSequence(withTiming(1.08, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 260 }));
  }, [popped, reduced, pop]);
  const style = useAnimatedStyle(() => (reduced ? { opacity: t.value } : {
    opacity: Math.min(1, t.value * 1.4),
    transform: [{ translateY: (1 - t.value) * 30 }, { scale: (0.9 + 0.1 * t.value) * pop.value }],
  }));
  const bounce = useSharedValue(1);
  useEffect(() => {
    if (!open || !badge || reduced) return;
    bounce.value = withDelay(menuDelay(index, MENU_ITEMS.length, true) + 260,
      withSequence(withTiming(1.35, { duration: 140 }), withSpring(1, { damping: 6, stiffness: 260 })));
  }, [open, badge, reduced, index, bounce]);
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }] }));
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const round = (
    <View style={styles.round}>
      <Image source={ROUND[item.round]} style={StyleSheet.absoluteFill} contentFit="contain" />
      <GameIcon name={item.icon} size={38} />
      {badge && <Animated.View style={[styles.badge, badgeStyle]}><GameIcon name="gift" size={20} /></Animated.View>}
    </View>
  );
  const label = (
    <View style={styles.label}>
      <Image source={LABEL_BAR} style={StyleSheet.absoluteFill} contentFit="fill" />
      <Text style={styles.labelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15}>{item.label}</Text>
    </View>
  );
  return (
    <Animated.View style={style}>
      <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${item.label}, a reward is waiting` : item.label}
        onPress={onPress}
        onPressIn={() => { press.value = withSpring(0.94, { damping: 15, stiffness: 420 }); }}
        onPressOut={() => { press.value = withSpring(1, { damping: 8, stiffness: 260 }); }}>
        <Animated.View style={[styles.row, pressStyle]}>
          {round}
          {label}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', zIndex: 99 },
  header: { width: 190, height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 6, alignSelf: 'center' },
  headerText: { fontFamily: 'Shark', fontSize: 22, color: '#7a3d00', marginTop: -4 },
  row: { alignItems: 'center', minHeight: 66, marginBottom: 6 },
  round: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -4, right: -4, width: 30, height: 30, borderRadius: 15, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.gold,
  },
  label: { width: 176, height: 50, marginHorizontal: -6, justifyContent: 'center', paddingLeft: 20, paddingRight: 16, zIndex: -1 },
  labelText: {
    fontFamily: 'Shark', fontSize: 19, color: BRAND.white,
    textShadowColor: 'rgba(5,52,110,0.7)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  fab: { width: FAB_SIZE, height: FAB_SIZE, alignItems: 'center', justifyContent: 'center' },
  bars: { alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: -6 },
  bar: { width: 28, height: 6, borderRadius: 3, backgroundColor: BRAND.white, borderWidth: 1.5, borderColor: '#0b3f78' },
  fabBadge: {
    position: 'absolute', top: -6, right: -6, width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.gold,
  },
});
