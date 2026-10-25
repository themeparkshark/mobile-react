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
 * gold star sparkles off the ribbon tails as it lands. It leaves quicker than it came: the card shrinks to
 * CARD_EXIT and stays solid until its last frames (DIALOG_CLOSE.cardMs, never a see-through card over the
 * buttons behind it), and the backdrop leaves last. A selection tick on open. Reduced motion fades.
 * The preference is known on the first render (useUiReducedMotion), so a
 * dialog that mounts already open still springs.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { modalLayers, useModalLayer } from './modalLayers';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
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
import { flyCoins, measureShelfTarget } from './CoinFlight';
import { glanceGoal } from './goalGlance';
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
const CARD_EXIT = 0.92;
/**
 * The close: a snappy shrink (the card stays solid until its last frames), then the backdrop leaves
 * last, so the screen behind never shows through a half-faded card.
 */
export const DIALOG_CLOSE = { cardMs: 140, scrimDelayMs: 60, scrimMs: 170 } as const;
/** The card's opacity at close progress e (0 to 1): solid for most of the shrink, gone at the end. Pure worklet. */
export function closeOpacity(e: number): number {
  'worklet';
  return 1 - e * e * e * e;
}
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
export const DIALOG_PRIZE = { iconPt: 124, plainIconPt: 72, raysPt: 380, glowAmount: 1, bloomMs: 420,
  /** A wider fan of the same rays behind the card and the ribbon, so the burst reaches past the card's edges. */
  outerRaysPt: 660,
  /** Taking the prize (OK): it flies from the card to the shelf (the Profile tab) at this size and lands this small. */
  flyPt: 96, flyEndScale: 0.42 } as const;
/** A fresh dialog's card is solid inside this (ms): a pop, never a see-through card over the buttons behind it. */
export const CARD_SOLID_MS = 50;
/** The ribbon drops this far (pt) and stamps down from this scale. */
const RIBBON_DROP = 24;
const RIBBON_STAMP_FROM = 1.18;
/** The ribbon stamps from the card's first visible frame (an empty card never shows). */
export const RIBBON_AT = 0;
/** Where the ribbon's tails are (the ribbon spans the card's width, 85% of the screen up to 380 pt). */
const CARD_W = Math.min(380, Dimensions.get('window').width * 0.85);
const RIBBON_TAIL = { left: CARD_W * 0.06, right: CARD_W * 0.94, y: 30 } as const;
/**
 * The backdrop: underwater daylight, never dirty. Deep brand blue only at the top and bottom edges; across
 * the middle band (where the card and most buttons sit) a pale sky-blue haze that lightens what is behind
 * instead of darkening it, so cream reads as clean pale cream and blue as bright water (a dark tint over
 * cream read grey-green). Never black or grey, no blur pass.
 */
