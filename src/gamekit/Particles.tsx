/**
 * Particles.tsx: the legacy ParticleField API, now backed by the studio
 * FxStage (fx/FxStage.tsx).
 *
 * Why it changed: the old field mutated its pool on the JS thread while the
 * UI thread drew a separate copy, and its Skia buffers never re-ran (the pool
 * was mutated in place), so bursts often never reached the screen. It also
 * drew soft dots with a src-over colour blend (tinted squares). FxStage owns
 * the pool on the UI thread, emits via runOnUI, redraws on a frame tick, and
 * uses the outlined FX atlas with a modulate blend.
 *
 * Public API is unchanged:
 *   const ref = useRef<ParticleHandle>(null);
 *   <ParticleField ref={ref} width={W} height={H} />
 *   ref.current?.burst({ x, y, preset: 'confetti' });
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SkImage, SkRect } from '@shopify/react-native-skia';
import { FxStage, type FxStageHandle } from './fx/FxStage';
import { packHex, type EmitterName } from './core/particles';
import { MAX_PARTICLES } from './theme';

export type ParticlePreset = 'burst' | 'trail' | 'confetti' | 'coins';

export interface EmitOptions {
  x: number;
  y: number;
  preset?: ParticlePreset;
  /** How many particles to emit (clamped to free pool slots). */
  count?: number;
  /** Override tint(s). Hex strings; one is chosen at random per particle. */
  colors?: string[];
  /** Base speed multiplier. */
  speed?: number;
  /** Base particle size in px (half-size in the new system is size). */
  size?: number;
}

export interface ParticleHandle {
  burst: (opts: EmitOptions) => void;
  trail: (x: number, y: number, color?: string) => void;
  clear: () => void;
  /** Approximate live count (JS mirror, updated as bursts are requested). */
  aliveCount: () => number;
}

interface ParticleFieldProps {
  width: number;
  height: number;
  /** Custom FX sheet on the studio 128 px grid (see fx/FxAtlas.ts). */
  image?: SkImage | null;
  /** Ignored: sprite rects come from the atlas grid. Kept for compatibility. */
  sprites?: SkRect[];
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto';
}

const PRESET_EMITTER: Record<ParticlePreset, EmitterName> = {
  burst: 'stars',
  trail: 'trail',
  confetti: 'confetti',
  coins: 'coins',
};

export const ParticleField = forwardRef<ParticleHandle, ParticleFieldProps>(
  function ParticleField({ width, height, image, paused = false, style }, ref) {
    const stage = useRef<FxStageHandle>(null);
    const pausedSv = useSharedValue(paused);
    useEffect(() => {
      pausedSv.value = paused;
    }, [paused, pausedSv]);
    const estimate = useRef<{ n: number; at: number }>({ n: 0, at: 0 });

    useImperativeHandle(ref, (): ParticleHandle => ({
      burst: ({ x, y, preset = 'burst', count, colors, speed, size }) => {
        const emitter = PRESET_EMITTER[preset];
        const tint = colors && colors.length ? packHex(colors[Math.floor(Math.random() * colors.length)]) : undefined;
        stage.current?.burst(emitter, x, y, {
          count,
          speed,
          size: size ? size / 8 : undefined,
          color: preset === 'confetti' ? undefined : tint,
        });
        estimate.current = { n: estimate.current.n + (count ?? 16), at: Date.now() };
      },
      trail: (x, y, color) => {
        stage.current?.burst('trail', x, y, { color: color ? packHex(color) : undefined });
      },
      clear: () => {
        stage.current?.clear();
        estimate.current = { n: 0, at: Date.now() };
      },
      aliveCount: () => (Date.now() - estimate.current.at > 2500 ? 0 : estimate.current.n),
    }), []);

    return (
      <FxStage
        ref={stage}
        width={width}
        height={height}
        capacity={MAX_PARTICLES}
        atlasImage={image ?? null}
        paused={pausedSv}
        style={style}
      />
    );
  },
);
