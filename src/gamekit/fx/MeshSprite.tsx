/**
 * MeshSprite.tsx: one drawn frame (Alex's art) warped by a core/mesh grid in a
 * single Skia <Vertices> draw. Use inside your game's <Canvas>.
 *
 *   const grid = useMemo(() => createMeshGrid(12, 4, 220, 120), []);
 *   const pts = useMeshPoints(grid, fxMs, (out, t) => {
 *     'worklet';
 *     deformTailWave(grid, out, t, { fromU: 0.6, axis: 'x', tailAtEnd: false, wavelengths: 0.8, ...SHARKY_TAIL.holding });
 *   });
 *   <MeshSprite image={sharkFrame} grid={grid} points={pts} x={sx} y={sy} />
 *
 * The frame is stretched over the grid's w x h, so any image size works. The
 * warp only moves vertices; the drawing's line, colour and pose stay Alex's.
 * Reduced motion: pass `still` and the rest grid is drawn.
 */

import React, { useMemo } from 'react';
import { Group, ImageShader, Vertices, vec, type SkImage, type SkPoint } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { meshReset, type MeshGrid } from '../core/mesh';

/** Interleaved positions -> SkPoint[] (worklet). */
export function toPoints(xy: number[], count: number): SkPoint[] {
  'worklet';
  const pts: SkPoint[] = [];
  for (let i = 0; i < count; i++) pts.push(vec(xy[i * 2], xy[i * 2 + 1]));
  return pts;
}

/**
 * Derived mesh points: each frame resets to the rest grid, runs your deform
 * worklet on the fx clock (hit-stop freezes the warp), and converts to points.
 */
export function useMeshPoints(
  grid: MeshGrid,
  fxMs: SharedValue<number>,
  deform: (out: number[], tMs: number) => void,
  still = false,
): SharedValue<SkPoint[]> {
  const n = grid.cols * grid.rows;
  return useDerivedValue(() => {
    const out: number[] = [];
    for (let i = 0; i < grid.base.length; i++) out.push(0);
    meshReset(grid, out);
    if (!still) deform(out, fxMs.value);
    return toPoints(out, n);
  });
}

export interface MeshSpriteProps {
  image: SkImage | null;
  grid: MeshGrid;
  /** Warped points (useMeshPoints); omit to draw the rest grid. */
  points?: SharedValue<SkPoint[]>;
  x?: number | SharedValue<number>;
  y?: number | SharedValue<number>;
  opacity?: number | SharedValue<number>;
}

export const MeshSprite = React.memo(function MeshSprite({ image, grid, points, x = 0, y = 0, opacity = 1 }: MeshSpriteProps) {
  const tex = useMemo(() => toPoints(grid.tex, grid.cols * grid.rows), [grid]);
  const rest = useMemo(() => toPoints(grid.base, grid.cols * grid.rows), [grid]);
  const rect = useMemo(() => ({ x: 0, y: 0, width: grid.w, height: grid.h }), [grid]);
  const transform = useDerivedValue(() => [
    { translateX: typeof x === 'number' ? x : x.value },
    { translateY: typeof y === 'number' ? y : y.value },
  ]);
  if (!image) return null;
  return (
    <Group transform={transform} opacity={opacity}>
      <Vertices vertices={points ?? rest} textures={tex} indices={grid.indices} mode="triangles">
        <ImageShader image={image} rect={rect} fit="fill" />
      </Vertices>
    </Group>
  );
});
