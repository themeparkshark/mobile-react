/**
 * Flight: a copy of Alex's art flying from where a prize sits to the chip it fills (DIRECTION.md
 * motion: "Prizes fly to the header chips, which bounce"). It rides Screen's `fx` layer, above
 * every bar, and never takes a touch. One shared value 0 to 1 on the UI thread, eased in and out
 * (never linear): the art rises on a small arc, turns a little and shrinks to the chip's art size,
 * then calls `onLand` (the caller bumps the chip's value, so the chip bounces).
 *
 * Reduce Motion: nothing flies. Flight reads it itself and lands at once (the chip fades to its new
 * count). `onLand` is kept in a ref, so a parent passing a fresh closure never restarts a flight
 * in the air. Positions are window points measured once by the caller before the flight starts.
 */
import { memo, useEffect, useRef } from 'react';
import type { ImageSourcePropType } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { DURATION } from '../motion';
import useUiReducedMotion from '../useUiReducedMotion';
import Lift from './Lift';

export type FlightPoint = { readonly x: number; readonly y: number; readonly size: number };

/** How high the arc lifts over the straight line, as a share of the distance (pure, tested). */
export function flightArc(dx: number, dy: number): number {
  return Math.min(90, Math.max(30, Math.hypot(dx, dy) * 0.22));
}

function FlightImpl({ source, ratio = 1, from, to, delay = 0, onLand }: {
  readonly source: ImageSourcePropType;
  readonly ratio?: number;
  /** Centres and art heights, in the fx layer's points. */
  readonly from: FlightPoint;
  readonly to: FlightPoint;
  readonly delay?: number;
  readonly onLand?: () => void;
}) {
  const t = useSharedValue(0);
  const reduced = useUiReducedMotion();
  const landRef = useRef(onLand);
  landRef.current = onLand;
  const arc = flightArc(to.x - from.x, to.y - from.y);
  useEffect(() => {
    const land = () => landRef.current?.();
    if (reduced) {
      // Nothing flies: it lands at its time, the chip takes its count with a fade.
      const timer = setTimeout(land, delay);
      return () => clearTimeout(timer);
    }
    t.value = withDelay(delay, withTiming(1, { duration: DURATION.bloom + 60, easing: Easing.inOut(Easing.cubic) }, done => {
      if (done) runOnJS(land)();
    }));
    return undefined;
  }, [delay, reduced, t]);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: p <= 0 || p >= 1 ? 0 : 1,
      transform: [
        { translateX: from.x + (to.x - from.x) * p },
        { translateY: from.y + (to.y - from.y) * p - arc * Math.sin(Math.PI * p) },
        { rotate: `${-12 * Math.sin(Math.PI * p)}deg` },
        { scale: 1 + ((to.size / from.size) - 1) * p + 0.18 * Math.sin(Math.PI * p) },
      ],
    };
  });
  const h = from.size;
  const w = Math.round(h * ratio);
  return (
    <Animated.View style={[{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h }, style]} pointerEvents="none">
      <Lift source={source} width={w} height={h} />
    </Animated.View>
  );
}

const Flight = memo(FlightImpl);
export default Flight;
