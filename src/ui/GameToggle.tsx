/**
 * <GameToggle> (WS0 UI kit): the game's on/off switch, in place of the stock iOS Switch (T150).
 *
 *   <GameToggle value={on} label="Music" onChange={setOn} />
 *   <GameToggle value={on} label="Music" />          // shows the state only (its row toggles)
 *
 * His look from simple shapes in BRAND colors: a cream track with the thick navy cartoon outline that turns
 * game blue when on, and a gold thumb (the gold of his buttons) that springs across on the UI thread.
 * Reduce Motion moves it without the spring. 44 pt of touch; VoiceOver hears a switch with On or Off.
 */
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import useUiReducedMotion from './useUiReducedMotion';
import { BRAND, OUTLINE } from './tokens';
import { SPRING } from './motion';

export const TOGGLE = { width: 56, height: 32, thumb: 24, inset: 2 } as const;

export type GameToggleProps = {
  readonly value: boolean;
  readonly label: string;
  /** Leave out when the whole row toggles: the toggle then only shows the state. */
  readonly onChange?: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly testID?: string;
};

/** Where the thumb sits (0 off, 1 on): pure, so it is unit tested. */
export function thumbX(progress: number): number {
  const travel = TOGGLE.width - TOGGLE.thumb - 2 * TOGGLE.inset - 2 * OUTLINE.thick;
  return Math.max(0, Math.min(1, progress)) * travel;
}

export default function GameToggle({ value, label, onChange, disabled = false, testID }: GameToggleProps) {
  const reduced = useUiReducedMotion();
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    on.value = reduced ? withTiming(value ? 1 : 0, { duration: 120 }) : withSpring(value ? 1 : 0, SPRING.stamp);
  }, [value, reduced, on]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [BRAND.cream, BRAND.blueBright]),
  }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX(on.value) }] }));

  const body = (
    <Animated.View style={[{
      width: TOGGLE.width, height: TOGGLE.height, borderRadius: TOGGLE.height / 2,
      borderWidth: OUTLINE.thick, borderColor: BRAND.navy, padding: TOGGLE.inset, justifyContent: 'center',
      opacity: disabled ? 0.5 : 1,
    }, track]}>
      <Animated.View style={[{
        width: TOGGLE.thumb, height: TOGGLE.thumb - 2, borderRadius: TOGGLE.thumb / 2, backgroundColor: BRAND.gold,
        borderWidth: OUTLINE.thin, borderColor: BRAND.navy, borderBottomWidth: OUTLINE.thin + 2, borderBottomColor: BRAND.goldLip,
      }, thumb]} />
    </Animated.View>
  );

  if (!onChange) {
    return <View testID={testID} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">{body}</View>;
  }
  return (
    <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }}
      disabled={disabled} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      onPress={() => { void Haptics.selectionAsync().catch(() => undefined); onChange(!value); }}>
      {body}
    </Pressable>
  );
}
