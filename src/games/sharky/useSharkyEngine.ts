/**
 * useSharkyEngine.ts — the Sharky Swim simulation.
 *
 * Design (mirrors gamekit/Particles pooling philosophy):
 *   - Every piece of per-frame mutable state lives in Reanimated SharedValues so
 *     the whole simulation runs inside ONE fixed-timestep worklet (useGameLoop).
 *     No JS-thread animation loop, no per-frame allocation → 60fps bar.
 *   - Obstacles and rings are fixed-size POOLS of plain structs mutated in place
 *     on the UI thread; the renderer reads them via useDerivedValue.
 *   - Deterministic: physics uses a fixed dt and a seeded PRNG, so {score,seed}
 *     is replayable server-side (reward integrity, quality bar #6).
 *
 * Coyote time (spec: 120ms forgiveness): a crash is NOT registered the instant
 * the shark overlaps an obstacle. Instead an overlap starts a grace countdown
 * (COYOTE_MS). A swim tap that pulls the shark clear before the countdown
 * expires cancels the crash. Only if the shark is still overlapping when the
 * grace runs out does the run end. This makes tight gaps feel fair.
 *
 * Parallax: three ocean layers scroll at fractions of the world speed
 * (PARALLAX.back/mid/front). We keep a single `scrollX` accumulator and derive
 * each layer's phase from it, wrapping by the layer's tile width so it loops
 * seamlessly. The world speed itself ramps with time-survived (difficulty).
 */

