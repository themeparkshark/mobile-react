/**
 * The sky over the map, drawn in one Skia canvas on the UI thread: soft cloud
 * shadows drifting across the park and a small flock of gulls passing over
 * now and then (each with its own shadow far below). Everything derives from
 * the map's ambient clock, so it all freezes together when the map pauses.
 * Pure decoration: the canvas never takes touches.
 */
import { Canvas, Circle, Group, Oval, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { hash01 } from './ambientBudget';
import { useMapAlive } from './MapAliveContext';

/* ── Cloud shadows ─────────────────────────────────────────────────────── */

// A cloud is a few overlapping soft puffs; offsets are in cloud-local px.
const PUFFS: readonly [number, number, number][] = [[0, 0, 92], [70, 14, 70], [-68, 16, 64], [24, -30, 58]];
const SHADOW_INK = 'rgba(18,52,96,0.11)';
const SHADOW_CLEAR = 'rgba(18,52,96,0)';

function Cloud({ clock, i, width, height, strength }: {
  clock: SharedValue<number>; i: number; width: number; height: number; strength: number;
}) {
  const scale = 0.85 + hash01(i * 7 + 1) * 0.5;
  const speed = 6 + hash01(i * 7 + 2) * 5; // px per second: slow, like real cloud shadows
  const reach = 180 * scale;
  const span = width + reach * 2;
  const offset = hash01(i * 7 + 3) * span;
  const y0 = height * (0.12 + ((i * 0.37 + hash01(i * 7 + 4) * 0.2) % 0.8));
  const transform = useDerivedValue(() => {
    const x = ((clock.value * speed + offset) % span) - reach;
    return [{ translateX: x }, { translateY: y0 + (x / span) * 40 }, { scale }];
  });
  return (
    <Group transform={transform} opacity={strength}>
      {PUFFS.map(([x, y, r]) => (
        <Circle key={`${x}:${y}`} cx={x} cy={y} r={r}>
          <RadialGradient c={vec(x, y)} r={r} colors={[SHADOW_INK, SHADOW_CLEAR]} />
        </Circle>
      ))}
    </Group>
  );
}

/* ── Gulls ─────────────────────────────────────────────────────────────── */

// A hand-drawn gull: white wings with the game's navy ink outline.
const GULL = Skia.Path.MakeFromSVGString('M-11 -1 C-8 -7 -4 -6 0 0 C4 -6 8 -7 11 -1 C8 -3.5 4 -2.5 0 2.2 C-4 -2.5 -8 -3.5 -11 -1 Z')!;
const FLOCK_PERIOD = 36; // seconds between passes
const CROSSING = 11; // seconds to cross the screen

function Gull({ clock, j, width, height, strength }: {
  clock: SharedValue<number>; j: number; width: number; height: number; strength: number;
}) {
  // Where this pass flies: the same for every gull in the flock, new each pass.
  const pose = useDerivedValue(() => {
    const t = clock.value + 9;
    const pass = Math.floor(t / FLOCK_PERIOD);
    const p = (t - pass * FLOCK_PERIOD) / CROSSING;
    if (p >= 1) return { x: -100, y: -100, dir: 1, visible: 0, flap: 1 };
    const dir = hash01(pass * 3.1) > 0.5 ? 1 : -1;
    const ya = height * (0.14 + hash01(pass * 5.7) * 0.45);
    const yb = ya + (hash01(pass * 2.3) - 0.5) * height * 0.35;
    const x = dir > 0 ? -40 + p * (width + 80) : width + 40 - p * (width + 80);
    // V formation: followers trail behind and to the side.
    const row = Math.ceil(j / 2);
    const side = j % 2 ? 1 : -1;
    const glide = Math.sin(p * Math.PI * 2 + j) * 3;
    return {
      x: x - dir * row * 17,
      y: ya + (yb - ya) * p + side * row * 11 + glide,
      dir,
      visible: Math.min(1, p * 8, (1 - p) * 8),
      flap: Math.sin(clock.value * Math.PI * 2 * 2.4 + j * 1.7),
    };
  });
  const bird = useDerivedValue(() => {
    const s = 0.9;
    return [{ translateX: pose.value.x }, { translateY: pose.value.y }, { scaleX: s * pose.value.dir },
      { scaleY: s * (0.55 + 0.45 * pose.value.flap) }];
  });
  // The shadow lands far below and to the side: they really are up high.
  const shadow = useDerivedValue(() => [{ translateX: pose.value.x + 16 }, { translateY: pose.value.y + 46 }]);
  const opacity = useDerivedValue(() => pose.value.visible * strength);
  return (
    <Group opacity={opacity}>
      <Group transform={shadow}>
        <Oval x={-6} y={-2} width={12} height={4} color="rgba(5,52,110,0.16)" />
      </Group>
      <Group transform={bird}>
        <Path path={GULL} color="#ffffff" />
        <Path path={GULL} color="#05346e" style="stroke" strokeWidth={1.5} strokeJoin="round" />
      </Group>
    </Group>
  );
}

/* ── The canvas ────────────────────────────────────────────────────────── */

export const MapSkyOverlay = memo(function MapSkyOverlay({ width, height }: { readonly width: number; readonly height: number }) {
  const { clock, caps, light, running } = useMapAlive();
  const clouds = light.clouds > 0.02 ? caps.clouds : 0;
  const birds = light.birds > 0.02 ? caps.birds : 0;
  if (!running || width <= 0 || height <= 0 || (!clouds && !birds)) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: clouds }, (_, i) => (
        <Cloud key={`c${i}`} clock={clock} i={i} width={width} height={height} strength={light.clouds} />
      ))}
      {Array.from({ length: birds }, (_, j) => (
        <Gull key={`g${j}`} clock={clock} j={j} width={width} height={height} strength={light.birds} />
      ))}
    </Canvas>
  );
});
