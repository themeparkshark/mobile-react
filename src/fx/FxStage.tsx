import { NavigationContext } from '@react-navigation/native';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AppState, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { SharedValue, runOnJS, useAnimatedReaction, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { FxLod, NO_KICK, PaperBox, PartSpec, partLayout } from './registry';

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
  /** Clock time of the last tap on the stage: the rig replays its moment from there. */
  readonly kick: SharedValue<number>;
  readonly box: PaperBox;
  readonly lod: FxLod;
  /** Called (on JS) when a moment starts, for its sound and haptic. Only stages pass it. */
  readonly cue?: (moment: string) => void;
}

/**
 * Pauses every rig below it: the shelves while the try-on sheet covers them
 * (a Modal never blurs the screen), or a shelf scrolled out of view.
 */
export const FxPauseContext = createContext(false);

/** True while the stage should animate: focused screen, app active, not paused, not still. */
export function useFxRunning(lod: FxLod): boolean {
  const paused = useContext(FxPauseContext);
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
  return lod !== 'still' && focused && active && !paused;
}

/**
 * The stage clock in ms. Starts at `start` so a still stage shows the rest
 * pose. `every` > 1 advances it on every Nth frame only (shop tiles tick at
 * 30 Hz: half the commits, and at tile size nobody can tell; perf round 2).
 */
export function useFxClock(running: boolean, start = 0, every = 1): SharedValue<number> {
  const t = useSharedValue(start);
  const pending = useSharedValue(0);
  const frames = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    'worklet';
    // Cap the step so a hitch never teleports a particle across the stage.
    pending.value += Math.min(info.timeSincePreviousFrame ?? 16, 50);
    frames.value += 1;
    if (frames.value % every !== 0) return;
    t.value += pending.value;
    pending.value = 0;
  }, false);
  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return t;
}

/** The stage's tap time (see RigProps.kick). */
export function useFxKick(): SharedValue<number> {
  return useSharedValue(NO_KICK);
}

/**
 * Calls `onStart` on the JS thread when `progress` (a worklet returning -1
 * when idle) enters a moment. Used for moment sounds and haptics, so they land
 * on the frame the motion starts; nothing crosses threads in between.
 */
export function useMomentCue(t: SharedValue<number>, kick: SharedValue<number>, progress: () => number, onStart: (() => void) | undefined) {
  useAnimatedReaction(() => {
    // Read the clock here: Reanimated only re-runs a reaction for shared values its own closure reads.
    const now = t.value + kick.value * 0;
    return now === now && progress() >= 0;
  }, (on, was) => {
    if (on && was === false && onStart) runOnJS(onStart)();
  });
}

const ClockContext = createContext<SharedValue<number> | null>(null);

/** Shares one clock between the back and front layers of a stage. */
export function FxClockProvider({ clock, children }: { readonly clock: SharedValue<number>; readonly children: ReactNode }) {
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

export function useStageClock(): SharedValue<number> | null {
  return useContext(ClockContext);
}

/** Fills its parent, measures it, and hands children the box (a known size draws on the first frame). */
export function FxBox({ children, measure, initial }: {
  readonly children: (size: { width: number; height: number }) => ReactNode;
  readonly measure?: (size: { width: number; height: number }) => void;
  readonly initial?: { width: number; height: number };
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(initial ?? null);
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

/**
 * A rig part placed by its spec, with an optional animated style on top. The
 * image itself animates (no wrapper view), so a fade never forces an
 * offscreen pass on iOS (performance panel round 2).
 */
export function FxPart({ source, box, spec, aspect = 1, style, tint, opacity, fit = 'contain' }: {
  readonly source: number;
  readonly box: PaperBox;
  readonly spec: PartSpec;
  readonly aspect?: number;
  readonly style?: object;
  readonly tint?: string;
  readonly opacity?: number;
  /** 'fill' stretches a soft glow sprite to the part's box. */
  readonly fit?: 'contain' | 'fill';
}) {
  const l = partLayout(box, spec, aspect);
  return (
    <Animated.Image source={source} resizeMode={fit === 'fill' ? 'stretch' : 'contain'} style={[{
      position: 'absolute', left: l.left, top: l.top, width: l.width, height: l.height,
      transformOrigin: l.origin, transform: [{ rotate: `${l.rot}deg` }], opacity, tintColor: tint,
    }, style]} />
  );
}
