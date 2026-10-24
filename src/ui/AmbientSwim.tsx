/**
 * <AmbientSwim>: an empty screen still has a friend in it.
 *
 *   <AmbientSwim><Image source={art} style={{ width: 120, height: 120 }} /></AmbientSwim>
 *
 * The art swims a lazy figure-8 (12 pt by 6 pt, one loop every 4 s) with a soft tilt, and three
 * small bubbles rise past it now and then. Ambient only: it runs through useAmbientLoop, so it
 * rests when the phone is idle, in the background, on Battery Saver idle or with Reduce Motion,
 * and it stops when the screen loses focus (safe outside a navigator too: it then just runs). Transforms only; no layout callbacks, no SVG.
 */
import { type ReactNode, useContext, useEffect, useState } from 'react';
import { View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
  type SharedValue } from 'react-native-reanimated';
import useAmbientLoop from '../power/useAmbientLoop';
import useUiReducedMotion from './useUiReducedMotion';
import { BRAND } from './tokens';
import { AMBIENT } from './motion';

/** True while this view's screen is focused; always true outside a navigator (previews, modals). */
export function useScreenFocused(): boolean {
  const nav = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => (nav ? nav.isFocused() : true));
  useEffect(() => {
    if (!nav) return undefined;
    setFocused(nav.isFocused());
    const off1 = nav.addListener('focus', () => setFocused(true));
    const off2 = nav.addListener('blur', () => setFocused(false));
    return () => { off1(); off2(); };
  }, [nav]);
  return focused;
}

export const SWIM = { loopMs: 4000, widePt: 12, tallPt: 6, tiltDeg: 4, bubbleMs: 2600, bubbleGapMs: 1400 } as const;

/** Bubbles big enough to read on a phone: a white rim, a pale water fill and a highlight dot. */
const BUBBLES = [{ x: -40, size: 14, delay: 0 }, { x: 34, size: 11, delay: 600 }, { x: -12, size: 10, delay: 1200 }];

export default function AmbientSwim({ children, bubbles = true }: { readonly children: ReactNode; readonly bubbles?: boolean }) {
  const reduced = useUiReducedMotion();
  const focused = useScreenFocused();
  const t = useSharedValue(0);
  const rise = useSharedValue(0);
  useAmbientLoop(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: SWIM.loopMs, easing: Easing.linear }), -1, false);
    rise.value = 0;
    rise.value = withRepeat(withDelay(SWIM.bubbleGapMs, withTiming(1, { duration: SWIM.bubbleMs, easing: Easing.out(Easing.quad) })), -1, false);
  }, () => {
    cancelAnimation(t); cancelAnimation(rise);
    t.value = withTiming(0, { duration: 300 });
    rise.value = 0;
  }, focused && !reduced);
  const swim = useAnimatedStyle(() => {
    const a = t.value * Math.PI * 2;
    // A figure-8: across once, up and down twice.
    return { transform: [{ translateX: Math.sin(a) * SWIM.widePt }, { translateY: Math.sin(a * 2) * SWIM.tallPt },
      { rotate: `${Math.cos(a) * SWIM.tiltDeg}deg` }] };
  });
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={swim}>{children}</Animated.View>
      {bubbles && !reduced && BUBBLES.map((b, i) => <Bubble key={i} rise={rise} x={b.x} size={b.size} delay={b.delay / SWIM.bubbleMs} />)}
    </View>
  );
}

function Bubble({ rise, x, size, delay }: { rise: SharedValue<number>; x: number; size: number; delay: number }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (rise.value - delay) / (1 - delay)));
    return {
      opacity: p <= 0 || p >= 1 ? 0 : p < 0.15 ? p / 0.15 * 0.8 : 0.8 * (1 - (p - 0.15) / 0.85),
      transform: [{ translateX: x + Math.sin(p * 6) * 3 }, { translateY: 20 - p * 70 }, { scale: 0.6 + p * 0.5 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2,
    borderWidth: 2, borderColor: BRAND.white, backgroundColor: 'rgba(191, 229, 255, 0.55)' }, style]}>
    <View style={{ position: 'absolute', left: size * 0.18, top: size * 0.14, width: size * 0.28, height: size * 0.28,
      borderRadius: size, backgroundColor: BRAND.white }} />
  </Animated.View>;
}

/**
 * <Breathe>: the one way forward on a quiet screen breathes 1.0 to 1.03 every AMBIENT.breathMs.
 * Ambient budget only (useAmbientLoop and screen focus); still with Reduce Motion.
 */
export function Breathe({ children }: { readonly children: ReactNode }) {
  const reduced = useUiReducedMotion();
  const focused = useScreenFocused();
  const b = useSharedValue(0);
  useAmbientLoop(() => {
    b.value = 0;
    b.value = withRepeat(withTiming(1, { duration: AMBIENT.breathMs / 2, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, () => { cancelAnimation(b); b.value = withTiming(0, { duration: 300 }); }, focused && !reduced);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.03 * b.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
