/**
 * HudStepBack: a game's own HUD (score plate, pace chip, burst and fever
 * read-outs) fades all the way out while the shared results card is up.
 *
 * Why: under the scrim a half-dimmed HUD stayed readable and could say a
 * different number from the card (a "+12465 VS BEST" pace chip over a run
 * that did not beat BEST), and the podium shark stood on top of HUD chrome.
 * The card owns the numbers at the results moment, so the HUD steps back.
 *
 * One UI-thread timing (Reanimated), no per-frame React renders. Reduce
 * Motion jumps straight to the end value. Hidden from the screen reader
 * while back.
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export const HUD_STEP_BACK_MS = 180;

export function HudStepBack({ back, reducedMotion = false, children }: {
  back: boolean;
  reducedMotion?: boolean;
  children: React.ReactNode;
}) {
  const o = useSharedValue(back ? 0 : 1);
  useEffect(() => {
    const to = back ? 0 : 1;
    o.value = reducedMotion ? to : withTiming(to, { duration: HUD_STEP_BACK_MS });
  }, [back, reducedMotion, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, style]}
      // Touches pass through to the HUD's own buttons while it is up (box-none),
      // and nothing under the card can be pressed once it steps back.
      pointerEvents={back ? 'none' : 'box-none'}
      importantForAccessibility={back ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={back}
    >
      {children}
    </Animated.View>
  );
}
