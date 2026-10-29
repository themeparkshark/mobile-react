import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';

/**
 * The reward cards' one modal host (the Rewards sheet, Daily 3, the reveals and the daily chest; core loop,
 * October 2026). It replaces react-native-modal for these cards because its native-driver path flashed:
 * the dim blinked off and on before a close, and on open one full-size frame of the card showed (rows not yet
 * faded in, no dim) before the zoom started.
 *
 * Here one shared value drives the dim and the card together on the UI thread, so they can never disagree:
 * - The card starts at 0 (invisible, small) on its very first frame and grows from there, so no full-size frame
 *   ever shows before the zoom.
 * - Closing shrinks the card and fades the dim in the same animation, then the native sheet goes away.
 * - A new card inside the same open sheet (Rewards to a chest and back) just takes the old one's place: no native
 *   dismiss and present, so there is never a bare map between two cards. (A whole-sheet pop on a swap was tried:
 *   the UI thread scaled the old card for a few frames before the new one mounted, so a new card brings its own.)
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
export function calmFrame(p: number, reduced: boolean, backdropOpacity = 0.55): { backdrop: number; opacity: number; scale: number } {
  'worklet';
  const c = Math.min(1, Math.max(0, p));
  if (reduced) return { backdrop: c * backdropOpacity, opacity: c, scale: 1 };
  return { backdrop: c * backdropOpacity, opacity: Math.min(1, Math.max(0, p / 0.45)), scale: 0.55 + 0.45 * p };
}

/** What the sheet shows: the live card, or (while it shrinks away with nothing live) the last card it showed. */
export function calmFace<F>(live: F | null, last: F | null): F | null {
  return live ?? last;
}

export default function CalmModal({ visible, children, reducedMotion, onWillShow, onShow, onHide, onDismiss,
  onBackdropPress, onBackButtonPress, inMs = CALM_IN_MS, outMs = CALM_OUT_MS, backdropColor, backdropOpacity = 0.55 }: {
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
}) {
  const { width } = useWindowDimensions();
  const [native, setNative] = useState(visible);
  const p = useSharedValue(0);
  const cb = useRef({ onWillShow, onShow, onHide, onDismiss });
  cb.current = { onWillShow, onShow, onHide, onDismiss };
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const hidPending = useRef(false);
  const firstRun = useRef(true);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    cancelAnimation(p);
  }, [p]);

  const shown = () => { if (mounted.current && visibleRef.current) cb.current.onShow?.(); };
  const hidden = () => {
    if (!mounted.current || visibleRef.current) return;
    hidPending.current = true;
    setNative(false);
  };
  const grow = () => {
    if (!visibleRef.current) return;
    p.value = withTiming(1, { duration: reducedMotion ? 120 : inMs, easing: reducedMotion ? Easing.linear : Easing.out(Easing.back(1.2)) },
      done => { if (done) runOnJS(shown)(); });
  };

  useEffect(() => {
    const first = firstRun.current;
    firstRun.current = false;
    if (visible) {
      if (!native) {
        cancelAnimation(p); p.value = 0;
        setNative(true);
        cb.current.onWillShow?.();
      } else if (first) {
        // Mounted already visible: the mount effect below starts the zoom.
        cb.current.onWillShow?.();
      } else {
        // Asked again while closing: grow back from where it is.
        grow();
      }
      return;
    }
    if (!native) return;
    p.value = withTiming(0, { duration: reducedMotion ? 120 : outMs, easing: Easing.in(Easing.quad) },
      done => { if (done) runOnJS(hidden)(); });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // The native sheet was just mounted: start the zoom now, not after onShow's round trip (native to JS and back cost
  // a few hundred ms under load). Frames drawn before UIKit shows the sheet are never seen, and p starts at 0, so the
  // first frame that shows is the small, faint start of the zoom, never a full-size card.
  useEffect(() => {
    if (native && visibleRef.current) grow();
  }, [native]); // eslint-disable-line react-hooks/exhaustive-deps

  // The native sheet is asked to go: tell the host the animation ended (react-native-modal's onModalHide moment).
  useEffect(() => {
    if (native || !hidPending.current) return;
    hidPending.current = false;
    cb.current.onHide?.();
  }, [native]);


  const backdropStyle = useAnimatedStyle(() => ({ opacity: calmFrame(p.value, reducedMotion, backdropOpacity).backdrop }));
  const cardStyle = useAnimatedStyle(() => {
    const f = calmFrame(p.value, reducedMotion, backdropOpacity);
    return { opacity: f.opacity, transform: [{ scale: f.scale }] };
  });

  return (
    <Modal visible={native} transparent animationType="none" statusBarTranslucent
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
