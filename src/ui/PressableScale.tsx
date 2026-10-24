/**
 * One squishy press for every tappable thing in the app.
 *
 *   <PressableScale onPress={open}>{children}</PressableScale>
 *   <PressableScale variant="subtle" onPress={openRow}>{row}</PressableScale>   // list rows and big cards
 *   const press = usePressScale({ disabled });                                     // inside a custom Pressable
 *
 * Two beats, the small-moment language of src/ui/motion.ts:
 *   press: scale 1 to PRESS.scale over PRESS.inMs (EASE.out) and sink PRESS.sinkPt into the shadow,
 *          with a light haptic on touch-down so it feels instant (buttons only; rows buzz on release,
 *          so starting a scroll on a row never buzzes)
 *   release: the PRESS spring back to rest with one small overshoot (about 1.03)
 * A tap on a disabled button gives a small side shake and no haptic.
 * Reduce Motion: no scale or travel, a dim to PRESS.reducedOpacity while held; the haptic stays.
 * Transforms and opacity only, on the UI thread: the layout at rest never changes.
 */
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Pressable, ScrollView, type GestureResponderEvent, type Insets, type StyleProp, type ViewStyle, type AccessibilityRole,
  type AccessibilityState } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { queueHaptic, type HapticIntent } from '../gamekit/Haptics';
import { EASE, PRESS } from './motionEasing';
import useUiReducedMotion from './useUiReducedMotion';

export type PressVariant = 'button' | 'subtle' | 'none';

export interface PressLook {
  /** Scale at the bottom of the press. */
  readonly scale: number;
  /** How far it sinks (pt). */
  readonly sinkPt: number;
  /** Opacity while held (Reduce Motion dims instead of moving). */
  readonly heldOpacity: number;
}

/** What a press looks like. Pure, so it is unit tested. */
export function pressLook(variant: PressVariant, reduced: boolean): PressLook {
  if (variant === 'none') return { scale: 1, sinkPt: 0, heldOpacity: 1 };
  if (reduced) return { scale: 1, sinkPt: 0, heldOpacity: PRESS.reducedOpacity };
  if (variant === 'subtle') return { scale: PRESS.subtleScale, sinkPt: 0, heldOpacity: 1 };
  return { scale: PRESS.scale, sinkPt: PRESS.sinkPt, heldOpacity: 1 };
}

/**
 * When the press haptic fires: buttons on touch-down, rows and cards on release (so a scroll never buzzes).
 * A button inside a scrolling list waits PRESS.scrollHoldMs first: a finger that starts a scroll on it
 * cancels the press before then and never buzzes; a quick tap still buzzes on release.
 */
export function pressHapticAt(variant: PressVariant, inScroll = false): 'pressIn' | 'held' | 'press' {
  if (variant !== 'button') return 'press';
  return inScroll ? 'held' : 'pressIn';
}

/** RN's ScrollView (and FlatList, which renders one) tells its children they scroll (null outside one). */
const ScrollContext = ((ScrollView as unknown as { Context?: React.Context<unknown> } | undefined)?.Context
  ?? (typeof createContext === 'function' ? createContext<unknown>(null) : undefined)) as React.Context<unknown>;
function useInScroll(): boolean {
  return useContext(ScrollContext) != null;
}

export interface PressScaleOptions {
  readonly variant?: PressVariant;
  readonly disabled?: boolean;
  /** The haptic for a press, or false for none (default a light tap). */
  readonly haptic?: HapticIntent | false;
}

/**
 * The press motion as a hook, for components that keep their own Pressable.
 * Wire pressIn/pressOut to the Pressable, put `style` on an Animated.View inside it, and call
 * `pressed()` from onPress (it fires the release haptic for rows) or `rejected()` for a disabled tap.
 */
