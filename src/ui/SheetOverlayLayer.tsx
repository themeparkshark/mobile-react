/**
 * One layer above a sheet's contents, drawn in the sheet's own view (ui/sheetOverlay.ts, fix pass w4, N02).
 * Its own soft fade, started on its own mount (a fade started by the caller before the layer existed ended before
 * the view did, and the grown-up gate stayed at opacity 0: unseen, while it held the screen). The outer plain view
 * takes every touch while the layer is up, from its first faint frame. Reduce Motion places and removes it at once.
 *
 * Leaving (fix pass w5, lane host, W4-SMOKE-2): a layer that is fading out used to let taps through at once. When the
 * frame clock stalled, the fade stalled with it, and a tap on a gate that was still drawn reached the Shark Shop row
 * under it. Now a leaving layer still holds every touch until it is out of the tree (its buttons no longer answer),
 * and the first tap it held is then handed to what is under that point in the sheet, so a quick "Not now, then the
 * row" never loses the second press and never passes through a gate a kid can still see.
 */
import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { pressTrace } from './pressTrace';
import { sheetPressContext } from './sheetOverlay';
import useUiReducedMotion from './useUiReducedMotion';

export const SHEET_LAYER_IN_MS = 220;
export const SHEET_LAYER_OUT_MS = 160;

type TouchEvent = { nativeEvent: { pageX: number; pageY: number; tpsSheetNoted?: boolean } };

/** Pure: the first tap a leaving layer holds (later ones in the same leave are the same press, never a second). */
export function holdLeavingTap(held: { x: number; y: number } | null, leaving: boolean, x: number, y: number): { x: number; y: number } | null {
  if (!leaving) return held;
  return held ?? { x, y };
}

export default function SheetOverlayLayer({ leaving, children }: { readonly leaving: boolean; readonly children: ReactNode }) {
  const reduced = useUiReducedMotion();
  const pressUnder = useContext(sheetPressContext());
  const held = useRef<{ x: number; y: number } | null>(null);
  const pressRef = useRef(pressUnder);
  pressRef.current = pressUnder;
  const shown = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    shown.value = withTiming(leaving ? 0 : 1, {
      duration: reduced ? 0 : leaving ? SHEET_LAYER_OUT_MS : SHEET_LAYER_IN_MS,
      easing: leaving ? Easing.in(Easing.quad) : Easing.out(Easing.quad),
    });
  }, [leaving, reduced, shown]);
  // Out of the tree: the held tap goes to the sheet under it, after this commit (the hit test then no longer sees it).
  useEffect(() => () => {
    const tap = held.current;
    held.current = null;
    const press = pressRef.current;
    if (!tap || !press) return;
    setTimeout(() => {
      pressTrace('layer.heldTap.deliver', () => `x=${Math.round(tap.x)} y=${Math.round(tap.y)}`);
      press(tap.x, tap.y);
    }, 0);
  }, []);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal={!leaving}
      accessibilityElementsHidden={leaving} importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      onTouchStart={(event: TouchEvent) => {
        if (!leaving) return;
        // Held here: the sheet itself does not keep it as a tap for the screen under the whole sheet.
        event.nativeEvent.tpsSheetNoted = true;
        const first = held.current === null;
        held.current = holdLeavingTap(held.current, leaving, event.nativeEvent.pageX, event.nativeEvent.pageY);
        if (first) pressTrace('layer.heldTap', () => `x=${Math.round(event.nativeEvent.pageX)} y=${Math.round(event.nativeEvent.pageY)}`);
      }}>
      <Animated.View style={[StyleSheet.absoluteFill, fade]} pointerEvents={leaving ? 'none' : 'auto'}>{children}</Animated.View>
    </View>
  );
}
