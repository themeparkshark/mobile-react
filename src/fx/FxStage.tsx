import { NavigationContext } from '@react-navigation/native';
import { Image, type ImageSource } from 'expo-image';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AppState, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { FxLod, PaperBox, PartSpec, partLayout } from './registry';

/**
 * Shared plumbing for Secret Shop rigs (secret-shop/DESIGN.md 8.2).
 *
 * One clock per stage: a UI-thread frame callback advances `t` (ms), and
 * every rig part derives its pose from it in a worklet. No JS runs per frame
 * and nothing re-renders after mount. The clock stops when the screen loses
 * focus, when the app leaves the foreground, and for the still LOD.
 */

/** Props every rig layer gets. */
export interface RigProps {
  readonly t: SharedValue<number>;
  readonly box: PaperBox;
  readonly lod: FxLod;
}

/** True while the stage should animate: focused screen, app active, not still. */
export function useFxRunning(lod: FxLod): boolean {
  // Outside a navigator (share capture, tests) there is no focus to lose.
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused?.() ?? true);
  const [active, setActive] = useState(AppState.currentState === 'active' || AppState.currentState == null);
  useEffect(() => {
    if (!navigation) return;
    const onFocus = navigation.addListener('focus', () => setFocused(true));
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    return () => { onFocus(); onBlur(); };
  }, [navigation]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return lod !== 'still' && focused && active;
}

/** The stage clock in ms. Starts at `start` so a still stage shows the rest pose. */
export function useFxClock(running: boolean, start = 0): SharedValue<number> {
  const t = useSharedValue(start);
  const frame = useFrameCallback((info) => {
    'worklet';
    // Cap the step so a hitch never teleports a particle across the stage.
    t.value += Math.min(info.timeSincePreviousFrame ?? 16, 50);
  }, false);
  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return t;
}

const ClockContext = createContext<SharedValue<number> | null>(null);

/** Shares one clock between the back and front layers of a stage. */
export function FxClockProvider({ clock, children }: { readonly clock: SharedValue<number>; readonly children: ReactNode }) {
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

export function useStageClock(): SharedValue<number> | null {
  return useContext(ClockContext);
}

/** Fills its parent, measures it, and hands children the box. */
export function FxBox({ children, measure }: {
  readonly children: (size: { width: number; height: number }) => ReactNode;
  readonly measure?: (size: { width: number; height: number }) => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 0.5 || Math.abs(size.height - height) > 0.5) {
      setSize({ width, height });
      measure?.({ width, height });
    }
  };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {size && size.width > 0 ? children(size) : null}
    </View>
  );
}

/** A rig part placed by its spec, with an optional animated style on top. */
export function FxPart({ source, box, spec, aspect = 1, style, tint, blur, opacity }: {
  readonly source: ImageSource | number;
  readonly box: PaperBox;
  readonly spec: PartSpec;
  readonly aspect?: number;
  readonly style?: object;
  readonly tint?: string;
  readonly blur?: number;
  readonly opacity?: number;
}) {
  const l = partLayout(box, spec, aspect);
  return (
    <Animated.View pointerEvents="none" style={[{
      position: 'absolute', left: l.left, top: l.top, width: l.width, height: l.height,
      transformOrigin: l.origin, transform: [{ rotate: `${l.rot}deg` }], opacity,
    }, style]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" tintColor={tint} blurRadius={blur}
        cachePolicy="memory" />
    </Animated.View>
  );
}
