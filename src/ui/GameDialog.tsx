/**
 * GameDialog (WS0 UI kit): the branded replacement for Alert.alert.
 *
 * Imperative, Alert-compatible (mount <GameDialogHost /> once near the root):
 *   gameAlert('Out of Tickets', 'Start a queue adventure to earn one.');
 *   const leave = await confirmGame({ title: 'Leave the line?', confirmLabel: 'Leave', destructive: true });
 *
 * Controlled, for a screen that owns the state:
 *   <GameDialog visible={open} title="Saved!" icon="check" buttons={[{ text: 'Nice' }]} onAnswer={() => setOpen(false)} />
 *
 * Look: Dustin's own modal template, the one TaskCoinModal and
 * UnfoundCoinModal use: his ribbon.png title (the Ribbon component) over the
 * house blue card with a white border, white copy, an optional GameIcon, and
 * his yellow image buttons stacked with the main action on top (red for
 * destructive, a quiet text action for cancel). The scrim is a light blur
 * with a navy tint, never black or grey.
 * Titles up to RIBBON_TITLE_MAX characters sit in the ribbon; a longer title
 * becomes a wrapping heading on the card (and warns in dev) so it never
 * shrinks to an unreadable size.
 * Motion (src/ui/motion.ts): the scrim fades in over DURATION.base, the card pops from 0.86 with
 * one overshoot (SPRING.pop) while it fades in over DURATION.quick, the ribbon drops in from above and
 * stamps down (SPRING.stamp, from 1.18), then the body and buttons arrive STAGGER.stepMs apart.
 * A celebrating dialog (a reward icon or a success haptic, never a destructive one) throws a pair of
 * gold star sparkles off the ribbon tails as it lands. It leaves quicker than it came: scale 0.94 and fade over
 * DURATION.exit on EASE.in. A selection tick on open. Reduced motion fades.
 * The preference is known on the first render (useUiReducedMotion), so a
 * dialog that mounts already open still springs.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { modalLayers, useModalLayer } from './modalLayers';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Dimensions } from 'react-native';
import useUiReducedMotion from './useUiReducedMotion';
import { haptic, queueHaptic } from '../gamekit/Haptics';
import { DURATION, EASE, SPRING, STAGGER } from './motionEasing';
import SparkleBurst from './SparkleBurst';
import { GoldBurst } from './GoldBurst';
import { LinearGradient } from 'expo-linear-gradient';
import GameButton from './GameButton';
import GameIcon from './GameIcon';
import GameText from './GameText';
import Ribbon from '../components/Ribbon';
import {
  createDialogStore,
  dialogCelebrates,
  dialogTitleLayout,
  dismissAction,
  RIBBON_TITLE_MAX,
  layoutActions,
  type DialogRequest,
  type GameDialogButton,
  type GameDialogOptions,
} from './gameDialogModel';
import { BRAND, MOTION, SPACE, Z } from './tokens';

/** Dustin's modal card, as in UnfoundCoinModal and TaskCoinModal. */
export const DIALOG_CARD = {
  backgroundColor: '#0a77bf',
  borderRadius: 20,
  borderWidth: 2.5,
  borderColor: '#ffffff',
} as const;
/** The card pops in from this scale and leaves to CARD_EXIT. */
const CARD_FROM = 0.86;
const CARD_EXIT = 0.94;
/** Each part (ribbon, body, buttons) pops and rises over PART_MS, STAGGER.stepMs after the one above. */
const PART_MS = DURATION.base;
const PARTS_MS = PART_MS + 2 * STAGGER.stepMs;
/**
 * Parts are fully opaque from their first frame: a half-faded yellow button over the blue card reads
 * as a disabled olive one, and a fade under the card's own fade flickers. They move only: a pop from
 * PART_FROM_SCALE with an 8 pt rise.
 */
