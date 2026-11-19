/**
 * Switch: a groove pill with a white knob (DIRECTION.md kit: Switch; kit.png "Progress, tabs,
 * switch"). On: the gold groove, the knob at the right. Off: the blue groove, the knob at the left.
 * Never a stock switch. The knob walks on a spring on the UI thread (Reduce Motion: it jumps and the
 * gold fades in over 150 ms). At least 44 pt to touch, says "switch" and on or off to VoiceOver;
 * off (disabled) is a sky groove (the kit's off look); busy holds it still and says busy.
 */
import { memo, useEffect } from 'react';
import { Pressable, View, type StyleProp } from 'react-native';
import type { LayoutStyle } from './style';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { SPRING } from '../motion';
import useUiReducedMotion from '../useUiReducedMotion';
import { BUTTON, DROP, INK, SHADE, STICK, SWITCH } from './tokens';

export type SwitchProps = {
  readonly value: boolean;
  readonly onChange?: (next: boolean) => void;
  /** What VoiceOver says ("Music"). */
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly testID?: string;
  readonly style?: StyleProp<LayoutStyle>;
};

const GOLD = [INK.goldLight, INK.gold] as const;
const TRAVEL = SWITCH.width - SWITCH.line * 2 - SWITCH.knob - 2;

function SwitchImpl({ value, onChange, accessibilityLabel, disabled = false, busy = false, testID, style }: SwitchProps) {
  const reduced = useUiReducedMotion();
  const t = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    t.value = reduced ? withTiming(value ? 1 : 0, { duration: STICK.reducedFadeMs, easing: Easing.out(Easing.quad) }) : withSpring(value ? 1 : 0, SPRING.stamp);
  }, [reduced, t, value]);
  const knob = useAnimatedStyle(() => (reduced ? { transform: [{ translateX: TRAVEL * Math.round(t.value) }] } : { transform: [{ translateX: TRAVEL * t.value }] }));
  const gold = useAnimatedStyle(() => ({ opacity: t.value }));
  const inert = disabled || busy;
  const slop = (BUTTON.minTouch - SWITCH.height) / 2;
  return (
    <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: value, disabled, busy }}
      disabled={inert} hitSlop={{ top: slop, bottom: slop }} onPress={inert ? undefined : () => { haptic('tapLight'); onChange?.(!value); }}
      style={[{ width: SWITCH.width, height: SWITCH.height }, style]}>
      {/* Off (disabled): the one off look, a sky groove that keeps its knob (never a faded gold that reads olive). */}
      <View style={{ flex: 1, borderRadius: SWITCH.height / 2, borderWidth: SWITCH.line, borderColor: INK.navy, backgroundColor: disabled ? INK.skyLip : INK.blueLip, overflow: 'hidden' }}>
        {disabled ? null : <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, gold]}><LinearGradient colors={GOLD} style={{ flex: 1 }} /></Animated.View>}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: SHADE.grooveInset }} />
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: SHADE.switchOnInset }, gold]} />
        <Animated.View style={[{ position: 'absolute', left: 1, top: 0, width: SWITCH.knob, height: SWITCH.knob }, knob]}>
          <View style={{ position: 'absolute', width: SWITCH.knob, height: SWITCH.knob, borderRadius: SWITCH.knob / 2, backgroundColor: DROP.knob, transform: [{ translateY: 2 }] }} />
          <View style={{ width: SWITCH.knob, height: SWITCH.knob, borderRadius: SWITCH.knob / 2, backgroundColor: INK.white, borderWidth: SWITCH.line, borderColor: INK.navy }} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const Switch = memo(SwitchImpl);
export default Switch;
