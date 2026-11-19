/**
 * One layer above a sheet's contents, drawn in the sheet's own view (ui/sheetOverlay.ts, fix pass w4, N02).
 * Its own soft fade, started on its own mount (a fade started by the caller before the layer existed ended before
 * the view did, and the grown-up gate stayed at opacity 0: unseen, while it held the screen). The outer plain view is
 * never see-through to touches while the layer is up, even on the first faint frames; a leaving layer lets taps
 * through at once and fades out on the UI thread. Reduce Motion places and removes it at once.
 */
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from './useUiReducedMotion';

export const SHEET_LAYER_IN_MS = 220;
export const SHEET_LAYER_OUT_MS = 160;

export default function SheetOverlayLayer({ leaving, children }: { readonly leaving: boolean; readonly children: ReactNode }) {
  const reduced = useUiReducedMotion();
  const shown = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    shown.value = withTiming(leaving ? 0 : 1, {
      duration: reduced ? 0 : leaving ? SHEET_LAYER_OUT_MS : SHEET_LAYER_IN_MS,
      easing: leaving ? Easing.in(Easing.quad) : Easing.out(Easing.quad),
    });
  }, [leaving, reduced, shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={leaving ? 'none' : 'auto'} accessibilityViewIsModal={!leaving}>
      <Animated.View style={[StyleSheet.absoluteFill, fade]}>{children}</Animated.View>
    </View>
  );
}
