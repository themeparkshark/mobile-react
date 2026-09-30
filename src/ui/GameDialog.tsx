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
 * Look: navy scrim (never black), cream card with a heavy navy outline, a blue
 * title band, an optional GameIcon medallion, and GameButtons stacked with the
 * main action on top. Motion: scrim fade plus a spring pop on the UI thread;
 * reduced motion fades only.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { haptic } from '../gamekit/Haptics';
import GameButton from './GameButton';
import GameIcon from './GameIcon';
import GameText from './GameText';
import {
  createDialogStore,
  dismissAction,
  layoutActions,
  type DialogRequest,
  type GameDialogButton,
  type GameDialogOptions,
} from './gameDialogModel';
import { BRAND, MOTION, OUTLINE, RADIUS, SHADOW, SPACE, Z } from './tokens';

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
  testID,
}: GameDialogProps) {
  const reducedMotion = useReducedGameMotion();
  const [mounted, setMounted] = useState(visible);
  const closing = useRef(false);
  const chosen = useRef<number | null>(null);
  const scrim = useSharedValue(0);
  const pop = useSharedValue(0);
  const actions = layoutActions(buttons);
  const request = { title, message, icon, buttons, dismissible };

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
      <View testID={testID} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: Z.dialog }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BRAND.scrim }, scrimStyle]}>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" style={{ flex: 1 }}
            disabled={dismiss === null} onPress={() => { if (dismiss !== null) close(dismiss); }} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal accessibilityRole="alert"
          style={[{ width: '86%', maxWidth: 360, paddingTop: icon ? 34 : 0 }, cardStyle]}>
          <View style={{
            backgroundColor: BRAND.cream,
            borderRadius: RADIUS.xl,
            borderWidth: OUTLINE.heavy,
            borderColor: BRAND.navy,
            overflow: 'hidden',
            ...SHADOW.lifted,
          }}>
            <View style={{
              backgroundColor: BRAND.blueBright,
              borderBottomWidth: OUTLINE.thick,
              borderBottomColor: BRAND.navy,
              paddingTop: icon ? 34 : SPACE.lg,
              paddingBottom: SPACE.md,
              paddingHorizontal: SPACE.lg,
            }}>
              <GameText preset="title" tone="onBlue" align="center" accessibilityRole="header">{title}</GameText>
            </View>
            <View style={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg, paddingBottom: SPACE.xl, gap: SPACE.md }}>
              {!!message && <GameText preset="body" align="center">{message}</GameText>}
              {children}
              <View style={{ gap: SPACE.sm, marginTop: SPACE.xs }}>
                {actions.map(action => (
                  <GameButton key={action.index} label={action.text} variant={action.variant}
                    size={action.variant === 'primary' || action.variant === 'danger' ? 'regular' : 'compact'}
                    onPress={() => close(action.index)} />
                ))}
              </View>
            </View>
          </View>
          {icon && <View pointerEvents="none" style={{
            position: 'absolute', top: 0, alignSelf: 'center',
            width: 68, height: 68, borderRadius: 34,
            backgroundColor: BRAND.white, borderWidth: OUTLINE.heavy, borderColor: BRAND.navy,
            alignItems: 'center', justifyContent: 'center', ...SHADOW.card,
          }}>
            <GameIcon name={icon} size={44} />
          </View>}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Mount once near the root (WS9 owns Root.tsx). Screens may also mount one while waiting. */
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
    icon={request.icon} buttons={request.buttons} dismissible={request.dismissible} haptic={request.haptic}
    runButtonHandlers={false}
    onAnswer={index => { if (current.current) store.answer(current.current.id, index); }} />;
}

export default GameDialog;
