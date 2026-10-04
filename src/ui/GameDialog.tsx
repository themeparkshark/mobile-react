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
 * Motion: scrim fade plus a spring pop on the UI thread; reduced motion fades.
 * The preference is known on the first render (useUiReducedMotion), so a
 * dialog that mounts already open still springs.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import useUiReducedMotion from './useUiReducedMotion';
import { haptic } from '../gamekit/Haptics';
import GameButton from './GameButton';
import GameIcon from './GameIcon';
import GameText from './GameText';
import Ribbon from '../components/Ribbon';
import {
  createDialogStore,
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
/** Backdrop blur under the navy scrim (iOS; Android shows the scrim alone). */
const SCRIM_BLUR = 18;
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
  const [mounted, setMounted] = useState(visible);
  const closing = useRef(false);
  const chosen = useRef<number | null>(null);
  const scrim = useSharedValue(0);
  const pop = useSharedValue(0);
  const actions = layoutActions(buttons, equalChoices);
  const request = { title, message, icon, buttons, dismissible };
  const titleLayout = dialogTitleLayout(title);
  useEffect(() => {
    if (__DEV__ && visible && titleLayout.placement === 'card') {
      console.warn(`GameDialog: "${title}" is longer than ${RIBBON_TITLE_MAX} characters, so it moves off the ribbon. Pass a short title and put the rest in the message.`);
    }
  }, [visible, title, titleLayout.placement]);

  useEffect(() => {
    if (visible) {
      closing.current = false;
      chosen.current = null;
      setMounted(true);
      scrim.value = withTiming(1, { duration: MOTION.fadeMs });
      pop.value = reducedMotion
        ? withTiming(1, { duration: MOTION.fadeMs })
        : withSpring(1, MOTION.popSpring);
      if (hapticKind !== 'none') haptic(hapticKind);
    }
    // Opening only depends on visibility; haptic kind and motion are read at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
    scrim.value = withTiming(0, { duration: MOTION.dialogOutMs });
    pop.value = withTiming(0, { duration: MOTION.dialogOutMs, easing: Easing.in(Easing.quad) }, done => {
      if (done) runOnJS(finish)();
    });
  };

  useEffect(() => {
    if (!visible && mounted && !closing.current) close(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.6),
    transform: reducedMotion ? [] : [
      { translateY: (1 - pop.value) * 18 },
      { scale: 0.9 + pop.value * 0.1 },
    ],
  }));

  if (!mounted) return null;
  const dismiss = dismissAction(request);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent
      onRequestClose={() => { if (dismiss !== null) close(dismiss); }}>
      <KeyboardAvoidingView testID={testID} enabled={avoidKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: Z.dialog }}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          {/* A soft light blur makes the page recede without greying it; the navy tint stays light so yellow stays yellow. */}
          <BlurView intensity={SCRIM_BLUR} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: BRAND.scrim }]} />
          <Pressable accessibilityLabel="Close" accessibilityRole="button" style={{ flex: 1 }}
            disabled={dismiss === null} onPress={() => { if (dismiss !== null) close(dismiss); }} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal accessibilityRole="alert"
          style={[{ width: '85%', maxWidth: 380, alignItems: 'center' }, cardStyle]}>
          {titleLayout.placement === 'ribbon' && (
            <View accessible accessibilityRole="header" accessibilityLabel={title} style={{ width: '100%', zIndex: 2 }}>
              <Ribbon text={titleLayout.text} />
            </View>
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
            {titleLayout.placement === 'card' && (
              <GameText preset="title" tone="onBlue" align="center" accessibilityRole="header"
                style={{ textTransform: 'uppercase' }}>{titleLayout.text}</GameText>
            )}
            {icon && <GameIcon name={icon} size={72} />}
            {!!message && <GameText preset="body" tone="onBlue" align="center" style={{ color: DIALOG_COPY }}>{message}</GameText>}
            {children}
            <View style={{ alignSelf: 'stretch', gap: SPACE.xs, marginTop: SPACE.xs }}>
              {actions.map(action => (
                <GameButton key={action.index} label={action.text} variant={action.variant} tone="onBlue" icon={action.icon} image={action.image}
                  onPress={() => close(action.index)} />
              ))}
            </View>
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