import { useCallback, useMemo, useRef } from 'react';
import {
  useSharedValue,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { useGameLoop, type GameLoopControls } from '../../gamekit';
import {
  DIFFICULTY,
  OBSTACLE,
  PARALLAX,
  POOL,
  RING,
  SCORING,
  SHARK,
  COYOTE_MS,
  type Difficulty,
} from './constants';

// =============================================================================
// Pool structs (plain, mutable, worklet-friendly)
// =============================================================================

export interface Obstacle {
  active: boolean;
  /** World x of the pillar's left edge (px). */
  x: number;
  /** Vertical center of the gap (px). */
  gapY: number;
  /** Gap half-height (px). */
  gapHalf: number;
  /** Whether the shark has already scored this gap. */
  scored: boolean;
}

export interface Ring {
  active: boolean;
  x: number;
  y: number;
  /** Collected this pass? (kept until it scrolls off, then recycled). */
  taken: boolean;
}

function makeObstacle(): Obstacle {
  'worklet';
  return { active: false, x: 0, gapY: 0, gapHalf: 0, scored: false };
}
function makeRing(): Ring {
  'worklet';
  return { active: false, x: 0, y: 0, taken: false };
}

// =============================================================================
// Seeded PRNG (mulberry32) — deterministic, worklet-safe (no closures over Math)
// =============================================================================

/** Returns [0,1). Advances `state` via the returned tuple pattern is awkward in
 *  a worklet, so we thread the state through a SharedValue instead (see below).
 */
function nextRandom(seedState: SharedValue<number>): number {
  'worklet';
  let t = (seedState.value += 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// =============================================================================
// Engine surface exposed to the component
// =============================================================================

export interface SharkyEngine {
  loop: GameLoopControls;
  /** Shark vertical position (px, canvas space). */
  sharkY: SharedValue<number>;
  /** Shark vertical velocity (px/s). Drives sprite tilt. */
  sharkVY: SharedValue<number>;
  /** Current swim flipbook frame index 0..2. */
  sharkFrame: SharedValue<number>;
  /** Monotonic world scroll accumulator (px). Renderer derives parallax phase. */
  scrollX: SharedValue<number>;
  /** Live world speed (px/s) — for trail intensity. */
  worldSpeed: SharedValue<number>;
  /** Obstacle + ring pools (read by the renderer). */
  obstacles: SharedValue<Obstacle[]>;
  rings: SharedValue<Ring[]>;
  /** 1 while crash-grace is counting down (for a near-miss visual). */
  inGrace: SharedValue<number>;
  /** Start / reset a fresh run with the given seed. */
  start: (seed: number) => void;
  /** Apply a swim impulse (coyote-forgiving). Call from the tap handler. */
  swim: () => void;
}

interface EngineCallbacks {
  /** Fired when a gap is cleared (base points already known to caller). */
  onGapCleared: (points: number) => void;
  /** Fired when a ring is collected. */
  onRingCollected: (points: number) => void;
  /** Fired once when the run ends (crash or fall-out-of-bounds). */
  onCrash: () => void;
}

interface EngineOptions extends EngineCallbacks {
  difficulty: Difficulty;
  /** Canvas dimensions in px (logical). */
  width: number;
  height: number;
}

// =============================================================================
// Hook
// =============================================================================

export function useSharkyEngine(opts: EngineOptions): SharkyEngine {
  const { difficulty, width, height, onGapCleared, onRingCollected, onCrash } = opts;

  // Keep the latest callbacks addressable from the worklet without re-creating
  // the loop when they change identity between renders.
  const cbRef = useRef<EngineCallbacks>({ onGapCleared, onRingCollected, onCrash });
  cbRef.current = { onGapCleared, onRingCollected, onCrash };
  const emitGap = useCallback((p: number) => cbRef.current.onGapCleared(p), []);
  const emitRing = useCallback((p: number) => cbRef.current.onRingCollected(p), []);
  const emitCrash = useCallback(() => cbRef.current.onCrash(), []);

  const cfg = DIFFICULTY[difficulty];
  const sharkX = width * SHARK.xFrac;

  // --- Simulation state -----------------------------------------------------
  const sharkY = useSharedValue(height * 0.4);
  const sharkVY = useSharedValue(0);
  const sharkFrame = useSharedValue(0);
  const frameClock = useSharedValue(0);
  const scrollX = useSharedValue(0);
  const worldSpeed = useSharedValue(cfg.baseSpeed);
  const elapsed = useSharedValue(0);
  const spawnCarry = useSharedValue(0); // px since last obstacle spawn
  const inGrace = useSharedValue(0);
  const graceLeft = useSharedValue(0); // ms of coyote grace remaining
  const dead = useSharedValue(0);
  const seedState = useSharedValue(1);

  const obstacles = useSharedValue<Obstacle[]>(
    Array.from({ length: POOL.obstacles }, makeObstacle),
  );
  const rings = useSharedValue<Ring[]>(
    Array.from({ length: POOL.rings }, makeRing),
  );

  // --- Spawn one obstacle pair (+ maybe a ring) at world x = spawnX ----------
  const spawnObstacle = useCallback(
    (spawnX: number) => {
      'worklet';
      const list = obstacles.value;
      let slot = -1;
      for (let i = 0; i < list.length; i++) {
        if (!list[i].active) {
          slot = i;
          break;
        }
      }
      if (slot < 0) return;
      const gapHalf = (height * cfg.gapFrac) / 2;
      const minY = OBSTACLE.edgePad + gapHalf;
      const maxY = height - OBSTACLE.edgePad - gapHalf;
      const gapY = minY + nextRandom(seedState) * Math.max(1, maxY - minY);
      const ob = list[slot];
      ob.active = true;
      ob.x = spawnX;
      ob.gapY = gapY;
      ob.gapHalf = gapHalf;
      ob.scored = false;

      // Maybe drop a collectible ring in the center of the gap.
      if (nextRandom(seedState) < RING.spawnChance) {
        const rlist = rings.value;
        for (let i = 0; i < rlist.length; i++) {
          if (!rlist[i].active) {
            rlist[i].active = true;
            rlist[i].taken = false;
            rlist[i].x = spawnX + OBSTACLE.width / 2;
            rlist[i].y = gapY;
            break;
          }
        }
      }
    },
    [obstacles, rings, height, cfg.gapFrac, seedState],
  );

  // --- Fixed-timestep update (UI thread worklet) ----------------------------
  const update = useCallback(
    (dt: number) => {
      'worklet';
      if (dead.value === 1) return;

      elapsed.value += dt;

      // Speed ramps with time survived, clamped.
      const speed = Math.min(cfg.maxSpeed, cfg.baseSpeed + cfg.speedRamp * elapsed.value);
      worldSpeed.value = speed;
      const dx = speed * dt;
      scrollX.value += dx;
      spawnCarry.value += dx;

      // Spawn cadence by horizontal spacing.
      if (spawnCarry.value >= cfg.spacing) {
        spawnCarry.value -= cfg.spacing;
        spawnObstacle(width + OBSTACLE.width);
      }
      // Seed the very first pair so the field is never empty at t=0.
      if (elapsed.value < dt * 1.5) {
        spawnObstacle(width + OBSTACLE.width);
      }

      // Shark physics.
      let vy = sharkVY.value + SHARK.gravity * dt;
      if (vy > SHARK.maxFall) vy = SHARK.maxFall;
      if (vy < SHARK.maxRise) vy = SHARK.maxRise;
      sharkVY.value = vy;
      sharkY.value += vy * dt;

      // Swim flipbook — advance faster when swimming up.
      frameClock.value += dt * SHARK.frameFps;
      sharkFrame.value = Math.floor(frameClock.value) % 3;

      // Ceiling clamp (soft); floor / ceiling exit = crash.
      if (sharkY.value < SHARK.halfH) {
        sharkY.value = SHARK.halfH;
        if (sharkVY.value < 0) sharkVY.value = 0;
      }
      if (sharkY.value > height - SHARK.halfH) {
        // Hit the sea floor — no coyote for the floor, immediate end.
        sharkY.value = height - SHARK.halfH;
        dead.value = 1;
        runOnJS(emitCrash)();
        return;
      }

      // Move obstacles, score gaps, run collision.
      const list = obstacles.value;
      let overlapping = false;
      for (let i = 0; i < list.length; i++) {
        const ob = list[i];
        if (!ob.active) continue;
        ob.x -= dx;
        // Recycle once fully off the left edge.
        if (ob.x + OBSTACLE.width < -OBSTACLE.width) {
          ob.active = false;
          continue;
        }
        // Score when the shark's x passes the pillar center.
        const center = ob.x + OBSTACLE.width / 2;
        if (!ob.scored && center < sharkX) {
          ob.scored = true;
          runOnJS(emitGap)(SCORING.gapPoints);
        }
        // Collision: horizontal overlap with the pillar, vertically OUTSIDE gap.
        const hOverlap =
          sharkX + SHARK.halfW > ob.x && sharkX - SHARK.halfW < ob.x + OBSTACLE.width;
        if (hOverlap) {
          const topEdge = ob.gapY - ob.gapHalf;
          const botEdge = ob.gapY + ob.gapHalf;
          if (sharkY.value - SHARK.halfH < topEdge || sharkY.value + SHARK.halfH > botEdge) {
            overlapping = true;
          }
        }
      }

      // Coyote-time crash resolution.
      if (overlapping) {
        if (graceLeft.value <= 0 && inGrace.value === 0) {
          // Start the grace window.
          graceLeft.value = COYOTE_MS;
          inGrace.value = 1;
        } else {
          graceLeft.value -= dt * 1000;
          if (graceLeft.value <= 0) {
            // Still overlapping after forgiveness → real crash.
            dead.value = 1;
            inGrace.value = 0;
            runOnJS(emitCrash)();
            return;
          }
        }
      } else {
        // Cleared the danger in time — cancel the crash.
        graceLeft.value = 0;
        inGrace.value = 0;
      }

      // Rings: scroll, collect on overlap, recycle off-screen.
      const rlist = rings.value;
      for (let i = 0; i < rlist.length; i++) {
        const r = rlist[i];
        if (!r.active) continue;
        r.x -= dx;
        if (r.x < -RING.drawSize) {
          r.active = false;
          continue;
        }
        if (!r.taken) {
          const ddx = r.x - sharkX;
          const ddy = r.y - sharkY.value;
          if (ddx * ddx + ddy * ddy < RING.collectR * RING.collectR) {
            r.taken = true;
            r.active = false;
            runOnJS(emitRing)(RING.points);
          }
        }
      }
    },
    [
      dead, elapsed, worldSpeed, scrollX, spawnCarry, sharkVY, sharkY, frameClock,
      sharkFrame, obstacles, rings, inGrace, graceLeft, cfg.maxSpeed, cfg.baseSpeed,
      cfg.speedRamp, cfg.spacing, height, width, sharkX, spawnObstacle, emitGap,
      emitRing, emitCrash,
    ],
  );

  const loop = useGameLoop({ update, autostart: false });

  // --- JS-thread controls ---------------------------------------------------
  const start = useCallback(
    (seed: number) => {
      seedState.value = seed >>> 0 || 1;
      elapsed.value = 0;
      scrollX.value = 0;
      spawnCarry.value = 0;
      worldSpeed.value = cfg.baseSpeed;
      sharkY.value = height * 0.4;
      sharkVY.value = 0;
      sharkFrame.value = 0;
      frameClock.value = 0;
      inGrace.value = 0;
      graceLeft.value = 0;
      dead.value = 0;
      const ol = obstacles.value;
      for (let i = 0; i < ol.length; i++) ol[i].active = false;
      const rl = rings.value;
      for (let i = 0; i < rl.length; i++) rl[i].active = false;
      loop.resume();
      loop.setActive(true);
    },
    [
      seedState, elapsed, scrollX, spawnCarry, worldSpeed, sharkY, sharkVY,
      sharkFrame, frameClock, inGrace, graceLeft, dead, obstacles, rings, loop,
      cfg.baseSpeed, height,
    ],
  );

  const swim = useCallback(() => {
    if (dead.value === 1) return;
    sharkVY.value = SHARK.swimImpulse;
    // A swim resets the flipbook to the power stroke for snappier feedback.
    frameClock.value = 0;
  }, [dead, sharkVY, frameClock]);

  return useMemo<SharkyEngine>(
    () => ({
      loop,
      sharkY,
      sharkVY,
      sharkFrame,
      scrollX,
      worldSpeed,
      obstacles,
      rings,
      inGrace,
      start,
      swim,
    }),
    [
      loop, sharkY, sharkVY, sharkFrame, scrollX, worldSpeed, obstacles, rings,
      inGrace, start, swim,
    ],
  );
}
