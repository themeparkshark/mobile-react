/**
 * RoundButton: Alex's own discs. Back is his blue arrow disc mirrored, help is his faq disc,
 * close is his X disc on a white ring, base is his blank blue base with art on it. No
 * code-drawn back, close or help. Hit area at least 48 pt. Optional red count badge.
 * Pressing squishes the disc (scale on the UI thread); Reduce Motion swaps it instantly.
 */
import { memo } from 'react';
import { Pressable, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import Badge from './Badge';
import Lift from './Lift';
import { ART, ART_RATIO } from './art';
import { usePress } from './motion';
import { DROP, INK } from './tokens';

export type RoundKind = 'back' | 'help' | 'close' | 'base';

export type RoundButtonProps = {
  readonly kind: RoundKind;
  readonly accessibilityLabel: string;
  readonly size?: number;
  /** Art on the blank base. */
  readonly art?: ImageSourcePropType;
  readonly artMirror?: boolean;
  readonly badge?: number;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
};

const HIT = 48;

function RoundButtonImpl({ kind, accessibilityLabel, size = 50, art, artMirror = false, badge, disabled = false, onPress, style }: RoundButtonProps) {
  const { p, pressIn, pressOut } = usePress();
  const squish = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.08 * p.value }] }));
  const pad = Math.max(0, (HIT - size) / 2);
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
    const w = size;
    const h = Math.round(size / ART_RATIO.base);
    body = (
      <View style={{ width: w, height: h }}>
        <Lift source={ART.base} width={w} height={h} flat />
        {art ? <View style={{ position: 'absolute', left: size * 0.155, top: size * 0.155 }}><Lift source={art} width={size * 0.69} height={size * 0.69} mirror={artMirror} flat /></View> : null}
      </View>
    );
  } else {
    const source = kind === 'back' ? ART.arrow : ART.faq;
    const ratio = kind === 'back' ? ART_RATIO.arrow : ART_RATIO.faq;
    body = <Lift source={source} width={size} height={Math.round(size / ratio)} mirror={kind === 'back'} flat={kind === 'help'} />;
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled}
      onPressIn={pressIn} onPressOut={pressOut} onPress={() => { haptic('tapLight'); onPress?.(); }}
      hitSlop={pad} style={[{ alignSelf: 'flex-start', opacity: disabled ? 0.55 : 1 }, style]}>
      <Animated.View style={squish}>{body}</Animated.View>
      {badge ? <Badge count={badge} style={{ position: 'absolute', right: -7, top: -7 }} /> : null}
    </Pressable>
  );
}

const RoundButton = memo(RoundButtonImpl);
export default RoundButton;
