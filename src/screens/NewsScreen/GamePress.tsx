/**
 * The game's button press for News, built in two layers so nothing around it
 * ever moves: a fixed "lip" underlay (the button's lip colour) and the face on
 * top. Pressing slides only the face down onto the lip on the UI thread (about
 * 80 ms), then it springs back. The footprint never changes, so a chip row or a
 * card never grows or jumps. Reduced motion shows the pressed state instantly.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityRole, type AccessibilityState, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from '../../ui/useUiReducedMotion';

/** Pure layout split, unit tested: the face gives up (lip - border) of its height to the visible lip below it. */
export function pressLayers(style: ViewStyle, lip: number) {
  const border = typeof style.borderWidth === 'number' ? style.borderWidth : 0;
  const drop = Math.max(0, lip - border);
  const shrink = (v: ViewStyle['height']) => (typeof v === 'number' ? v - drop : v);
  const face: ViewStyle = { ...style, borderBottomWidth: border, height: shrink(style.height), minHeight: shrink(style.minHeight) };
  delete face.flex;
  const under: ViewStyle = {
    position: 'absolute', left: 0, right: 0, top: drop, bottom: 0,
    borderRadius: style.borderRadius, backgroundColor: (style.borderColor as string | undefined) ?? 'rgba(5,52,110,0.26)',
  };
  return { face, under, drop };
}

export default function GamePress({ style, lip = 4, onPress, disabled, hitSlop = 6, children, accessibilityLabel, accessibilityHint,
  accessibilityRole = 'button', accessibilityState, onLayout, grow = false }: {
  /** Fill the row (flex: 1) like the Next card. */
  readonly grow?: boolean;
  /** The button's look; the lip below it is drawn in its borderColor. */
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
  const { face, under, drop } = pressLayers(StyleSheet.flatten(style) ?? {}, lip);
  const down = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: down.value * drop }] }));
  return (
    <Pressable accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }} disabled={disabled} hitSlop={hitSlop} onPress={onPress}
      style={grow ? { flex: 1 } : undefined}
      onLayout={onLayout ? e => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width) : undefined}
      onPressIn={() => { down.value = reduced ? 1 : withTiming(1, { duration: 80 }); }}
      onPressOut={() => { down.value = reduced ? 0 : withSpring(0, { damping: 12, stiffness: 320, mass: 0.6 }); }}>
      <View style={{ paddingBottom: drop, opacity: face.opacity }}>
        <View style={under} />
        <Animated.View style={[face, { opacity: 1 }, anim]}>{children}</Animated.View>
      </View>
    </Pressable>
  );
}
