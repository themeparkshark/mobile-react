/**
 * The bottom sheet behind Social's "More" chest, on the UI thread: the slide, the backdrop fade and the
 * swipe-down all run in Reanimated and Gesture Handler (already in the app), so a busy JS thread never
 * makes it hitch, and the backdrop can never blink back on close.
 *
 * - Opens with a short ease-out slide (Reduce Motion: a fade), closes faster.
 * - Tap the backdrop or swipe the sheet down to close; a short drag springs back.
 * - `onHidden` fires once the sheet is fully gone (on iOS after the native modal is dismissed), so a
 *   shortcut can present Safari or push a screen safely.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BRAND } from '../../ui';

export const SHEET_OPEN_MS = 280;
export const SHEET_CLOSE_MS = 220;
const BACKDROP = 0.35;
/** Drag further than this (or flick down) to close. */
const CLOSE_DRAG = 80;
const CLOSE_VELOCITY = 800;

export default function SocialSheet({
  visible,
  reduced,
  onClose,
  onHidden,
  children,
}: {
  readonly visible: boolean;
  readonly reduced: boolean;
  readonly onClose: () => void;
  readonly onHidden?: () => void;
  readonly children: ReactNode;
}) {
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(420);
  const hiding = useRef(false);
  const cbs = useRef({ onClose, onHidden });
  cbs.current = { onClose, onHidden };

  const requestClose = () => cbs.current.onClose();
  const finishHide = () => {
    setMounted(false);
    drag.value = 0;
    // Android has no onDismiss: the sheet is gone once the modal unmounts.
    if (Platform.OS !== 'ios') setTimeout(() => { hiding.current = false; cbs.current.onHidden?.(); }, 0);
  };

  useEffect(() => {
    if (visible) {
      hiding.current = false;
      setMounted(true);
      drag.value = 0;
      progress.value = withTiming(1, { duration: SHEET_OPEN_MS, easing: Easing.out(Easing.cubic) });
    } else if (mounted && !hiding.current) {
      hiding.current = true;
      progress.value = withTiming(0, { duration: SHEET_CLOSE_MS, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(finishHide)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => { drag.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (drag.value > CLOSE_DRAG || e.velocityY > CLOSE_VELOCITY) runOnJS(requestClose)();
      else drag.value = withSpring(0, { damping: 18, stiffness: 260 });
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: BACKDROP * progress.value }));
  const sheetStyle = useAnimatedStyle(() => (reduced
    ? { opacity: progress.value, transform: [{ translateY: drag.value }] }
    // The drag holds the sheet where the finger left it; the close slide continues from there.
    : { transform: [{ translateY: Math.max(drag.value, (1 - progress.value) * (height.value + 40)) }] }));

  const onLayout = (e: LayoutChangeEvent) => { height.value = e.nativeEvent.layout.height; };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => cbs.current.onClose()}
      onDismiss={() => { if (hiding.current) { hiding.current = false; cbs.current.onHidden?.(); } }}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => cbs.current.onClose()}
            accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]} onLayout={onLayout} accessibilityViewIsModal>
            {children}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: BRAND.navy },
  sheet: { width: '100%' },
});