export const PART_FROM_OPACITY = 1;
export const PART_FROM_SCALE = 0.9;
/** The card itself is fully visible after this long (ms), so nothing on it ever reads half there. */
export const CARD_FADE_MS = DURATION.tap;
/** Part i of the card at time `clock` (ms): pops from 0.9 and rises 8 pt into place. Pure worklet (unit tested). */
export function partStyle(clock: number, i: number, reduced: boolean) {
  'worklet';
  if (reduced) return {};
  const raw = Math.min(1, Math.max(0, (clock - i * STAGGER.stepMs) / PART_MS));
  // Ease out (quick arrival, soft landing).
  const t = 1 - (1 - raw) * (1 - raw) * (1 - raw);
  return { transform: [{ translateY: (1 - t) * 8 }, { scale: PART_FROM_SCALE + (1 - PART_FROM_SCALE) * t }] };
}
/** The icon stamps in on its own beat: small, past full size, then rest (with a gold glint on a reward). */
export const ICON_STAMP = { at: 110, from: 0.4, peak: 1.22 } as const;
/**
 * A celebrating dialog's prize: a bigger icon that stamps onto a fan of gold rays (the house GoldBurst),
 * the brightest thing on the screen, with the buzz on the stamp frame itself.
 */
export const DIALOG_PRIZE = { iconPt: 84, plainIconPt: 72, raysPt: 230, glowAmount: 1, bloomMs: 420 } as const;
/** The ribbon drops this far (pt) and stamps down from this scale. */
const RIBBON_DROP = 24;
const RIBBON_STAMP_FROM = 1.18;
/** The ribbon stamps from the card's first visible frame (an empty card never shows). */
export const RIBBON_AT = 0;
/** Where the ribbon's tails are (the ribbon spans the card's width, 85% of the screen up to 380 pt). */
const CARD_W = Math.min(380, Dimensions.get('window').width * 0.85);
const RIBBON_TAIL = { left: CARD_W * 0.06, right: CARD_W * 0.94, y: 30 } as const;
/**
 * The backdrop: underwater, not dirty. Brand blue, deeper at the top and bottom edges and light in the
 * middle band where the card and most buttons sit, so the colours behind the card stay clean (a heavy
 * even blue over yellow art reads olive). Never black or grey, no blur pass.
 */
export const DIALOG_SCRIM = 'rgba(0,88,196,0.30)';
export const DIALOG_SCRIM_STOPS = ['rgba(6,96,206,0.44)', 'rgba(20,130,230,0.16)', 'rgba(20,130,230,0.16)', 'rgba(4,70,170,0.46)'] as const;
/** Message copy on the card, as in UnfoundCoinModal. */
export const DIALOG_COPY = '#e2f6ff';

export type { GameDialogButton, GameDialogOptions };

const store = createDialogStore((title, message, buttons) => {
  Alert.alert(title, message, buttons.map(button => ({ text: button.text, style: button.style, onPress: button.onPress })));
});

/** Show a dialog. Resolves with the index of the chosen button (null if closed without one). */
export function showGameDialog(options: GameDialogOptions): Promise<number | null> {
  return store.show(options);
}

/** Drop-in for Alert.alert(title, message, buttons). */
export function gameAlert(title: string, message?: string, buttons?: readonly GameDialogButton[], options: Omit<GameDialogOptions, 'title' | 'message' | 'buttons'> = {}) {
  void store.show({ ...options, title, message, buttons });
}

