/**
 * useCamera: the studio camera rig as a hook.
 *
 * Wraps core/camera (trauma shake, punch zoom, kicks, lean, framing zoom) and
 * steps it every UI frame by fx time (so hit-stop holds the camera too).
 * Outputs a Skia transform (for a <Group>) and an RN animated style (for an
 * Animated.View around non-Skia boards). HUD never goes inside the camera.
 *
 * Walk-safe by default: pass walking to cut intensity to 0.3; reduced motion
 * turns camera motion off entirely.
 */

import { useEffect, useMemo } from 'react';
import type { Transforms3d } from '@shopify/react-native-skia';
import {
  runOnUI,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  addTrauma,
  createCamera,
  kick,
  lean,
  punchZoom,
  setBaseZoom,
  setCameraIntensity,
  stepCamera,
  type CameraConfig,
  type CameraState,
} from '../core/camera';

export interface CameraOptions {
  width: number;
  height: number;
  config?: Partial<CameraConfig>;
  /** fx time scale (0 during hit-stop). */
  timeScale?: SharedValue<number>;
  reducedMotion?: boolean;
  /** Player is walking in line: shakes x0.3 (design rule). */
  walking?: boolean;
}

export interface CameraRig {
  state: SharedValue<CameraState>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  rot: SharedValue<number>;
  zoom: SharedValue<number>;
  /** Skia <Group transform={cam.transform} origin={cam.origin}> */
  transform: SharedValue<Transforms3d>;
  origin: { x: number; y: number };
  /** RN style for Animated.View. */
  style: ReturnType<typeof useAnimatedStyle>;
  shake: (trauma: number, dirX?: number, dirY?: number, capMs?: number) => void;
  punch: (amount: number, inMs?: number) => void;
  kick: (dx: number, dy: number) => void;
  lean: (x: number, y: number) => void;
  frame: (zoom: number) => void;
}

export function useCamera({ width, height, config, timeScale, reducedMotion = false, walking = false }: CameraOptions): CameraRig {
  const state = useSharedValue<CameraState>(createCamera(config, 11));
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const rot = useSharedValue(0);
  const zoom = useSharedValue(1);

  useEffect(() => {
    const intensity = reducedMotion ? 0 : walking ? 0.3 : config?.intensity ?? 1;
    runOnUI((k: number) => {
      'worklet';
      setCameraIntensity(state.value, k);
    })(intensity);
  }, [reducedMotion, walking, config?.intensity, state]);

  useFrameCallback((info) => {
    'worklet';
    const raw = info.timeSincePreviousFrame;
    if (raw == null) return;
    const scale = timeScale ? timeScale.value : 1;
    const c = state.value;
    stepCamera(c, (raw > 50 ? 50 : raw) * scale);
    if (x.value !== c.x) x.value = c.x;
    if (y.value !== c.y) y.value = c.y;
    if (rot.value !== c.rot) rot.value = c.rot;
    if (zoom.value !== c.zoom) zoom.value = c.zoom;
  });

  const transform = useDerivedValue<Transforms3d>(() => [
    { translateX: x.value },
    { translateY: y.value },
    { rotate: rot.value },
    { scale: zoom.value },
  ]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rot.value}rad` },
      { scale: zoom.value },
    ],
  }));

  return useMemo<CameraRig>(() => ({
    state, x, y, rot, zoom, transform, style,
    origin: { x: width / 2, y: height / 2 },
    shake: (trauma, dirX = 0, dirY = 0, capMs = -1) => runOnUI((t: number, dx: number, dy: number, cap: number) => {
      'worklet';
      addTrauma(state.value, t, dx, dy, cap);
    })(trauma, dirX, dirY, capMs),
    punch: (amount, inMs = 90) => runOnUI((a: number, ms: number) => {
      'worklet';
      punchZoom(state.value, a, ms);
    })(amount, inMs),
    kick: (dx, dy) => runOnUI((a: number, b: number) => {
      'worklet';
      kick(state.value, a, b);
    })(dx, dy),
    lean: (lx, ly) => runOnUI((a: number, b: number) => {
      'worklet';
      lean(state.value, a, b);
    })(lx, ly),
    frame: (z) => runOnUI((v: number) => {
      'worklet';
      setBaseZoom(state.value, v);
    })(z),
  }), [state, x, y, rot, zoom, transform, style, width, height]);
}
