import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';

/**
 * The reward cards' one modal host (the Rewards sheet, Daily 3, the reveals and the daily chest; core loop,
 * October 2026). It replaces react-native-modal for these cards because its native-driver path flashed:
 * the dim blinked off and on before a close, and on open one full-size frame of the card showed (rows not yet
 * faded in, no dim) before the zoom started.
 *
 * Here one shared value drives the dim and the card together on the UI thread, so they can never disagree:
 * - The card starts at 0 (invisible, small) on its very first frame and only grows once UIKit says the sheet
 *   is up (RN Modal onShow), so no full-size frame ever shows before the zoom.
 * - Closing shrinks the card and fades the dim in the same animation, then the native sheet goes away.
 * - `swapKey`: a new card inside the same open sheet (Rewards to a chest and back) gets a small settle instead
 *   of a native dismiss and present, so there is never a bare map between two cards.
 * Callbacks match what the hosts used before: onShow after the zoom in, onHide when the zoom out ends (the native
 * dismiss starts then), onDismiss when UIKit says it is really gone (iOS; Android hosts keep their fallback).
 */
export const CALM_IN_MS = 240;
export const CALM_OUT_MS = 180;

/**
 * One frame of the sheet from its one progress value `p` (0 gone, 1 up; the zoom in may overshoot past 1).
 * The dim and the card both come from `p`, so the dim can never blink while the card is up, and at p = 0 the card
 * is invisible (the first frame before the zoom is never a full-size card).
 */
export function calmFrame(p: number, reduced: boolean, swap = 1, backdropOpacity = 0.55): { backdrop: number; opacity: number; scale: number } {
  'worklet';
  const c = Math.min(1, Math.max(0, p));
  if (reduced) return { backdrop: c * backdropOpacity, opacity: c, scale: 1 };
  return { backdrop: c * backdropOpacity, opacity: Math.min(1, Math.max(0, p / 0.45)), scale: (0.55 + 0.45 * p) * swap };
}

/** What the sheet shows: the live card, or (while it shrinks away with nothing live) the last card it showed. */
export function calmFace<F>(live: F | null, last: F | null): F | null {
  return live ?? last;
}

export default function CalmModal({ visible, children, reducedMotion, onWillShow, onShow, onHide, onDismiss,
  onBackdropPress, onBackButtonPress, inMs = CALM_IN_MS, outMs = CALM_OUT_MS, backdropColor, backdropOpacity = 0.55, swapKey }: {
  readonly visible: boolean;
  readonly children: ReactNode;
  readonly reducedMotion: boolean;
  readonly onWillShow?: () => void;
  readonly onShow?: () => void;
  readonly onHide?: () => void;
  readonly onDismiss?: () => void;
  readonly onBackdropPress?: () => void;
  readonly onBackButtonPress?: () => void;
  readonly inMs?: number;
  readonly outMs?: number;
  readonly backdropColor: string;
  readonly backdropOpacity?: number;
  /** A different card in the same open sheet: settle it in place (no native dismiss and present). */
  readonly swapKey?: string;
}) {
  const { width } = useWindowDimensions();
  const [native, setNative] = useState(visible);
  const p = useSharedValue(0);
  const swap = useSharedValue(1);
  const cb = useRef({ onWillShow, onShow, onHide, onDismiss });
  cb.current = { onWillShow, onShow, onHide, onDismiss };
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const presented = useRef(false);
  const hidPending = useRef(false);
  const showFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    if (showFallback.current) clearTimeout(showFallback.current);
    cancelAnimation(p); cancelAnimation(swap);
  }, [p, swap]);

  const shown = () => { if (mounted.current && visibleRef.current) cb.current.onShow?.(); };
  const hidden = () => {
    if (!mounted.current || visibleRef.current) return;
    hidPending.current = true;
    setNative(false);
  };
  const grow = () => {
    if (showFallback.current) { clearTimeout(showFallback.current); showFallback.current = null; }
    if (!visibleRef.current) return;
    p.value = withTiming(1, { duration: reducedMotion ? 120 : inMs, easing: reducedMotion ? Easing.linear : Easing.out(Easing.back(1.2)) },
      done => { if (done) runOnJS(shown)(); });
  };

  useEffect(() => {
    if (visible) {
      if (!native) {
        presented.current = false;
        cancelAnimation(p); p.value = 0;
        setNative(true);
        cb.current.onWillShow?.();
      } else if (presented.current) {
        // Asked again while closing: grow back from where it is.
        grow();
      } else if (!showFallback.current) {
        // First mount with visible: onShow normally starts the zoom; this covers a platform that never sends it.
        cb.current.onWillShow?.();
        showFallback.current = setTimeout(grow, 400);
      }
      return;
    }
    if (!native) return;
    if (showFallback.current) { clearTimeout(showFallback.current); showFallback.current = null; }
    p.value = withTiming(0, { duration: reducedMotion ? 120 : outMs, easing: Easing.in(Easing.quad) },
      done => { if (done) runOnJS(hidden)(); });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // The native sheet is asked to go: tell the host the animation ended (react-native-modal's onModalHide moment).
  useEffect(() => {
    if (native || !hidPending.current) return;
    hidPending.current = false;
    cb.current.onHide?.();
  }, [native]);

  // A new card inside the open sheet settles in place.
  const lastSwap = useRef(swapKey);
  useEffect(() => {
    if (swapKey === lastSwap.current) return;
    lastSwap.current = swapKey;
    if (!native || reducedMotion) return;
    swap.value = withSequence(withTiming(0.9, { duration: 0 }), withTiming(1, { duration: 200, easing: Easing.out(Easing.back(1.4)) }));
  }, [swapKey, native, reducedMotion, swap]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: calmFrame(p.value, reducedMotion, 1, backdropOpacity).backdrop }));
  const cardStyle = useAnimatedStyle(() => {
    const f = calmFrame(p.value, reducedMotion, swap.value, backdropOpacity);
    return { opacity: f.opacity, transform: [{ scale: f.scale }] };
  });

  return (
    <Modal visible={native} transparent animationType="none" statusBarTranslucent
      onShow={() => { presented.current = true; grow(); }}
      onDismiss={() => cb.current.onDismiss?.()}
      onRequestClose={() => onBackButtonPress?.()}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} disabled={!onBackdropPress}
        accessible={false} importantForAccessibility="no">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor }, backdropStyle]} />
      </Pressable>
      <Animated.View pointerEvents="box-none" style={[styles.content, { margin: width * 0.05 }, cardStyle]}>
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center' },
});