/** Two-button confirm. Resolves true only when the confirm button is chosen. */
export async function confirmGame({
  title,
  message,
  icon,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
}: {
  title: string;
  message?: string;
  icon?: GameDialogOptions['icon'];
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const index = await store.show({
    title,
    message,
    icon,
    haptic: destructive ? 'warning' : 'none',
    buttons: [
      { text: cancelLabel, style: 'cancel' },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default' },
    ],
  });
  return index === 1;
}

export type GameDialogProps = GameDialogOptions & {
  readonly visible: boolean;
  /** Called after the close animation with the chosen button index, or null. */
  readonly onAnswer?: (index: number | null) => void;
  /** Extra content between the message and the buttons. */
  readonly children?: ReactNode;
  /** Run the chosen button's onPress after closing. Default true; the host sets false because the store runs it. */
  readonly runButtonHandlers?: boolean;
  /** Lift the card above the keyboard (dialogs whose children include a text field). Default false. */
  readonly avoidKeyboard?: boolean;
  readonly testID?: string;
};

/** Controlled dialog. Button onPress handlers run after the close animation. */
export function GameDialog({
  visible,
  title,
  message,
  icon,
  buttons,
  dismissible,
  haptic: hapticKind = 'none',
  onAnswer,
  children,
  runButtonHandlers = true,
  avoidKeyboard = false,
  testID,
  equalChoices = false,
}: GameDialogProps) {
  const reducedMotion = useUiReducedMotion();
  const [mounted, setMounted] = useState(() => visible && modalLayers.count() === 0);
  // Never a second sibling <Modal>: wait until every sheet or dialog opened before this one is gone
  // (ui/modalLayers.ts; a sibling iOS refuses to present froze the shop).
  const front = useModalLayer(visible || mounted, 'wait');
  const shown = visible && front;
  const closing = useRef(false);
  const chosen = useRef<number | null>(null);
  const stampTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (stampTimer.current) clearTimeout(stampTimer.current); }, []);
  const scrim = useSharedValue(0);
  const pop = useSharedValue(0);
  const fade = useSharedValue(0);
  const exit = useSharedValue(0);
  const parts = useSharedValue(0);
  const ribbon = useSharedValue(0);
  const tails = useSharedValue(0);
  const iconPop = useSharedValue(1);
  const iconSpark = useSharedValue(0);
  const prizeGlow = useSharedValue(0);
  const prizeBloom = useSharedValue(0);
  const actions = layoutActions(buttons, equalChoices);
  const celebrates = dialogCelebrates({ icon, haptic: hapticKind, buttons });
  const request = { title, message, icon, buttons, dismissible };
  const titleLayout = dialogTitleLayout(title);
  useEffect(() => {
    if (__DEV__ && visible && titleLayout.placement === 'card') {
      console.warn(`GameDialog: "${title}" is longer than ${RIBBON_TITLE_MAX} characters, so it moves off the ribbon. Pass a short title and put the rest in the message.`);
    }
  }, [visible, title, titleLayout.placement]);

  useEffect(() => {
    if (shown) {
      closing.current = false;
      chosen.current = null;
      setMounted(true);
      exit.value = 0;
      scrim.value = withTiming(1, { duration: reducedMotion ? MOTION.fadeMs : DURATION.base, easing: EASE.out });
      fade.value = withTiming(1, { duration: reducedMotion ? MOTION.fadeMs : CARD_FADE_MS, easing: EASE.out });
      iconPop.value = reducedMotion ? 1 : ICON_STAMP.from;
      if (!reducedMotion) {
        iconPop.value = withDelay(ICON_STAMP.at, withSequence(
          withTiming(ICON_STAMP.peak, { duration: DURATION.tap + 30, easing: EASE.out }), withSpring(1, SPRING.pop)));
      }
      iconSpark.value = 0;
      prizeGlow.value = 0;
      prizeBloom.value = 0;
      if (celebrates && icon) {
        // The rays gather behind the prize, bloom on the stamp frame, then settle to a warm glow.
        prizeGlow.value = reducedMotion ? 0.7 : withDelay(ICON_STAMP.at - 60, withTiming(DIALOG_PRIZE.glowAmount, { duration: 220, easing: EASE.out }));
        if (!reducedMotion) prizeBloom.value = withDelay(ICON_STAMP.at + DURATION.tap, withSequence(
          withTiming(1, { duration: 90, easing: EASE.out }), withTiming(0, { duration: DIALOG_PRIZE.bloomMs, easing: EASE.in })));
      }
      if (celebrates && !reducedMotion) {
        iconSpark.value = withDelay(ICON_STAMP.at + DURATION.tap, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
      }
      pop.value = reducedMotion ? 1 : withSpring(1, SPRING.pop);
      parts.value = reducedMotion ? PARTS_MS : withTiming(PARTS_MS, { duration: PARTS_MS });
      ribbon.value = 0;
      ribbon.value = reducedMotion ? 1 : withDelay(RIBBON_AT, withSpring(1, SPRING.stamp));
      tails.value = 0;
      if (celebrates && !reducedMotion) {
        tails.value = withDelay(RIBBON_AT + 120, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
      }
      if (celebrates && icon) {
        // A prize buzzes on its stamp frame (the peak of the pop), not on the open.
        const kind = hapticKind;
        stampTimer.current = setTimeout(() => {
          if (kind !== 'none') haptic(kind); else queueHaptic('hitMedium');
        }, reducedMotion ? 0 : ICON_STAMP.at + DURATION.tap);
      } else if (hapticKind !== 'none') haptic(hapticKind);
      else queueHaptic('tickSelection');
    }
    // Opening only depends on visibility; haptic kind and motion are read at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const finish = () => {
    setMounted(false);
    const index = chosen.current;
    onAnswer?.(index);
    const button = index === null ? undefined : (buttons && buttons.length ? buttons : [{ text: 'OK' }])[index];
    if (runButtonHandlers) button?.onPress?.();
  };

  const close = (index: number | null) => {
    if (closing.current) return;
    closing.current = true;
    chosen.current = index;
    scrim.value = withTiming(0, { duration: DURATION.exit, easing: EASE.in });
    exit.value = withTiming(1, { duration: DURATION.exit, easing: EASE.in }, done => {
      if (done) runOnJS(finish)();
    });
  };

  useEffect(() => {
    if (!visible && mounted && !closing.current) close(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: fade.value * (1 - exit.value),
    transform: reducedMotion ? [] : [
      { scale: (CARD_FROM + (1 - CARD_FROM) * pop.value) * (1 - (1 - CARD_EXIT) * exit.value) },
    ],
  }));
  // Each part reads the shared clock directly (a shared value read only inside a nested worklet is not tracked).
  // The ribbon drops in and stamps down: one overshoot past its spot, then rest.
  const ribbonStyle = useAnimatedStyle(() => {
    if (reducedMotion) return {};
    const r = ribbon.value;
    return { opacity: Math.min(1, 0.6 + r * 3), transform: [{ translateY: -RIBBON_DROP * (1 - r) },
      { scale: RIBBON_STAMP_FROM + (1 - RIBBON_STAMP_FROM) * r }] };
  });
  const bodyStyle = useAnimatedStyle(() => partStyle(parts.value, 1, reducedMotion));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconPop.value }] }));
  const buttonsStyle = useAnimatedStyle(() => partStyle(parts.value, 2, reducedMotion));

  if (!mounted) return null;
  const dismiss = dismissAction(request);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent
      onRequestClose={() => { if (dismiss !== null) close(dismiss); }}>
      <KeyboardAvoidingView testID={testID} enabled={avoidKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: Z.dialog }}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          {/* Underwater light, no blur pass: deeper blue at the edges, light in the middle so the colours stay clean. */}
          <LinearGradient pointerEvents="none" colors={DIALOG_SCRIM_STOPS} locations={[0, 0.32, 0.68, 1]}
            style={StyleSheet.absoluteFill} />
          <Pressable accessibilityLabel="Close" accessibilityRole="button" style={{ flex: 1 }}
            disabled={dismiss === null} onPress={() => { if (dismiss !== null) close(dismiss); }} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal accessibilityRole="alert"
          style={[{ width: '85%', maxWidth: 380, alignItems: 'center' }, cardStyle]}>
          {titleLayout.placement === 'ribbon' && (
            <Animated.View accessible accessibilityRole="header" accessibilityLabel={title} style={[{ width: '100%', zIndex: 2 }, ribbonStyle]}>
              <Ribbon text={titleLayout.text} />
              {celebrates && <>
                <SparkleBurst progress={tails} count={3} x={RIBBON_TAIL.left} y={RIBBON_TAIL.y} spread={[-200, -120]}
                  dist={[22, 40]} size={[14, 18]} seed={3} />
                <SparkleBurst progress={tails} count={3} x={RIBBON_TAIL.right} y={RIBBON_TAIL.y} spread={[-60, 20]}
                  dist={[22, 40]} size={[14, 18]} seed={5} />
              </>}
            </Animated.View>
          )}
          <View style={{
            ...DIALOG_CARD,
            width: '95%',
            marginTop: titleLayout.placement === 'ribbon' ? '-10%' : 0,
            paddingTop: titleLayout.placement === 'ribbon' ? SPACE.xxl + SPACE.sm : SPACE.xl,
            paddingHorizontal: SPACE.xl,
            paddingBottom: SPACE.lg,
            alignItems: 'center',
            gap: SPACE.md,
          }}>
            <Animated.View style={[{ alignSelf: 'stretch', alignItems: 'center', gap: SPACE.md }, bodyStyle]}>
            {titleLayout.placement === 'card' && (
              <GameText preset="title" tone="onBlue" align="center" accessibilityRole="header"
                style={{ textTransform: 'uppercase' }}>{titleLayout.text}</GameText>
            )}
            {icon && <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, iconStyle]}>
              {/* A prize stamps onto a fan of gold rays: the brightest thing on the screen. */}
              {celebrates && <GoldBurst size={DIALOG_PRIZE.raysPt} amount={prizeGlow} bloom={prizeBloom} reduced={reducedMotion}
                style={{ position: 'absolute' }} />}
              <GameIcon name={icon} size={celebrates ? DIALOG_PRIZE.iconPt : DIALOG_PRIZE.plainIconPt} />
              {/* A reward's icon lands with a ring of gold stars around it. */}
              {celebrates && <SparkleBurst progress={iconSpark} count={8} x={DIALOG_PRIZE.iconPt / 2} y={DIALOG_PRIZE.iconPt / 2}
                spread={[-210, 30]} dist={[52, 78]} size={[16, 22]} seed={9} />}
            </Animated.View>}
            {!!message && <GameText preset="body" tone="onBlue" align="center" style={{ color: DIALOG_COPY }}>{message}</GameText>}
            {children}
            </Animated.View>
            <Animated.View style={[{ alignSelf: 'stretch', gap: SPACE.xs, marginTop: SPACE.xs }, buttonsStyle]}>
              {actions.map(action => (
                <GameButton key={action.index} label={action.text} variant={action.variant} tone="onBlue" icon={action.icon} image={action.image}
                  onPress={() => close(action.index)} />
              ))}
            </Animated.View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Mount exactly once near the root (WS9 owns Root.tsx). Do not mount one per
 * screen: only the newest host shows dialogs.
 */
export function GameDialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [visible, setVisible] = useState(false);
  const current = useRef<DialogRequest | null>(null);
  useEffect(() => store.attach(next => {
    current.current = next;
    setRequest(next);
    setVisible(!!next);
  }), []);
  if (!request) return null;
  return <GameDialog key={request.id} visible={visible} title={request.title} message={request.message}
    icon={request.icon} buttons={request.buttons} dismissible={request.dismissible} haptic={request.haptic} equalChoices={request.equalChoices}
    runButtonHandlers={false}
    onAnswer={index => { if (current.current) store.answer(current.current.id, index); }} />;
}

export default GameDialog;
