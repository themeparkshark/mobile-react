/**
 * <GameButton> (WS0 UI kit): the one call-to-action button.
 *
 *   <GameButton label="Play ride" icon="ticket" onPress={play} />
 *   <GameButton label="Not now" variant="secondary" size="compact" onPress={close} />
 *
 * Geometry: 58pt tall (46 compact), max 320 wide, Shark 24 (20 compact),
 * a 4pt lip under the face and a thick navy outline. Pressing collapses the
 * face onto its lip on the UI thread. A light haptic fires on press (it
 * respects the player's haptics setting). Reduced motion keeps the pressed
 * state but drops the tween and the loading pulse.
 */
import { useEffect } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { haptic } from '../gamekit/Haptics';
import GameIcon from './GameIcon';
import type { GameIconName } from './iconNames';
import { BRAND, BUTTON, FONT, HIT_SLOP, MOTION, OUTLINE, RADIUS, type GameButtonSize, type GameButtonVariant } from './tokens';

export type { GameButtonSize, GameButtonVariant };

export type GameButtonProps = {
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: GameButtonVariant;
  readonly size?: GameButtonSize;
  readonly icon?: GameIconName;
  readonly disabled?: boolean;
  /** Shows a busy state and ignores presses (for example while a request is in flight). */
  readonly loading?: boolean;
  /** Ghost buttons only: which surface they sit on. */
  readonly tone?: 'onLight' | 'onBlue';
  /** Stretch to the parent width (still capped at 320). Default true. */
  readonly fullWidth?: boolean;
  readonly haptics?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
};

type Palette = { face: string; lip: string; ink: string; outline: string; shadow: string | null };

export function buttonPalette(variant: GameButtonVariant, inactive: boolean, tone: 'onLight' | 'onBlue' = 'onLight'): Palette {
  if (variant === 'ghost') {
    const ink = tone === 'onBlue' ? BRAND.white : BRAND.navy;
    return { face: 'transparent', lip: 'transparent', ink: inactive ? BRAND.navySoft : ink, outline: 'transparent', shadow: null };
  }
  if (inactive) return { face: '#d5e2f0', lip: '#a9bcd3', ink: BRAND.white, outline: '#7f97b6', shadow: '#7f97b6' };
  switch (variant) {
    case 'secondary': return { face: BRAND.blueBright, lip: BRAND.blueLip, ink: BRAND.white, outline: BRAND.navy, shadow: BRAND.navy };
    case 'danger': return { face: BRAND.red, lip: BRAND.redLip, ink: BRAND.white, outline: BRAND.navy, shadow: BRAND.navy };
    default: return { face: BRAND.gold, lip: BRAND.goldLip, ink: BRAND.white, outline: BRAND.navy, shadow: BRAND.navy };
  }
}

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
  const reducedMotion = useReducedGameMotion();
  const pressed = useSharedValue(0);
  const pulse = useSharedValue(1);
  const inactive = disabled || loading;
  const ghost = variant === 'ghost';
  const height = size === 'compact' ? BUTTON.compactHeight : BUTTON.height;
  const lip = ghost ? 0 : BUTTON.lip;
  const fontSize = size === 'compact' ? BUTTON.compactFontSize : BUTTON.fontSize;
  const palette = buttonPalette(variant, disabled, tone);

  useEffect(() => {
    cancelAnimation(pulse);
    if (loading && !reducedMotion) {
      pulse.value = withRepeat(withSequence(
        withTiming(0.55, { duration: 520, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }),
      ), -1, false);
    } else {
      pulse.value = loading ? 0.7 : 1;
    }
    return () => cancelAnimation(pulse);
  }, [loading, reducedMotion, pulse]);

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * lip }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const press = (to: number) => {
    if (inactive) return;
    pressed.value = reducedMotion ? to : withTiming(to, { duration: to ? MOTION.pressInMs : MOTION.pressOutMs });
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={HIT_SLOP}
      onPressIn={() => press(1)}
      onPressOut={() => press(0)}
      onPress={() => {
        if (inactive) return;
        if (haptics) haptic('tapLight');
        onPress?.();
      }}
      style={[{
        height,
        width: fullWidth ? '100%' : undefined,
        maxWidth: BUTTON.maxWidth,
        alignSelf: 'center',
      }, style]}
    >
      {!ghost && <View pointerEvents="none" style={{
        position: 'absolute', left: 0, right: 0, top: lip, bottom: 0,
        backgroundColor: palette.lip, borderRadius: RADIUS.md,
        borderWidth: OUTLINE.thick, borderColor: palette.outline,
      }} />}
      <Animated.View pointerEvents="none" style={[{
        height: height - lip,
        borderRadius: RADIUS.md,
        backgroundColor: palette.face,
        borderWidth: ghost ? 0 : OUTLINE.thick,
        borderColor: palette.outline,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: size === 'compact' ? 16 : 22,
        overflow: 'hidden',
      }, faceStyle]}>
        {!ghost && <View style={{
          position: 'absolute', left: 8, right: 8, top: 4, height: 5, borderRadius: 3,
          backgroundColor: 'rgba(255,255,255,0.35)',
        }} />}
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }, labelStyle]}>
          {icon && <View style={{ marginRight: 8 }}>
            <GameIcon name={icon} size={Math.round(fontSize * 1.15)} />
          </View>}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.2}
            style={{
              flexShrink: 1,
              fontFamily: FONT.display,
              fontSize,
              lineHeight: Math.round(fontSize * 1.2),
              paddingTop: 3,
              color: palette.ink,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              textAlign: 'center',
              ...(palette.shadow ? {
                textShadowColor: palette.shadow,
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 0.1,
              } : null),
            }}
          >
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
