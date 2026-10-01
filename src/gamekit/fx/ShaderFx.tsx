/**
 * ShaderFx.tsx: RuntimeEffect building blocks for Skia scenes.
 *
 *   <ShockwaveGroup wave={wave}>...your Skia scene...</ShockwaveGroup>
 *      const wave = useShockwave(); wave.fire(x, y)  // ring distortion + rim light
 *   <DissolveImage image={img} rect={r} progress={sv} edgeColor="#ffcf3b" />
 *   <Sunburst cx cy radius intensity={sv} />           // rotating bright rays
 *   <Shimmer x y width height progress={sv} />          // foil / meter sweep
 *   <FlashGroup brightness={sv}>...</FlashGroup>        // ColorMatrix hit flash
 *   <WarmGroup amount={sv}>...</WarmGroup>              // fever warmth
 *
 * Every shader compiles once (fx/shaders.ts) and every uniform is a
 * SharedValue, so nothing re-renders React while effects animate.
 */

import React, { useMemo } from 'react';
import { PixelRatio } from 'react-native';
import {
  ColorMatrix,
  Group,
  ImageShader,
  Paint,
  Rect,
  RuntimeShader,
  Shader,
  type SkImage,
} from '@shopify/react-native-skia';
import {
  Easing,
  runOnUI,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Shaders, brightnessMatrix, desaturateMatrix, rgba, warmMatrix } from './shaders';

// =============================================================================
// Shockwave (image-filter distortion of everything inside the group)
// =============================================================================

export interface ShockwaveHandle {
  /** 0..1 progress of the current wave (1 = idle). */
  progress: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  maxRadius: SharedValue<number>;
  strength: SharedValue<number>;
  fire: (x: number, y: number, opts?: { radius?: number; strength?: number; ms?: number }) => void;
}

export function useShockwave(): ShockwaveHandle {
  const progress = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const maxRadius = useSharedValue(180);
  const strength = useSharedValue(8);
  return useMemo(() => ({
    progress, x, y, maxRadius, strength,
    fire: (fx, fy, opts = {}) => {
      x.value = fx;
      y.value = fy;
      maxRadius.value = opts.radius ?? 180;
      strength.value = opts.strength ?? 8;
      progress.value = 0;
      progress.value = withTiming(1, { duration: opts.ms ?? 420, easing: Easing.out(Easing.cubic) });
    },
  }), [progress, x, y, maxRadius, strength]);
}

export function ShockwaveGroup({ wave, children, enabled = true }: { wave: ShockwaveHandle; children: React.ReactNode; enabled?: boolean }) {
  const effect = useMemo(() => Shaders.shockwave(), []);
  const pd = PixelRatio.get();
  const uniforms = useDerivedValue(() => {
    const p = wave.progress.value;
    const live = p < 1 ? 1 : 0;
    return {
      center: [wave.x.value * pd, wave.y.value * pd],
      radius: wave.maxRadius.value * p * pd,
      thickness: 26 * pd,
      strength: wave.strength.value * (1 - p) * live * pd,
      light: 0.22 * (1 - p) * live,
    };
  });
  // Stable layer/transform objects: React re-renders must never rebuild Skia
  // nodes while the UI thread is drawing them.
  const layer = useMemo(() => (effect ? <Paint><RuntimeShader source={effect} uniforms={uniforms} /></Paint> : null), [effect, uniforms]);
  const outer = useMemo(() => [{ scale: 1 / pd }], [pd]);
  const inner = useMemo(() => [{ scale: pd }], [pd]);
  if (!effect || !enabled || !layer) return <>{children}</>;
  return (
    <Group transform={outer} layer={layer}>
      <Group transform={inner}>{children}</Group>
    </Group>
  );
}

// =============================================================================
// Dissolve (noise dissolve with a bright edge: ghost reveals, defeats, KO)
// =============================================================================

export const DissolveImage = React.memo(function DissolveImage({ image, x, y, width, height, progress, edgeColor = '#ffcf3b', edge = 0.08, grain = 18 }: {
  image: SkImage | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0 = whole, 1 = gone. */
  progress: SharedValue<number>;
  edgeColor?: string;
  edge?: number;
  grain?: number;
}) {
  const effect = useMemo(() => Shaders.dissolve(), []);
  const color = useMemo(() => rgba(edgeColor), [edgeColor]);
  const uniforms = useDerivedValue(() => ({ progress: progress.value, edge, edgeColor: color, scale: grain, seed: 3.1 }));
  const box = useMemo(() => ({ x, y, width, height }), [x, y, width, height]);
  if (!image || !effect) return null;
  return (
    <Rect x={x} y={y} width={width} height={height}>
      <Shader source={effect} uniforms={uniforms}>
        <ImageShader image={image} fit="contain" rect={box} />
      </Shader>
    </Rect>
  );
});

// =============================================================================
// Sunburst rays (bright, never dark)
// =============================================================================

