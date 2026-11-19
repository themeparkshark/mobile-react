/**
 * GhostButton: Shark words with no box (the way out in a wave foot: "Not now", "BACK TO MAP").
 * Rest and pressed (a small squish on the UI thread), off. At least 44 pt tall and wide, one
 * VoiceOver label. Optional art before the words (Alex's arrow, mirrored).
 */
import { memo } from 'react';
import { Pressable, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import Lift from './Lift';
import StickerText from './StickerText';
import { usePress } from './motion';
import { BUTTON, STROKE } from './tokens';

export type GhostButtonProps = {
  readonly label: string;
  readonly accessibilityLabel?: string;
  readonly size?: number;
  readonly spacing?: number;
  readonly art?: { readonly source: ImageSourcePropType; readonly width: number; readonly height: number; readonly mirror?: boolean };
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
};

function GhostButtonImpl({ label, accessibilityLabel, size = 19, spacing = 0.05, art, disabled = false, onPress, style }: GhostButtonProps) {
  const { p, pressIn, pressOut } = usePress();
  const squish = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.06 * p.value }, { translateY: 1.5 * p.value }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} disabled={disabled}
      onPressIn={pressIn} onPressOut={pressOut} onPress={() => { haptic('tapLight'); onPress?.(); }}
      style={[{ minHeight: BUTTON.minTouch, minWidth: BUTTON.minTouch * 2, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : 1 }, style]}>
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 9 }, squish]}>
        {art ? <Lift source={art.source} width={art.width} height={art.height} mirror={art.mirror} flat /> : null}
        <View style={{ paddingTop: 2 }}>
          <StickerText size={size} stroke={STROKE.button} spacing={spacing} role="none" maxScale={1.2}>{label}</StickerText>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const GhostButton = memo(GhostButtonImpl);
export default GhostButton;
