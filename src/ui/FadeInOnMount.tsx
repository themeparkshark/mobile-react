import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { EASE } from './motionEasing';

/**
 * Whether the native Modal around a view is on screen yet. A Modal's content mounts before iOS presents it, so a fade
 * started at mount can finish while nobody sees it and the view then snaps in. Reward modals provide this from their
 * onShow (useModalShown); everywhere else it is true.
 */
const ModalShownContext = createContext(true);

export function ModalShownProvider({ shown, children }: { readonly shown: boolean; readonly children?: ReactNode }) {
  return <ModalShownContext.Provider value={shown}>{children}</ModalShownContext.Provider>;
}

/** If a Modal never reports onShow (a rare iOS miss), its content still plays after this long. */
export const MODAL_SHOWN_FALLBACK_MS = 600;

/**
 * For a native Modal: `shown` turns true on the Modal's onShow (or the fallback), and back to false when it hides.
 * Pass `onShow` to the Modal and wrap its content in <ModalShownProvider shown={shown}>.
 */
export function useModalShown(visible: boolean): { readonly shown: boolean; readonly onShow: () => void } {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!visible) { setShown(false); return undefined; }
    const fallback = setTimeout(() => setShown(true), MODAL_SHOWN_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [visible]);
  return { shown: visible && shown, onShow: () => setShown(true) };
}

/**
 * A view that fades in on the UI thread when it mounts. Use it instead of `entering={FadeIn...}` (and FadeInDown,
 * ZoomIn): on this app's Fabric build a layout-animation `entering` can show the view at full opacity on its first
 * frame (the queued Set Complete card snapped in with no fade in release JS), while a shared value always plays.
 * Inside a reward Modal it waits for the Modal to be on screen (ModalShownProvider).
 * `rise` starts it that many pt lower (FadeInDown), `pop` starts it at that scale and springs to full size (ZoomIn).
 * `instant` (Reduce Motion, or a layer that must show at once) mounts it fully shown.
 */
export default function FadeInOnMount({ duration, delay = 0, rise = 0, pop, instant = false, style, children, ...rest }: ViewProps & {
  readonly duration: number;
  readonly delay?: number;
  readonly rise?: number;
  readonly pop?: number;
  readonly instant?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}) {
  const onScreen = useContext(ModalShownContext);
  const shown = useSharedValue(instant ? 1 : 0);
  const started = useRef(instant);
  useEffect(() => {
    if (started.current || !onScreen) return;
    started.current = true;
    const to = pop !== undefined ? withSpring(1, { damping: 12, stiffness: 190, mass: 0.9 }) : withTiming(1, { duration, easing: EASE.out });
    shown.value = delay > 0 ? withDelay(delay, to) : to;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScreen]);
  useEffect(() => () => cancelAnimation(shown), [shown]);
  const startScale = pop ?? 1;
  const fade = useAnimatedStyle(() => {
    const p = shown.value;
    return {
      opacity: pop !== undefined ? Math.min(1, p * 2) : Math.min(1, p),
      transform: [{ translateY: rise * (1 - Math.min(1, p)) }, { scale: startScale + (1 - startScale) * p }],
    };
  });
  return <Animated.View {...rest} style={[style, fade]}>{children}</Animated.View>;
}
