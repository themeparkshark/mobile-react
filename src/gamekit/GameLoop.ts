/**
 * GameLoop.ts — fixed-timestep update loop on the UI thread.
 *
 * Built on Reanimated's useFrameCallback so the update function runs as a
 * worklet on the UI thread (no JS-thread animation loop — quality bar #1).
 *
 * Semantics:
 *   - The caller supplies an `update(dt)` worklet where `dt` is a FIXED step
 *     in seconds (default 1/60). This keeps physics deterministic regardless
 *     of frame rate, which also matters for server-authoritative replays.
 *   - Real elapsed time is accumulated and drained in fixed steps. Excess time
 *     beyond MAX_FRAME_MS is dropped to avoid the spiral of death after a
 *     stall (e.g. returning from background).
 *   - `timescale` (a SharedValue) scales elapsed time: 0.5 = slow-mo, 0 =
 *     frozen. Used for near-miss slow-mo and pause.
 *   - Pause/resume flip a SharedValue read inside the worklet, so toggling is
 *     free and never tears down the frame callback.
 *
 * The update worklet is also handed an optional `render(alpha)` worklet for
 * interpolation between fixed steps (alpha in [0,1)), useful for buttery
 * motion; games that don't need it can ignore it.
 */

import { useEffect, useMemo } from 'react';
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
  type FrameInfo,
} from 'react-native-reanimated';
import { FIXED_STEP_MS, MAX_FRAME_MS } from './theme';

export interface GameLoopOptions {
  /**
   * Fixed simulation step worklet. `dt` is in SECONDS and constant.
   * Mutate SharedValues / buffers here. MUST be a worklet ('worklet' directive
   * is added automatically if you pass a plain function that Reanimated can
   * autoworkletize, but marking it is safest).
   */
  update: (dt: number) => void;
  /**
   * Optional interpolation worklet run once per real frame after stepping.
   * `alpha` is the fractional progress toward the next fixed step [0,1).
   */
  render?: (alpha: number) => void;
  /** Fixed step in ms. Defaults to 1/60s. */
  stepMs?: number;
  /** Start running immediately. Defaults to true. */
  autostart?: boolean;
}

export interface GameLoopControls {
  /** true = paused (loop keeps ticking but simulation is frozen). */
  readonly paused: SharedValue<boolean>;
  /** Time multiplier. 1 = normal, 0.5 = slow-mo, 0 = frozen. */
  readonly timescale: SharedValue<number>;
  /** Monotonic count of fixed steps simulated (useful for seeding/telemetry). */
  readonly stepCount: SharedValue<number>;
  /** JS-thread setters — safe to call from event handlers. */
  pause: () => void;
  resume: () => void;
  setTimescale: (v: number) => void;
  /** Fully stop/start the underlying frame callback. */
  setActive: (active: boolean) => void;
}

/**
 * Drive a game with a fixed-timestep UI-thread loop.
 *
 * @example
 *   const posX = useSharedValue(0);
 *   const loop = useGameLoop({
 *     update: (dt) => { 'worklet'; posX.value += 60 * dt; },
 *   });
 *   // loop.pause(); loop.setTimescale(0.5);
 */
export function useGameLoop(options: GameLoopOptions): GameLoopControls {
  const { update, render, stepMs = FIXED_STEP_MS, autostart = true } = options;

  const paused = useSharedValue(false);
  const timescale = useSharedValue(1);
  const stepCount = useSharedValue(0);
  // Accumulator carried across frames (ms of unconsumed real time).
  const accumulator = useSharedValue(0);

  const stepSeconds = stepMs / 1000;

  const frame = useFrameCallback((info: FrameInfo) => {
    'worklet';
    // First frame after (re)activation has null delta — skip it.
    const rawDelta = info.timeSincePreviousFrame;
    if (rawDelta == null) return;

    if (paused.value) {
      // Frozen: don't accumulate, and reset backlog so we don't fast-forward
      // on resume.
      accumulator.value = 0;
      return;
    }

    // Clamp the frame delta and scale by timescale (slow-mo / speed-up).
    const clamped = rawDelta > MAX_FRAME_MS ? MAX_FRAME_MS : rawDelta;
    const scaled = clamped * timescale.value;
    accumulator.value += scaled;

    // Drain in fixed steps.
    let guard = 0;
    while (accumulator.value >= stepMs && guard < 8) {
      update(stepSeconds);
      accumulator.value -= stepMs;
      stepCount.value += 1;
      guard += 1;
    }
    // If we hit the guard, dump the rest to stay real-time.
    if (guard >= 8) accumulator.value = 0;

    if (render) {
      const alpha = stepMs > 0 ? accumulator.value / stepMs : 0;
      render(alpha);
    }
  }, autostart);

  // Keep the frame callback's active state in sync with `autostart` changes.
  useEffect(() => {
    frame.setActive(autostart);
  }, [autostart, frame]);

  return useMemo<GameLoopControls>(
    () => ({
      paused,
      timescale,
      stepCount,
      pause: () => {
        paused.value = true;
      },
      resume: () => {
        paused.value = false;
      },
      setTimescale: (v: number) => {
        timescale.value = v;
      },
      setActive: (active: boolean) => {
        frame.setActive(active);
      },
    }),
    [paused, timescale, stepCount, frame],
  );
}