export const Sunburst = React.memo(function Sunburst({ cx, cy, radius, intensity, rays = 12, colorA = '#ffcf3b', colorB = '#fff8e4', speed = 0.1, width, height }: {
  cx: number;
  cy: number;
  radius: number;
  intensity: SharedValue<number>;
  rays?: number;
  colorA?: string;
  colorB?: string;
  /** Rotation in radians per second (12 rays at 6 deg/s = 0.105). */
  speed?: number;
  width: number;
  height: number;
}) {
  const effect = useMemo(() => Shaders.sunburst(), []);
  const time = useSharedValue(0);
  const a = useMemo(() => rgba(colorA, 0.55), [colorA]);
  const b = useMemo(() => rgba(colorB, 0.0), [colorB]);
  useFrameCallback((info) => {
    'worklet';
    if (info.timeSincePreviousFrame == null || intensity.value <= 0) return;
    time.value = time.value + (info.timeSincePreviousFrame / 1000) * speed;
  });
  const uniforms = useDerivedValue(() => ({
    center: [cx, cy], time: time.value, rays, colorA: a, colorB: b, intensity: intensity.value, radius,
  }));
  if (!effect) return null;
  return (
    <Rect x={0} y={0} width={width} height={height}>
      <Shader source={effect} uniforms={uniforms} />
    </Rect>
  );
});

// =============================================================================
// Shimmer sweep (meters, foil, fever bar)
// =============================================================================

export const Shimmer = React.memo(function Shimmer({ x, y, width, height, progress, color = '#ffffff', alpha = 0.55, band = 0.18 }: {
  x: number;
  y: number;
  width: number;
  height: number;
  progress: SharedValue<number>;
  color?: string;
  alpha?: number;
  band?: number;
}) {
  const effect = useMemo(() => Shaders.shimmer(), []);
  const c = useMemo(() => rgba(color, alpha), [color, alpha]);
  const uniforms = useDerivedValue(() => ({ size: [width, height], progress: progress.value, width: band, color: c }));
  const move = useMemo(() => [{ translateX: x }, { translateY: y }], [x, y]);
  if (!effect) return null;
  return (
    <Group transform={move}>
      <Rect x={0} y={0} width={width} height={height}>
        <Shader source={effect} uniforms={uniforms} />
      </Rect>
    </Group>
  );
});

/** Looping 0..1 progress for Shimmer (period ms), paused when `active` is false. */
export function useLoopProgress(periodMs: number, active: SharedValue<boolean> | boolean = true): SharedValue<number> {
  const p = useSharedValue(0);
  const isShared = typeof active !== 'boolean';
  useFrameCallback((info) => {
    'worklet';
    const on = isShared ? (active as SharedValue<boolean>).value : (active as boolean);
    if (!on || info.timeSincePreviousFrame == null) return;
    p.value = (p.value + info.timeSincePreviousFrame / periodMs) % 1;
  });
  return p;
}

// =============================================================================
// Colour-matrix groups
// =============================================================================

/** Hit flash: brightness 1 = normal, 1.6 = white-hot frame. */
export function FlashGroup({ brightness, children }: { brightness: SharedValue<number>; children: React.ReactNode }) {
  const matrix = useDerivedValue(() => brightnessMatrix(brightness.value));
  const layer = useMemo(() => <Paint><ColorMatrix matrix={matrix} /></Paint>, [matrix]);
  return <Group layer={layer}>{children}</Group>;
}

/** Fever warmth (0..1): +R, +G and a brightness lift. */
export function WarmGroup({ amount, children }: { amount: SharedValue<number>; children: React.ReactNode }) {
  const matrix = useDerivedValue(() => warmMatrix(amount.value));
  const layer = useMemo(() => <Paint><ColorMatrix matrix={matrix} /></Paint>, [matrix]);
  return <Group layer={layer}>{children}</Group>;
}

/** Desaturate (0..1): wipeout / failed run, never darkened. */
export function DesaturateGroup({ amount, children }: { amount: SharedValue<number>; children: React.ReactNode }) {
  const matrix = useDerivedValue(() => desaturateMatrix(amount.value));
  const layer = useMemo(() => <Paint><ColorMatrix matrix={matrix} /></Paint>, [matrix]);
  return <Group layer={layer}>{children}</Group>;
}

/** Imperative hit-flash value: flash(1.6, 33) then back to 1. */
export function useHitFlash(): { value: SharedValue<number>; flash: (peak?: number, holdMs?: number) => void } {
  const value = useSharedValue(1);
  return useMemo(() => ({
    value,
    flash: (peak = 1.6, holdMs = 33) => runOnUI((pk: number, h: number) => {
      'worklet';
      value.value = pk;
      value.value = withTiming(1, { duration: h + 60, easing: Easing.in(Easing.quad) });
    })(peak, holdMs),
  }), [value]);
}
