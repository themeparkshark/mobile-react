/**
 * The game's button press for News: on the UI thread the button drops by its
 * lip (about 80 ms) while the lip shrinks, then springs back. Reduced motion
 * keeps presses instant.
 */
import type { ReactNode } from 'react';
import { Pressable, type AccessibilityRole, type AccessibilityState, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from '../../ui/useUiReducedMotion';

export default function GamePress({ style, lip = 4, onPress, disabled, hitSlop = 6, children, accessibilityLabel, accessibilityHint,
  accessibilityRole = 'button', accessibilityState, onLayout, grow = false }: {
  /** Fill the row (flex: 1) like the Next card. */
  readonly grow?: boolean;
  /** The button's look; its borderBottomWidth is the lip that collapses on press. */
  readonly style: StyleProp<ViewStyle>;
  readonly lip?: number;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly hitSlop?: number;
  readonly children: ReactNode;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityState?: AccessibilityState;
  readonly onLayout?: (x: number, w: number) => void;
}) {
  const reduced = useUiReducedMotion();
  const down = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: down.value * lip * 0.75 }],
    borderBottomWidth: Math.max(1, lip - down.value * (lip - 1)),
    marginBottom: down.value * (lip - 1),
  }));
  return (
    <Pressable accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }} disabled={disabled} hitSlop={hitSlop} onPress={onPress} style={grow ? { flex: 1 } : undefined}
      onLayout={onLayout ? e => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width) : undefined}
      onPressIn={() => { if (!reduced) down.value = withTiming(1, { duration: 80 }); }}
      onPressOut={() => { down.value = reduced ? 0 : withSpring(0, { damping: 12, stiffness: 320, mass: 0.6 }); }}>
      <Animated.View style={[style, { borderBottomWidth: lip }, anim]}>{children}</Animated.View>
    </Pressable>
  );
}
