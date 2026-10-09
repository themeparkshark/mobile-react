/**
 * The Stamp Book's own popup frame (Titles list, profile title sheet): the
 * same house style as the stamp card. Thick slate outline, a dark lip, Alex's
 * blue body with a gloss band and bevel, the gold ribbon title and his round
 * X. Not the app-wide GameDialog (that stays as is until it is promoted).
 * Motion: a spring pop on the UI thread; Reduce Motion fades.
 */
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Ribbon from '../../components/Ribbon';
import GameIcon from '../../ui/GameIcon';
import { DIALOG_CARD } from '../../ui/GameDialog';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { playSfx } from '../../gamekit/SFX';

export default function StampSheet({ visible, title, onClose, onDismiss, children, testID }: {
  readonly visible: boolean;
  readonly title: string;
  readonly onClose: () => void;
  /** Fires once the sheet is fully gone (hand-offs open the next popup here). */
  readonly onDismiss?: () => void;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const reduced = useUiReducedMotion();
  const pop = useSharedValue(reduced ? 1 : 0.9);
  const fade = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    fade.value = withTiming(1, { duration: 140 });
    pop.value = reduced ? 1 : 0.9;
    if (!reduced) pop.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, [visible, reduced, fade, pop]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: pop.value }] }));
  const close = () => { playSfx('ui.modalClose', 0.5); onClose(); };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} onDismiss={onDismiss} statusBarTranslucent testID={testID}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={close} accessible={false} />
        <Animated.View style={[styles.card, cardStyle]} accessibilityViewIsModal onAccessibilityEscape={close}>
          <View style={styles.lip} />
          <View style={styles.body}>
            <View pointerEvents="none" style={styles.bevel} />
            <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={styles.gloss} />
            <View style={styles.ribbon} accessible accessibilityRole="header" accessibilityLabel={title}><Ribbon text={title} /></View>
            <Pressable onPress={close} hitSlop={14} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <GameIcon name="close" size={44} />
            </Pressable>
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  backdrop: { backgroundColor: 'rgba(5,52,110,0.82)' },
  card: { width: '100%', maxWidth: 380, marginTop: 24, borderRadius: 24, borderWidth: 3, borderColor: '#0B2A55', backgroundColor: '#0B2A55' },
  lip: { position: 'absolute', left: -3, right: -3, top: 8, bottom: -10, borderRadius: 24, backgroundColor: '#03305E' },
  body: { ...DIALOG_CARD, alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 40, gap: 12 },
  bevel: { position: 'absolute', left: 4, right: 4, top: 4, bottom: 4, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(0,40,90,0.35)' },
  gloss: { position: 'absolute', left: 3, right: 3, top: 3, height: 90, borderTopLeftRadius: 17, borderTopRightRadius: 17 },
  ribbon: { position: 'absolute', top: -34, left: 18, right: 18, alignItems: 'center' },
  close: { position: 'absolute', top: -18, right: -14, zIndex: 5 },
});
