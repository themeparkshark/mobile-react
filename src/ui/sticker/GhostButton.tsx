/**
 * GhostButton: Shark words with no box (the way out in a wave foot: "Not now", "BACK TO MAP";
 * "See my shelf" under a primary). Rest, pressed (a small squish and the 14 percent navy press
 * pill), off (faded by the one off token) and busy (three dots). At least 44 pt tall and 88 wide,
 * one VoiceOver label. Optional art before the words: Alex's arrow, mirrored, for "back".
 * On paper the words are plain navy; on colour white with the stroke.
 */
import { memo } from 'react';
import { Pressable, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import Lift from './Lift';
import Busy from './Busy';
import StickerText from './StickerText';
import { ART, ART_RATIO } from './art';
import { usePress } from './motion';
import { TEXT } from './textRoles';
import { BUTTON, OFF, SHADE } from './tokens';

export type GhostButtonProps = {
  readonly label: string;
  readonly accessibilityLabel?: string;
  /** 'large' is the 20 pt foot words ("BACK TO MAP"). */
  readonly size?: 'normal' | 'large';
  /** Alex's arrow before the words, mirrored (a way back), or other art. */
  readonly art?: 'back' | { readonly source: ImageSourcePropType; readonly width: number; readonly height: number; readonly mirror?: boolean };
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly haptics?: boolean;
  readonly testID?: string;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
};

const NORMAL = { ...TEXT.nameSmall, size: 19, spacing: 0.05, maxScale: 1.2 };
const LARGE = { ...TEXT.nameSmall, size: 20, spacing: 0.06, maxScale: 1.2 };
const BACK = { source: ART.arrow, width: 26, height: Math.round(26 / ART_RATIO.arrow), mirror: true };

function GhostButtonImpl({ label, accessibilityLabel, size = 'normal', art, disabled = false, busy = false, haptics = true, testID, onPress, style }: GhostButtonProps) {
  const { p, pressIn, pressOut, reduced } = usePress();
  const squish = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.06 * p.value }, { translateY: 1.5 * p.value }] }));
  const pill = useAnimatedStyle(() => ({ opacity: p.value }));
  const inert = disabled || busy;
  const a = art === 'back' ? BACK : art;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled, busy }} disabled={inert}
      onPressIn={inert ? undefined : pressIn} onPressOut={inert ? undefined : pressOut}
      onPress={inert ? undefined : () => { if (haptics) haptic('tapLight'); onPress?.(); }}
      style={[{ minHeight: BUTTON.minTouch, minWidth: BUTTON.minTouch * 2, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', opacity: disabled ? OFF.artOpacity : 1 }, style]}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 2, right: 2, top: 4, bottom: 4, borderRadius: 999, backgroundColor: SHADE.ghostPressed }, pill]} />
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 9 }, squish]}>
        {busy ? <Busy reduced={reduced} /> : (
          <>
            {a ? <Lift source={a.source} width={a.width} height={a.height} mirror={a.mirror} flat /> : null}
            <View style={{ paddingTop: 2, flexShrink: 1 }}>
              <StickerText spec={size === 'large' ? LARGE : NORMAL} role="none">{label}</StickerText>
            </View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const GhostButton = memo(GhostButtonImpl);
export default GhostButton;
