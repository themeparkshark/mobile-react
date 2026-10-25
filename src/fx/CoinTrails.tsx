/**
 * A big gain's gold trails (src/ui/CoinFlight.tsx): a few shrinking dots behind each coin, along its own path a
 * moment earlier. One Skia canvas for the whole flight, drawn on the UI thread from the flight's clock (no extra
 * views per dot), mounted only while a big flight runs.
 */
import { Dimensions } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { Canvas, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { COIN_FLIGHT, IN_OUT, PRIZE_FLIGHT, PRIZE_OUT, coinAt, prizeAt, type Point } from '../ui/CoinFlight';
import { GOLD_FX } from '../ui/motionEasing';

export default function CoinTrails({ clock, count, from, to, prize = false }: {
  readonly clock: SharedValue<number>; readonly count: number; readonly from: Point; readonly to: Point;
  /** A prize's trail follows its own quick, low path. */
  readonly prize?: boolean;
}) {
  const { width, height } = Dimensions.get('window');
  const B = COIN_FLIGHT.big;
  const dots = useDerivedValue<SkPath>(() => {
    const path = Skia.Path.Make();
    for (let i = 0; i < count; i++) {
      const raw = (clock.value - i * COIN_FLIGHT.staggerMs) / COIN_FLIGHT.flyMs;
      if (raw <= 0.04 || raw >= 0.97) continue;
      for (let k = 1; k <= B.trailDots; k++) {
        const back = raw - k * B.trailStep;
        if (back <= 0) break;
        const at = prize ? coinAt(PRIZE_OUT(back), i, count, from, to, true, COIN_FLIGHT.prizeArcPt)
          : coinAt(IN_OUT(back), i, count, from, to, true);
        path.addCircle(at.x, at.y, B.trailPt * (1 - (k - 1) / (B.trailDots + 1)));
      }
    }
    return path;
  });
  return (
    <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <Path path={dots} color={GOLD_FX.glow} opacity={0.75} />
    </Canvas>
  );
}

/**
 * A reward dialog's prize on its way to the shelf (src/ui/GameDialog.tsx): shrinking gold dots along its own path a
 * moment earlier, drawn from the flight's progress and its measured ends (shared values; one Skia path, UI thread).
 */
export function PrizeTrail({ progress, from, to }: {
  readonly progress: SharedValue<number>; readonly from: SharedValue<Point>; readonly to: SharedValue<Point>;
}) {
  const { width, height } = Dimensions.get('window');
  const dots = useDerivedValue<SkPath>(() => {
    const path = Skia.Path.Make();
    const raw = progress.value;
    if (raw <= 0.02 || raw >= 0.98) return path;
    for (let k = 1; k <= PRIZE_FLIGHT.trailDots; k++) {
      const back = raw - k * PRIZE_FLIGHT.trailStep;
      if (back <= 0) break;
      const at = prizeAt(back, from.value, to.value);
      path.addCircle(at.x, at.y, PRIZE_FLIGHT.trailPt * (1 - (k - 1) / (PRIZE_FLIGHT.trailDots + 1)));
    }
    return path;
  });
  return (
    <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <Path path={dots} color={GOLD_FX.glow} opacity={0.85} />
    </Canvas>
  );
}
