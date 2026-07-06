/**
 * types.ts — shared data model for the Banana Basket engine.
 *
 * The item pool is a flat array of mutable structs (like GameKit's Particles)
 * so the UI-thread simulation mutates in place with zero per-frame allocation.
 */

import type { ItemKind } from './constants';

export interface FallingItem {
  alive: boolean;
  kind: ItemKind;
  x: number;
  y: number;
  vy: number;
  /** Gentle horizontal drift for readability. */
  vx: number;
  /** Rotation + spin (churros/bombs tumble a little). */
  rot: number;
  vrot: number;
  /** Spawn wobble phase. */
  phase: number;
  /** Marked true once resolved (caught/missed) so it can't double-fire. */
  resolved: boolean;
}

/**
 * Discrete gameplay events the worklet emits into a ring buffer for the JS
 * thread to drain (score, combo, haptics, particles). Numeric codes keep the
 * buffer a flat Float array — worklet-friendly and allocation-free.
 */
export const EVENT = {
  NONE: 0,
  CATCH_BANANA: 1,
  CATCH_CHURRO: 2,
  CATCH_BOMB: 3,
  MISS_BANANA: 4,
  MISS_CHURRO: 5,
  NEAR_MISS: 6,
  GAME_OVER: 7,
} as const;

export type EventCode = (typeof EVENT)[keyof typeof EVENT];

/** Ring-buffer slots. Each event is (code, x, y). Sized well above 1 frame. */
export const EVENT_SLOTS = 32;
export const EVENT_STRIDE = 3; // [code, x, y]
