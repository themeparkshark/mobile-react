/**
 * <GameButton> (WS0 UI kit): Dustin's own image button with a few extras.
 *
 *   <GameButton label="Play ride" icon="ticket" onPress={play} />
 *   <GameButton label="Leave the line" variant="danger" onPress={leave} />
 *   <GameButton label="Not now" variant="ghost" onPress={close} />
 *
 * The face is his art, unchanged: yellow_button.png for primary and secondary
 * (secondary is the same button at a smaller width), red_button.png for danger.
 * The label is the YellowButton label (white Shark caps, the same shadow),
 * sized from the button height so every label on one size matches. Ghost is a
 * plain Shark-font text action for "Cancel" and "Not now".
 *
 * Extras over YellowButton: an optional GameIcon before the label, a loading
 * state, a light haptic, and the press scale on the UI thread. Reduced motion
 * keeps presses instant.
 */
import { useEffect, useState } from 'react';
import { ImageBackground, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import useUiReducedMotion from './useUiReducedMotion';
import { haptic } from '../gamekit/Haptics';
import { artButtonFontSize } from './artButtonText';
import GameIcon from './GameIcon';
import type { GameIconName } from './iconNames';
import { BRAND, BUTTON, FONT, HIT_SLOP, type GameButtonSize, type GameButtonVariant } from './tokens';

export type { GameButtonSize, GameButtonVariant };

export const BUTTON_ART = {
  yellow: require('../../assets/images/yellow_button.png'),
  red: require('../../assets/images/red_button.png'),
} as const;

export type GameButtonProps = {
  readonly label: string;
  readonly onPress?: () => void;
  /** primary (yellow), secondary (yellow, smaller), danger (red), ghost (text only). */
  readonly variant?: GameButtonVariant;
  /** compact is the secondary width on any image variant. */
  readonly size?: GameButtonSize;
  readonly icon?: GameIconName;
  readonly disabled?: boolean;
  /** Shows a busy state and ignores presses (for example while a request is in flight). */
  readonly loading?: boolean;
  /** Ghost buttons only: which surface they sit on. */
  readonly tone?: 'onLight' | 'onBlue';
  /** Stretch to the parent width (still capped). Default true. */
  readonly fullWidth?: boolean;
  readonly haptics?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
};

/** Which art and width a variant uses. Pure, so it is unit tested. */
export function buttonLook(variant: GameButtonVariant, size: GameButtonSize) {
  if (variant === 'ghost') return { art: null, maxWidth: BUTTON.maxWidth };
  const compact = size === 'compact' || variant === 'secondary';
  return {
    art: variant === 'danger' ? 'red' as const : 'yellow' as const,
    maxWidth: compact ? BUTTON.compactMaxWidth : BUTTON.maxWidth,
  };
}

/** YellowButton's label style, so both buttons read as one family. */
export const ART_LABEL_STYLE = {
  textAlign: 'center',
  color: 'white',
  fontFamily: FONT.display,
  textTransform: 'uppercase',
  textShadowColor: 'rgba(0, 0, 0, .5)',
  textShadowOffset: { width: 1, height: 1 },
  textShadowRadius: 0,
} as const;

export default function GameButton({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  icon,
  disabled = false,
  loading = false,
  tone = 'onLight',
  fullWidth = true,
  haptics = true,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: GameButtonProps) {
  const reducedMotion = useUiReducedMotion();
  const scale = useSharedValue(1);
  const pulse = useSharedValue(1);
  const [labelAreaHeight, setLabelAreaHeight] = useState(0);
  const inactive = disabled || loading;
  const look = buttonLook(variant, size);

  useEffect(() => {
    cancelAnimation(pulse);
    if (loading && !reducedMotion) {
      pulse.value = withRepeat(withSequence(
        withTiming(0.45, { duration: 520, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }),
      ), -1, false);
    } else {
      pulse.value = loading ? 0.6 : 1;
    }
    return () => cancelAnimation(pulse);
  }, [loading, reducedMotion, pulse]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const press = (down: boolean) => {
    if (inactive || reducedMotion) return;
    scale.value = withTiming(down ? BUTTON.pressScale : 1, { duration: down ? BUTTON.pressInMs : BUTTON.pressOutMs });
  };

  const fontSize = look.art ? artButtonFontSize(labelAreaHeight) : size === 'compact' ? 16 : 18;
  const iconSize = Math.round(fontSize * 1.25);
  const content = <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' }, labelStyle]}>
    {icon && <GameIcon name={icon} size={iconSize} style={{ marginRight: Math.round(fontSize * 0.3) }} />}
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      maxFontSizeMultiplier={1.2}
      style={look.art ? { ...ART_LABEL_STYLE, flexShrink: 1, fontSize, paddingTop: 4, paddingBottom: 4 } : {
        flexShrink: 1,
        textAlign: 'center',
        fontFamily: FONT.display,
        textTransform: 'uppercase',
        fontSize,
        letterSpacing: 0.5,
        color: tone === 'onBlue' ? BRAND.white : BRAND.navy,
        ...(tone === 'onBlue' ? { textShadowColor: 'rgba(0, 0, 0, .5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 } : null),
      }}
    >
      {label}
    </Text>
  </Animated.View>;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={HIT_SLOP}
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
      onPress={() => {
        if (inactive) return;
        if (haptics) haptic('tapLight');
        onPress?.();
      }}
      style={[{ width: fullWidth ? '100%' : undefined, maxWidth: look.maxWidth, alignSelf: 'center' }, style]}
    >
      <Animated.View style={[{ opacity: disabled ? 0.5 : 1 }, pressStyle]}>
        {look.art
          ? <ImageBackground source={BUTTON_ART[look.art]} resizeMode="contain"
            style={{ width: '100%', aspectRatio: BUTTON.aspectRatio }}>
            <View onLayout={event => setLabelAreaHeight(event.nativeEvent.layout.height)}
              style={{ aspectRatio: BUTTON.labelAspectRatio, justifyContent: 'center', paddingHorizontal: 24,
                opacity: labelAreaHeight > 0 ? 1 : 0 }}>
              {content}
            </View>
          </ImageBackground>
          : <View style={{ minHeight: BUTTON.ghostMinHeight, justifyContent: 'center', paddingHorizontal: 12 }}>{content}</View>}
      </Animated.View>
    </Pressable>
  );
}