export const DIALOG_SCRIM = 'rgba(0,88,196,0.30)';
export const DIALOG_SCRIM_STOPS = ['rgba(6,96,206,0.46)', 'rgba(214,240,255,0.3)', 'rgba(214,240,255,0.3)', 'rgba(4,70,170,0.46)'] as const;
/** Where the backdrop's light band starts and ends (share of the screen): most of the screen stays nearly clear. */
export const DIALOG_SCRIM_AT = [0, 0.2, 0.82, 1] as const;
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
  /**
   * Which request this is (the host's queue id). When it changes while the dialog is up, the new card pops in on
   * the same backdrop.
   */
  readonly contentKey?: number | string;
  /** True when another dialog waits right behind this one: the backdrop stays up and only the card swaps. */
  readonly handOff?: () => boolean;
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
  contentKey,
  handOff,
}: GameDialogProps) {
  const reducedMotion = useUiReducedMotion();
  const [mounted, setMounted] = useState(() => visible && modalLayers.count() === 0);
  // Never a second sibling <Modal>: wait until every sheet or dialog opened before this one is gone
  // (ui/modalLayers.ts; a sibling iOS refuses to present froze the shop).
  const front = useModalLayer(visible || mounted, 'wait');
  const shown = visible && front;
  const closing = useRef(false);
  const chosen = useRef<number | null>(null);
  /** 1 while a prize waits for its stamp frame: the buzz fires from the UI thread on that exact frame. */
  const stampArmed = useSharedValue(0);
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
  /** Where the prize sits inside the card (for the wide ray fan behind it), measured on layout; on: 1 once known. */
  const raysX = useSharedValue(0);
  const raysY = useSharedValue(0);
  const raysOn = useSharedValue(0);
  const outerRef = useRef<View>(null);
  const iconRef = useRef<View>(null);
  const actions = layoutActions(buttons, equalChoices);
  const celebrates = dialogCelebrates({ icon, haptic: hapticKind, buttons });
  const request = { title, message, icon, buttons, dismissible };
  const titleLayout = dialogTitleLayout(title);
  useEffect(() => {
    if (__DEV__ && visible && titleLayout.placement === 'card') {
      console.warn(`GameDialog: "${title}" is longer than ${RIBBON_TITLE_MAX} characters, so it moves off the ribbon. Pass a short title and put the rest in the message.`);
    }
  }, [visible, title, titleLayout.placement]);

  const buzzStamp = () => {
    if (hapticKind !== 'none') haptic(hapticKind); else queueHaptic('hitMedium');
  };
  // The prize's buzz lands on its stamp frame (the icon reaching its peak), timed on the UI thread.
  useAnimatedReaction(() => stampArmed.value === 1 && iconPop.value >= ICON_STAMP.peak - 0.02, (now, before) => {
    if (!now || before) return;
    stampArmed.value = 0;
    runOnJS(buzzStamp)();
  });

  // Mount first, then animate: a dialog that waited its turn (queued behind another) mounts its views
  // in the render after it is shown, and an opening started before its backdrop existed never drew it.
  useEffect(() => {
    if (shown) setMounted(true);
    else openedFor.current = null;
  }, [shown]);
  /** The request the card was opened for (null while closed). */
  const openedFor = useRef<number | string | null>(null);
  const key = contentKey ?? 'one';
  useEffect(() => {
    if (shown && mounted && openedFor.current !== key) {
      // A queued dialog taking over an open one: the backdrop is already up, only the card pops in.
      const handedOver = openedFor.current !== null;
      openedFor.current = key;
      closing.current = false;
      chosen.current = null;
      exit.value = 0;
      pop.value = 0;
      // A card that took over keeps the same prize spot unless its layout moved (onLayout re-places it then).
      if (handedOver && celebrates && icon) placeRays();
      if (!handedOver) scrim.value = withTiming(1, { duration: reducedMotion ? MOTION.fadeMs : DURATION.base, easing: EASE.out });
      // Solid from its first frames (a pop, not a fade): never the screen behind ghosting through the card.
      fade.value = handedOver ? 1 : withTiming(1, { duration: reducedMotion ? MOTION.fadeMs : CARD_SOLID_MS, easing: EASE.out });
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
        if (reducedMotion) buzzStamp();
        else stampArmed.value = 1;
      } else if (hapticKind !== 'none') haptic(hapticKind);
      else queueHaptic('tickSelection');
    }
    // Opening only depends on visibility and which request is shown; haptic kind and motion are read at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, mounted, key]);

  const finish = () => {
    setMounted(false);
    const index = chosen.current;
    onAnswer?.(index);
    const button = index === null ? undefined : (buttons && buttons.length ? buttons : [{ text: 'OK' }])[index];
    if (runButtonHandlers) button?.onPress?.();
  };

  /** Another dialog takes over: answer this one and keep the backdrop up for the next card. */
  const finishHandOff = () => {
    const index = chosen.current;
    onAnswer?.(index);
    const button = index === null ? undefined : (buttons && buttons.length ? buttons : [{ text: 'OK' }])[index];
    if (runButtonHandlers) button?.onPress?.();
  };

  /**
   * Taking a prize (OK on a reward dialog): it flies out of the card, over the backdrop as it leaves, and lands on
   * the shelf (the Profile tab, which squashes as it arrives), so a kid sees where it went. No shelf on screen
   * (a game screen), Reduce Motion, or a cancel: nothing flies.
   */
  const flyPrize = (index: number | null) => {
    if (!celebrates || !icon || index === null || reducedMotion) return;
    const button = (buttons && buttons.length ? buttons : [{ text: 'OK' }])[index] as GameDialogButton | undefined;
    if (!button || button.style === 'cancel' || button.style === 'destructive') return;
    const node = iconRef.current;
    if (!node) return;
    const askedAt = Date.now();
    node.measureInWindow((x, y, w, h) => {
      if (!Number.isFinite(x) || w <= 0) return;
      measureShelfTarget((to, landed) => {
        if (!to) return;
        // It leaves as the card finishes shrinking (timed on the UI thread from here).
        flyCoins({ from: { x: x + w / 2, y: y + h / 2 }, to, count: 1, icon, size: DIALOG_PRIZE.flyPt, big: true,
          endScale: DIALOG_PRIZE.flyEndScale, sparkleEnd: true, landed, onDone: glanceGoal,
          delayMs: Math.max(0, DIALOG_CLOSE.cardMs - 30 - (Date.now() - askedAt)) });
      });
    });
  };

  const close = (index: number | null) => {
    if (closing.current) return;
    closing.current = true;
    chosen.current = index;
    stampArmed.value = 0;
    flyPrize(index);
    // A dialog waiting right behind this one: the card goes and the backdrop stays for the next card (the bare
    // screen never flashes between them).
    if (handOff?.() === true) {
      exit.value = withTiming(1, { duration: DIALOG_CLOSE.cardMs, easing: EASE.in }, done => {
        if (done) runOnJS(finishHandOff)();
      });
      return;
    }
    // The card shrinks and goes first (solid until its last frames); the backdrop leaves last.
    exit.value = withTiming(1, { duration: DIALOG_CLOSE.cardMs, easing: EASE.in });
    scrim.value = withDelay(DIALOG_CLOSE.scrimDelayMs, withTiming(0, { duration: DIALOG_CLOSE.scrimMs, easing: EASE.in }, done => {
      if (done) runOnJS(finish)();
    }));
  };

  useEffect(() => {
    if (!visible && mounted && !closing.current) close(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: fade.value * closeOpacity(exit.value),
    transform: reducedMotion ? [] : [
      { scale: (CARD_FROM + (1 - CARD_FROM) * pop.value) * (1 - (1 - CARD_EXIT) * exit.value) },
    ],
  }));
  // Each part reads the shared clock directly (a shared value read only inside a nested worklet is not tracked).
  // The ribbon drops in and stamps down: one overshoot past its spot, then rest.
  const ribbonStyle = useAnimatedStyle(() => {
    if (reducedMotion) return {};
    const r = ribbon.value;
    // Solid from its first frame (a stamp): a see-through ribbon showed the buttons behind it.
    return { transform: [{ translateY: -RIBBON_DROP * (1 - r) },
      { scale: RIBBON_STAMP_FROM + (1 - RIBBON_STAMP_FROM) * r }] };
  });
  const bodyStyle = useAnimatedStyle(() => partStyle(parts.value, 1, reducedMotion));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconPop.value }] }));
  // The wide ray fan sits behind the card and the ribbon, centred on the prize, and turns with the card's own fan.
  const outerRaysStyle = useAnimatedStyle(() => ({ opacity: raysOn.value,
    transform: [{ translateX: raysX.value - DIALOG_PRIZE.outerRaysPt / 2 }, { translateY: raysY.value - DIALOG_PRIZE.outerRaysPt / 2 }] }));
  /** Where the prize sits in the card (layout, not transforms): the wide fan centres on it. */
  const placeRays = () => {
    const node = iconRef.current;
    const outer = outerRef.current;
    if (!node || !outer) return;
    node.measureLayout(outer, (x, y, w, h) => {
      raysX.value = x + w / 2;
      raysY.value = y + h / 2;
      raysOn.value = 1;
    }, () => {});
  };
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
          <LinearGradient pointerEvents="none" colors={DIALOG_SCRIM_STOPS} locations={DIALOG_SCRIM_AT}
            style={StyleSheet.absoluteFill} />
          <Pressable accessibilityLabel="Close" accessibilityRole="button" style={{ flex: 1 }}
            disabled={dismiss === null} onPress={() => { if (dismiss !== null) close(dismiss); }} />
        </Animated.View>
        <Animated.View ref={outerRef} accessibilityViewIsModal accessibilityRole="alert"
          style={[{ width: '85%', maxWidth: 380, alignItems: 'center' }, cardStyle]}>
          {/* The prize's rays burst past the card: a wider fan behind the ribbon and the card (the card's own fan is on top). */}
          {celebrates && icon && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0,
            width: DIALOG_PRIZE.outerRaysPt, height: DIALOG_PRIZE.outerRaysPt }, outerRaysStyle]}>
            <GoldBurst size={DIALOG_PRIZE.outerRaysPt} amount={prizeGlow} bloom={prizeBloom} reduced={reducedMotion} raysOnly />
          </Animated.View>}
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
            {icon && <Animated.View ref={iconRef} onLayout={celebrates ? placeRays : undefined}
              style={[{ alignItems: 'center', justifyContent: 'center' }, iconStyle]}>
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
  // One dialog for the whole queue: a request waiting behind the open one takes over its backdrop (contentKey),
  // so the bare screen never flashes between two dialogs.
  return <GameDialog contentKey={request.id} visible={visible} title={request.title} message={request.message}
    icon={request.icon} buttons={request.buttons} dismissible={request.dismissible} haptic={request.haptic} equalChoices={request.equalChoices}
    runButtonHandlers={false} handOff={() => store.pending() > 1}
    onAnswer={index => { if (current.current) store.answer(current.current.id, index); }} />;
}

export default GameDialog;