export function usePressScale({ variant = 'button', disabled = false, haptic = 'tapLight' }: PressScaleOptions = {}) {
  const reduced = useUiReducedMotion();
  const look = pressLook(variant, reduced);
  const depth = useSharedValue(0);
  const shake = useSharedValue(0);
  const downAt = useRef(0);
  const inScroll = useInScroll();
  const hapticAt = pressHapticAt(variant, inScroll);
  // A button in a list: the touch-down buzz waits a beat so a scroll that starts on it stays silent.
  const heldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldFired = useRef(false);
  useEffect(() => () => { if (heldTimer.current) clearTimeout(heldTimer.current); }, []);

  const dims = look.heldOpacity < 1;
  const style = useAnimatedStyle(() => {
    const d = depth.value;
    const transform = [
      { translateX: shake.value },
      { translateY: look.sinkPt * d },
      { scale: 1 - (1 - look.scale) * d },
    ];
    // Opacity only when Reduce Motion dims the press, so a caller's own opacity (a greyed-out button) is kept.
    return dims ? { opacity: 1 - (1 - look.heldOpacity) * Math.min(1, Math.max(0, d)), transform } : { transform };
  }, [look.scale, look.sinkPt, look.heldOpacity, dims]);

  const pressIn = useCallback(() => {
    if (disabled || variant === 'none') return;
    downAt.current = Date.now();
    cancelAnimation(depth);
    depth.value = withTiming(1, { duration: PRESS.inMs, easing: EASE.out });
    if (haptic && hapticAt === 'pressIn') queueHaptic(haptic);
    if (haptic && hapticAt === 'held') {
      heldFired.current = false;
      if (heldTimer.current) clearTimeout(heldTimer.current);
      heldTimer.current = setTimeout(() => { heldTimer.current = null; heldFired.current = true; queueHaptic(haptic); }, PRESS.scrollHoldMs);
    }
  }, [disabled, variant, haptic, hapticAt, depth]);

  const pressOut = useCallback(() => {
    if (heldTimer.current) { clearTimeout(heldTimer.current); heldTimer.current = null; }
    if (variant === 'none') return;
    if (depth.value === 0) return;
    // A very quick tap still shows the whole squash: finish going down, then spring back up.
    const left = Math.max(0, PRESS.inMs - (Date.now() - downAt.current));
    depth.value = left > 8
      ? withSequence(withTiming(1, { duration: left, easing: EASE.out }), withSpring(0, PRESS.spring))
      : withSpring(0, PRESS.spring);
  }, [variant, depth]);

  const pressed = useCallback(() => {
    if (haptic && hapticAt === 'press') queueHaptic(haptic);
    // A quick tap in a list let go before the held buzz: it buzzes now, on the tap itself.
    if (haptic && hapticAt === 'held' && !heldFired.current) queueHaptic(haptic);
    heldFired.current = false;
  }, [haptic, hapticAt]);

  const rejected = useCallback(() => {
    if (variant === 'none') return;
    // A soft nope in the hand (never an error buzz), even with Reduce Motion.
    queueHaptic('hitSoft');
    if (reduced) return;
    const q = PRESS.shakeMs / 4;
    shake.value = withSequence(
      withTiming(-PRESS.shakePt, { duration: q }),
      withTiming(PRESS.shakePt, { duration: q }),
      withTiming(-PRESS.shakePt / 2, { duration: q }),
      withTiming(0, { duration: q }),
    );
  }, [reduced, variant, shake]);

  return { style, pressIn, pressOut, pressed, rejected, reduced };
}

export interface PressableScaleProps extends PressScaleOptions {
  readonly children?: ReactNode;
  readonly onPress?: (event: GestureResponderEvent) => void;
  readonly onLongPress?: (event: GestureResponderEvent) => void;
  readonly onPressIn?: (event: GestureResponderEvent) => void;
  readonly onPressOut?: (event: GestureResponderEvent) => void;
  /** Style of the outer Pressable (layout lives here). */
  readonly style?: StyleProp<ViewStyle>;
  /** Style of the inner moving view. */
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly hitSlop?: number | Insets;
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly accessibilityState?: AccessibilityState;
  readonly testID?: string;
  readonly delayLongPress?: number;
}

/** A Pressable with the shared squash and spring. Disabled taps shake instead of firing. */
export default function PressableScale({
  children, onPress, onLongPress, onPressIn, onPressOut, style, contentStyle, hitSlop,
  variant = 'button', disabled = false, haptic = 'tapLight',
  accessibilityRole = 'button', accessibilityLabel, accessibilityHint, accessibilityState, testID, delayLongPress,
}: PressableScaleProps) {
  const press = usePressScale({ variant, disabled, haptic });
  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled }}
      hitSlop={hitSlop}
      delayLongPress={delayLongPress}
      style={style}
      onPressIn={event => { press.pressIn(); onPressIn?.(event); }}
      onPressOut={event => { press.pressOut(); onPressOut?.(event); }}
      onLongPress={disabled ? undefined : onLongPress}
      onPress={event => {
        if (disabled) { press.rejected(); return; }
        press.pressed();
        onPress?.(event);
      }}
    >
      <Animated.View style={[contentStyle, press.style]}>{children}</Animated.View>
    </Pressable>
  );
}
