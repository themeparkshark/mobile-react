/**
 * useBananaBasketEngine.ts — the Banana Basket simulation.
 *
 * Runs entirely on the UI thread via GameKit's useGameLoop (fixed-timestep
 * worklet). The JS thread only:
 *   - reads the item pool through Skia buffer modifiers (render, elsewhere),
 *   - drains a small event ring buffer to fire haptics / SFX / particles / score.
 *
 * Determinism: the spawn stream is driven by a seeded PRNG carried in a
 * SharedValue, so a round is reproducible from {seed} for server-side verify.
 *
 * Near-miss slow-mo: when a bomb slips past the basket within NEAR_MISS_RADIUS,
 * the loop dips the shared timescale to NEAR_MISS_SCALE for NEAR_MISS_MS, then
 * restores it. Because timescale scales the accumulator inside useGameLoop, the
 * whole simulation eases into bullet-time for that beat (spec requirement).
 */

import { useCallback, useMemo, useRef } from 'react';
import {
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { useGameLoop, type GameLoopControls } from '../../gamekit';
import {
  DIFFICULTY,
  ITEM,
  MAX_ITEMS,
  ROUND_SECONDS,
  BASKET_Y_FRAC,
  BASKET_W,
  CATCH_INSET_X,
  CATCH_MOUTH_TOP,
  CATCH_MOUTH_H,
  BASKET_H,
  ITEM_RADIUS,
  NEAR_MISS_RADIUS,
  NEAR_MISS_SCALE,
  NEAR_MISS_MS,
  NEAR_MISS_COOLDOWN_MS,
  START_LIVES,
  type ItemKind,
} from './constants';
import {
  EVENT,
  EVENT_SLOTS,
  EVENT_STRIDE,
  type FallingItem,
} from './types';
import { nextFloat } from './rng';

function makeItem(): FallingItem {
  'worklet';
  return {
    alive: false,
    kind: ITEM.BANANA as ItemKind,
    x: 0,
    y: 0,
    vy: 0,
    vx: 0,
    rot: 0,
    vrot: 0,
    phase: 0,
    resolved: false,
  };
}

export interface EngineEvent {
  code: number;
  x: number;
  y: number;
}

export interface BananaBasketEngine {
  loop: GameLoopControls;
  /** Item pool — read by the Skia render buffers (UI thread). */
  pool: SharedValue<FallingItem[]>;
  /** Basket center X (px). Written by the pan gesture, read by sim + render. */
  basketX: SharedValue<number>;
  /** Basket center Y (px), fixed in the bottom third. */
  basketY: SharedValue<number>;
  /** Elapsed play seconds (drives the ramp + round end). */
  elapsed: SharedValue<number>;
  /** Remaining lives. Reaches 0 → GAME_OVER event. */
  lives: SharedValue<number>;
  /** Begin/reset the round for the given seed + play area. */
  start: (opts: {
    seed: number;
    width: number;
    height: number;
    difficulty: 1 | 2 | 3;
  }) => void;
  /** Freeze / unfreeze without tearing down (pause sheet, line moving). */
  setPaused: (paused: boolean) => void;
}

export interface EngineCallbacks {
  onCatchBanana: (x: number, y: number) => void;
  onCatchChurro: (x: number, y: number) => void;
  onCatchBomb: (x: number, y: number) => void;
  onMissBanana: (x: number, y: number) => void;
  onMissChurro: (x: number, y: number) => void;
  onNearMiss: (x: number, y: number) => void;
  onGameOver: () => void;
}

export function useBananaBasketEngine(
  callbacks: EngineCallbacks,
): BananaBasketEngine {
  const pool = useSharedValue<FallingItem[]>(
    Array.from({ length: MAX_ITEMS }, makeItem),
  );

  // Play-area + tuning, all in SharedValues so the worklet reads them cheaply.
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const basketX = useSharedValue(0);
  const basketY = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const lives = useSharedValue(START_LIVES);
  const active = useSharedValue(false);

  // PRNG state + spawn scheduling.
  const rngState = useSharedValue(1);
  const spawnTimer = useSharedValue(0);
  const frenzyTimer = useSharedValue(0);

  // Difficulty params, unpacked into SharedValues (worklets can't close over
  // object props reactively).
  const dFallSpeed = useSharedValue(0);
  const dFallRamp = useSharedValue(0);
  const dSpawnEvery = useSharedValue(0);
  const dSpawnMin = useSharedValue(0);
  const dSpawnRamp = useSharedValue(0);
  const dBombChance = useSharedValue(0);
  const dChurroChance = useSharedValue(0);
  const dFrenzyCount = useSharedValue(0);
  const dFrenzyEvery = useSharedValue(0);

  // Near-miss slow-mo bookkeeping.
  const slowUntil = useSharedValue(0); // sim-seconds when slow-mo ends
  const nearMissCooldown = useSharedValue(0); // sim-seconds before next allowed
  const simClock = useSharedValue(0); // monotonic sim seconds (unaffected by pause resets)
  /**
   * Local timescale the update worklet applies to its own dt. Dipped to
   * NEAR_MISS_SCALE for NEAR_MISS_MS on a near-miss, then eased back to 1. This
   * is the "GameLoop timescale dip" from the spec, kept inside the engine so the
   * slow-mo beat is deterministic and needs no JS-thread round trip.
   */
  const slowMoScale = useSharedValue(1);

  // Event ring buffer: flat [code,x,y] * EVENT_SLOTS. Worklet writes at head,
  // JS drains up to head. A wrap counter lets the drainer detect overflow.
  const events = useSharedValue<Float32Array>(
    new Float32Array(EVENT_SLOTS * EVENT_STRIDE),
  );
  const eventHead = useSharedValue(0); // total events ever written (monotonic)
  const eventTail = useRef(0); // last drained (JS side)

  // -- Worklet helpers --------------------------------------------------------

  const pushEvent = useCallback(
    (code: number, x: number, y: number) => {
      'worklet';
      const idx = eventHead.value % EVENT_SLOTS;
      const base = idx * EVENT_STRIDE;
      const buf = events.value;
      buf[base] = code;
      buf[base + 1] = x;
      buf[base + 2] = y;
      eventHead.value = eventHead.value + 1;
    },
    [eventHead, events],
  );

  const findFree = useCallback(
    (list: FallingItem[]): number => {
      'worklet';
      for (let i = 0; i < list.length; i++) {
        if (!list[i].alive) return i;
      }
      return -1;
    },
    [],
  );

  const spawnOne = useCallback(
    (forcedKind: number) => {
      'worklet';
      const list = pool.value;
      const idx = findFree(list);
      if (idx < 0) return;
      const it = list[idx];

      // Roll kind + x from the seeded PRNG.
      let r = nextFloat(rngState.value);
      rngState.value = r.state;
      const kindRoll = r.value;
      r = nextFloat(rngState.value);
      rngState.value = r.state;
      const xRoll = r.value;
      r = nextFloat(rngState.value);
      rngState.value = r.state;
      const spin = (r.value - 0.5) * 4;

      let kind: number;
      if (forcedKind >= 0) {
        kind = forcedKind;
      } else if (kindRoll < dBombChance.value) {
        kind = ITEM.BOMB;
      } else if (kindRoll < dBombChance.value + dChurroChance.value) {
        kind = ITEM.CHURRO;
      } else {
        kind = ITEM.BANANA;
      }

      const margin = ITEM_RADIUS + 6;
      const w = width.value;
      it.alive = true;
      it.resolved = false;
      it.kind = kind as ItemKind;
      it.x = margin + xRoll * Math.max(1, w - margin * 2);
      it.y = -ITEM_RADIUS - 8;
      // Ramp fall speed with elapsed time.
      const speed = dFallSpeed.value + dFallRamp.value * elapsed.value;
      it.vy = speed * (0.9 + kindRoll * 0.25);
      it.vx = (xRoll - 0.5) * 22;
      it.rot = 0;
      it.vrot = spin;
      it.phase = xRoll * Math.PI * 2;
    },
    [
      pool,
      findFree,
      rngState,
      dBombChance,
      dChurroChance,
      dFallSpeed,
      dFallRamp,
      elapsed,
      width,
    ],
  );

  // -- The fixed-timestep simulation -----------------------------------------

  const update = useCallback(
    (rawDt: number) => {
      'worklet';
      if (!active.value) return;

      // simClock advances on real (unscaled) time so slow-mo timing + cooldowns
      // are measured in wall-clock seconds; the SIMULATION advances on scaled dt.
      simClock.value += rawDt;

      // Restore timescale when a slow-mo beat expires (measured on simClock).
      if (slowUntil.value > 0 && simClock.value >= slowUntil.value) {
        slowUntil.value = 0;
        slowMoScale.value = 1;
      }

      // Apply the local timescale: near-miss slow-mo eases the whole sim.
      const dt = rawDt * slowMoScale.value;
      elapsed.value += dt;

      // End the round on time or lives.
      if (elapsed.value >= ROUND_SECONDS && lives.value > 0) {
        active.value = false;
        pushEvent(EVENT.GAME_OVER, 0, 0);
        return;
      }

      // ---- Spawning ----------------------------------------------------------
      spawnTimer.value -= dt;
      if (spawnTimer.value <= 0) {
        spawnOne(-1);
        const interval = Math.max(
          dSpawnMin.value,
          dSpawnEvery.value - dSpawnRamp.value * elapsed.value,
        );
        spawnTimer.value += interval;
      }

      // ---- Frenzy bursts -----------------------------------------------------
      frenzyTimer.value -= dt;
      if (frenzyTimer.value <= 0) {
        const n = Math.round(dFrenzyCount.value);
        for (let k = 0; k < n; k++) {
          // Frenzy is mostly bananas + a churro, no bombs (reward moment).
          spawnOne(k === 0 ? ITEM.CHURRO : ITEM.BANANA);
        }
        frenzyTimer.value += dFrenzyEvery.value;
      }

      // ---- Basket catch zone -------------------------------------------------
      const bx = basketX.value;
      const by = basketY.value;
      const halfMouth = Math.max(1, (BASKET_W - CATCH_INSET_X * 2) / 2);
      const mouthTop = by - BASKET_H / 2 + BASKET_H * CATCH_MOUTH_TOP;
      const mouthBottom = mouthTop + BASKET_H * CATCH_MOUTH_H;
      const h = height.value;

      const list = pool.value;
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!it.alive) continue;

        it.vy += 60 * dt; // slight gravity accel for weight
        it.y += it.vy * dt;
        it.x += it.vx * dt;
        it.rot += it.vrot * dt;

        if (it.resolved) {
          // Resolved items finish falling off-screen then free.
          if (it.y > h + ITEM_RADIUS) it.alive = false;
          continue;
        }

        // Caught? Item center within the mouth rect while descending.
        const inX = it.x > bx - halfMouth && it.x < bx + halfMouth;
        const inY = it.y > mouthTop && it.y < mouthBottom;
        if (inX && inY) {
          it.resolved = true;
          it.alive = false;
          if (it.kind === ITEM.BOMB) {
            lives.value -= 1;
            pushEvent(EVENT.CATCH_BOMB, it.x, by);
          } else if (it.kind === ITEM.CHURRO) {
            pushEvent(EVENT.CATCH_CHURRO, it.x, by);
          } else {
            pushEvent(EVENT.CATCH_BANANA, it.x, by);
          }
          if (lives.value <= 0) {
            active.value = false;
            pushEvent(EVENT.GAME_OVER, 0, 0);
            return;
          }
          continue;
        }

        // Passed the basket line?
        if (it.y > by + BASKET_H / 2) {
          it.resolved = true;
          const dx = Math.abs(it.x - bx);
          if (it.kind === ITEM.BOMB) {
            // A bomb that slips just past the edge → near-miss slow-mo.
            if (
              dx < halfMouth + NEAR_MISS_RADIUS &&
              dx > halfMouth * 0.6 &&
              simClock.value >= nearMissCooldown.value &&
              slowUntil.value === 0
            ) {
              slowUntil.value = simClock.value + NEAR_MISS_MS / 1000;
              nearMissCooldown.value =
                simClock.value + NEAR_MISS_COOLDOWN_MS / 1000;
              slowMoScale.value = NEAR_MISS_SCALE;
              pushEvent(EVENT.NEAR_MISS, it.x, by);
            }
            // Dodged bomb: no penalty, just let it fall away.
          } else if (it.kind === ITEM.CHURRO) {
            // Missed churro: bonus item, NO life loss — only breaks the combo.
            pushEvent(EVENT.MISS_CHURRO, it.x, by);
          } else {
            // Missed banana → lose a life + sting.
            lives.value -= 1;
            pushEvent(EVENT.MISS_BANANA, it.x, by);
            if (lives.value <= 0) {
              active.value = false;
              pushEvent(EVENT.GAME_OVER, 0, 0);
              return;
            }
          }
        }
      }
    },
    // Dependencies are stable SharedValues + callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      active,
      simClock,
      elapsed,
      slowUntil,
      slowMoScale,
      lives,
      spawnTimer,
      spawnOne,
      dSpawnMin,
      dSpawnEvery,
      dSpawnRamp,
      frenzyTimer,
      dFrenzyCount,
      dFrenzyEvery,
      basketX,
      basketY,
      height,
      pool,
      pushEvent,
      nearMissCooldown,
    ],
  );

  const loop = useGameLoop({ update, autostart: false });

  // -- Drain events → JS callbacks -------------------------------------------
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const drain = useCallback(
    (head: number) => {
      const buf = eventsJs.current;
      if (!buf) return;
      let tail = eventTail.current;
      // If we fell more than a full ring behind, skip ahead (never replay stale).
      if (head - tail > EVENT_SLOTS) tail = head - EVENT_SLOTS;
      const cb = cbRef.current;
      for (; tail < head; tail++) {
        const base = (tail % EVENT_SLOTS) * EVENT_STRIDE;
        const code = buf[base];
        const x = buf[base + 1];
        const y = buf[base + 2];
        switch (code) {
          case EVENT.CATCH_BANANA:
            cb.onCatchBanana(x, y);
            break;
          case EVENT.CATCH_CHURRO:
            cb.onCatchChurro(x, y);
            break;
          case EVENT.CATCH_BOMB:
            cb.onCatchBomb(x, y);
            break;
          case EVENT.MISS_BANANA:
            cb.onMissBanana(x, y);
            break;
          case EVENT.MISS_CHURRO:
            cb.onMissChurro(x, y);
            break;
          case EVENT.NEAR_MISS:
            cb.onNearMiss(x, y);
            break;
          case EVENT.GAME_OVER:
            cb.onGameOver();
            break;
          default:
            break;
        }
      }
      eventTail.current = head;
    },
    [],
  );

  // Keep a JS-thread view of the event buffer (same Float32Array instance).
  const eventsJs = useRef<Float32Array | null>(null);
  eventsJs.current = events.value;

  useAnimatedReaction(
    () => eventHead.value,
    (head, prev) => {
      if (prev == null || head === prev) return;
      runOnJS(drain)(head);
    },
    [drain],
  );

  // -- Public controls --------------------------------------------------------

  const start = useCallback(
    ({
      seed,
      width: w,
      height: h,
      difficulty,
    }: {
      seed: number;
      width: number;
      height: number;
      difficulty: 1 | 2 | 3;
    }) => {
      const d = DIFFICULTY[difficulty];
      width.value = w;
      height.value = h;
      basketY.value = h * BASKET_Y_FRAC;
      basketX.value = w / 2;
      elapsed.value = 0;
      simClock.value = 0;
      lives.value = START_LIVES;
      rngState.value = seed >>> 0 || 1;
      spawnTimer.value = 0.4; // small lead-in
      frenzyTimer.value = d.frenzyEvery;
      slowUntil.value = 0;
      nearMissCooldown.value = 0;
      slowMoScale.value = 1;
      loop.setTimescale(1);

      dFallSpeed.value = d.fallSpeed;
      dFallRamp.value = d.fallRamp;
      dSpawnEvery.value = d.spawnEvery;
      dSpawnMin.value = d.spawnMin;
      dSpawnRamp.value = d.spawnRamp;
      dBombChance.value = d.bombChance;
      dChurroChance.value = d.churroChance;
      dFrenzyCount.value = d.frenzyCount;
      dFrenzyEvery.value = d.frenzyEvery;

      // Clear the pool + event ring.
      const list = pool.value;
      for (let i = 0; i < list.length; i++) list[i].alive = false;
      eventHead.value = 0;
      eventTail.current = 0;
      const buf = events.value;
      for (let i = 0; i < buf.length; i++) buf[i] = 0;

      active.value = true;
      loop.resume();
      loop.setActive(true);
    },
    // stable SharedValues + loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loop],
  );

  const setPaused = useCallback(
    (paused: boolean) => {
      if (paused) loop.pause();
      else loop.resume();
    },
    [loop],
  );

  return useMemo(
    () => ({
      loop,
      pool,
      basketX,
      basketY,
      elapsed,
      lives,
      start,
      setPaused,
    }),
    [loop, pool, basketX, basketY, elapsed, lives, start, setPaused],
  );
}
