/**
 * RoundButton: Alex's own discs. Back is his blue arrow disc mirrored, help is his faq disc,
 * close is his X disc on a white ring, base is his blank blue base with art on it. No code-drawn
 * back, close or help. Hit area at least 48 pt. Optional red count badge, said in the button's own
 * label ("Daily chest, 2 ready": the caller's words). Pressing squishes the disc on the UI thread;
 * Reduce Motion swaps it instantly. Off fades by the one off token; busy shows the three dots.
 */
import { memo } from 'react';
import { Pressable, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import Badge from './Badge';
import Busy from './Busy';
import Lift from './Lift';
import { ART, ART_RATIO } from './art';
import { usePress } from './motion';
import { DROP, INK, OFF } from './tokens';

export type RoundKind = 'back' | 'help' | 'close' | 'base';

export type RoundButtonProps = {
  readonly kind: RoundKind;
  /** The whole thing VoiceOver says, count included ("Help, 3 new"). */
  readonly accessibilityLabel: string;
  readonly size?: number;
  /** Art on the blank base. */
  readonly art?: ImageSourcePropType;
  readonly artMirror?: boolean;
  readonly badge?: number;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly testID?: string;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
};

/** Every disc reaches 48 pt of touch. */
export const ROUND_HIT = 48;

function RoundButtonImpl({ kind, accessibilityLabel, size = 50, art, artMirror = false, badge, disabled = false, busy = false, testID, onPress, style }: RoundButtonProps) {
  const { p, pressIn, pressOut, reduced } = usePress();
  const squish = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.08 * p.value }] }));
  const pad = Math.max(0, (ROUND_HIT - size) / 2);
  const inert = disabled || busy;
  let body;
  if (kind === 'close') {
    const inner = size - 6;
    body = (
      <View style={{ width: size, height: size }}>
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: DROP.color, transform: [{ translateY: DROP.art }] }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: INK.white, alignItems: 'center', justifyContent: 'center' }}>
          <Lift source={ART.close} width={inner} height={inner} flat />
        </View>
      </View>
    );
  } else if (kind === 'base') {
    const h = Math.round(size / ART_RATIO.base);
    body = (
      <View style={{ width: size, height: h }}>
        <Lift source={ART.base} width={size} height={h} flat />
        {art ? <View style={{ position: 'absolute', left: size * 0.155, top: size * 0.155 }}><Lift source={art} width={size * 0.69} height={size * 0.69} mirror={artMirror} flat /></View> : null}
      </View>
    );
  } else {
    const source = kind === 'back' ? ART.arrow : ART.faq;
    const ratio = kind === 'back' ? ART_RATIO.arrow : ART_RATIO.faq;
    body = <Lift source={source} width={size} height={Math.round(size / ratio)} mirror={kind === 'back'} flat={kind === 'help'} />;
  }
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled, busy }} disabled={inert}
      onPressIn={inert ? undefined : pressIn} onPressOut={inert ? undefined : pressOut} onPress={inert ? undefined : () => { haptic('tapLight'); onPress?.(); }}
      hitSlop={pad} style={[{ alignSelf: 'flex-start', opacity: disabled ? OFF.artOpacity : 1 }, style]}>
      <Animated.View style={squish}>{body}</Animated.View>
      {busy ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}><Busy reduced={reduced} /></View> : null}
      {badge ? <Badge count={badge} label="" hidden style={{ position: 'absolute', right: -7, top: -7 }} /> : null}
    </Pressable>
  );
}

const RoundButton = memo(RoundButtonImpl);
export default RoundButton;
