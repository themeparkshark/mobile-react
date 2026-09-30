/**
 * useWhackRuntime: the UI-thread half of Bonk Rush (design 4.1, 4.4, 5.7, 12).
 *
 * One frame callback owns the game clock:
 *   dtGame = fxDt (0 in a global freeze, scaled in slow-mo) x resume ease-in
 * and feeds whole milliseconds to the sim. Auto Look-Up stops the sim clock
 * by itself. Touch-down resolves in the gesture worklet on the same frame,
 * and sim events leave the UI thread through the event ring (one runOnJS).
 *
 * Nothing here reads movement: a moving line is not an input.
 */

import { useCallback, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, runOnUI, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useGameClock, type GameClockHandle } from '../../gamekit/useGameClock';
import { slotDt } from '../../gamekit/core/clock';
import { pushEvent } from '../../gamekit/core/eventRing';
import { mixSeed } from '../../gamekit/core/rng';
import { useEventBridge } from '../../gamekit/fx/useEventBridge';
import {
  P_BONKED, P_ESCAPE, P_TELL, P_UP, SPLAT_DOWN, simAdvance, simBank, simResult, simSwipe, simTap, simUnfreeze,
  type BurstResult, type WhackSim,
} from './sim';
import { K_ANGLER, K_BRUISER, K_HELMET, K_PUFFER } from './waves';
import { hitTest, type BoardLayout } from './render/layout';
import { computeRender, createHoleAnim, createRenderState, type HoleAnim, type RenderState } from './render/renderState';

export interface RuntimeFlags {
  running: boolean;
  acc: number;
  /** Resume ease-in progress (ms of 600): game time runs 0.5x -> 1x. */
  easeT: number;
  endSeen: boolean;
  bot: boolean;
  botEv: number[];
  botAt: number[];
  botHits: number[];
  swipeHole: number;
  swipeX0: number;
  reducedMotion: boolean;
  /** Wall ms spent playing this Burst (proof wall_ms). */
  wallMs: number;
}

function createFlags(): RuntimeFlags {
  'worklet';
  const z = (v: number) => {
    const a: number[] = [];
    for (let i = 0; i < 9; i++) a.push(v);
    return a;
  };
  return {
    running: false, acc: 0, easeT: 600, endSeen: false, bot: false, botEv: z(-1), botAt: z(0), botHits: z(0),
    swipeHole: -1, swipeX0: 0, reducedMotion: false, wallMs: 0,
  };
}

function emptySim(): WhackSim {
  'worklet';
  const z = (v: number) => {
    const a: number[] = [];
    for (let i = 0; i < 9; i++) a.push(v);
    return a;
  };
  return {
    n: 0, evTell: [], evEmerge: [], evDuck: [], evHole: [], evKind: [], evLink: [], aN: 0, aType: [], aTell: [], aLand: [],
    aHole: [], aHole2: [], aRow: [], aState: [], len: 30000, ride: false, butterOn: false, feverOn: false, boss: false, lookUpOn: true, seed: 0,
    t: 0, next: 0, ended: false, frozen: false, hEv: z(-1), hPh: z(0), hAt: z(0), hExt: z(0), hHelm: z(0), hLock: z(0),
    hHitT: z(-99999), hGrade: z(0), hSplat: z(0), hSplatType: z(0), hFade: z(0), hPuffed: z(0), score: 0, streak: 0,
    maxStreak: 0, tier: 0, meter: 0, fever: false, feverLeft: 0, coin: 0, win: false, winAt: -1, hits: 0, legacyHits: 0,
    quick: 0, good: 0, late: 0, crits: 0, goldens: 0, decoyHits: 0, whiffs: 0, butters: 0, escapes: 0, engagedEscapes: 0,
    freezes: 0, doubles: 0, lastTap: 0, w0: -99999, w1: -99999, quickRun: 0, blocked: 0, bossHp: 0, bossMax: 0,
    bossDownAt: -1, lap: false, bruiserHp: 0, scanRow: -1, scanUntil: 0, taps: [], tapCount: 0, emit: true, ev: [],
  };
}

export interface SimMirror {
  score: number;
  t: number;
  taps: number[];
  streak: number;
  frozen: boolean;
  ended: boolean;
  wallMs: number;
}

export interface WhackRuntime {
  sim: SharedValue<WhackSim>;
  rs: SharedValue<RenderState>;
  an: SharedValue<HoleAnim>;
  tick: SharedValue<number>;
  rt: SharedValue<RuntimeFlags>;
  clock: GameClockHandle;
  gesture: ReturnType<typeof Gesture.Manual>;
  /** Start a Burst on a fresh sim (JS thread). */
  start: (s: WhackSim, bot: boolean) => void;
  setRunning: (on: boolean, easeIn?: boolean) => void;
  /** Bank now (line call / BANK & EXIT). */
  bank: () => void;
  /** Snapshot of the live sim for the JS side (score, taps, time). */
  mirror: () => Promise<SimMirror>;
  /** Final result + tap log (after E_END). */
  final: () => Promise<{ result: BurstResult; taps: number[]; wallMs: number }>;
}

export function useWhackRuntime(opts: {
  geo: SharedValue<BoardLayout>;
  boxes: SharedValue<number[][]>;
  onEvents: (batch: number[]) => void;
}): WhackRuntime {
  const { geo, boxes, onEvents } = opts;
  const sim = useSharedValue<WhackSim>(emptySim());
  const rs = useSharedValue<RenderState>(createRenderState());
  const an = useSharedValue<HoleAnim>(createHoleAnim());
  const tick = useSharedValue(0);
  const rt = useSharedValue<RuntimeFlags>(createFlags());
  const bridge = useEventBridge(onEvents, 512);
  // UI -> JS replies go through stable JS callbacks (never a Promise resolver).
  const mirrorWaiters = useRef<((m: SimMirror) => void)[]>([]);
  const finalWaiters = useRef<((f: { result: BurstResult; taps: number[]; wallMs: number }) => void)[]>([]);
  const onMirror = useCallback((m: SimMirror) => {
    const q = mirrorWaiters.current;
    mirrorWaiters.current = [];
    q.forEach((f) => f(m));
  }, []);
  const onFinal = useCallback((f: { result: BurstResult; taps: number[]; wallMs: number }) => {
    const q = finalWaiters.current;
    finalWaiters.current = [];
    q.forEach((cb) => cb(f));
  }, []);
  const ring = bridge.ring;

  const drainTo = (s: WhackSim) => {
    'worklet';
    const ev = s.ev;
    if (ev.length === 0) return;
    for (let k = 0; k + 4 < ev.length; k += 5) pushEvent(ring.value, ev[k], ev[k + 1], ev[k + 2], ev[k + 3], ev[k + 4]);
    s.ev.length = 0;
  };

  const kickHole = (a: HoleAnim, L: BoardLayout, h: number, x: number, y: number, amount: number) => {
    'worklet';
    const dx = L.cx[h] - x;
    const dy = L.my[h] - L.spriteH[h] * 0.45 - y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    a.kickX[h] = (dx / len) * amount;
    a.kickY[h] = (dy / len) * amount;
    a.kickAt[h] = a.local[h];
  };

  const tapHole = (s: WhackSim, a: HoleAnim, r: RuntimeFlags, L: BoardLayout, h: number, x: number, y: number) => {
    'worklet';
    const helmBefore = s.hHelm[h];
    const wasFrozen = s.frozen;
    simTap(s, h);
    if (wasFrozen && !s.frozen) r.easeT = 0;
    if (helmBefore === 1 && s.hHelm[h] === 0) {
      a.helmPopAt[h] = a.local[h];
      a.helmDir[h] = x < L.cx[h] ? 1 : -1;
    }
    const bonked = s.hPh[h] === P_BONKED || (s.hPh[h] === P_UP && s.hHitT[h] === s.t);
    if (bonked && s.hHitT[h] === s.t) kickHole(a, L, h, x, y, s.hGrade[h] >= 2 ? 3 : 2);
    a.fingerAt = a.fxNow;
    a.fingerX = x;
    a.fingerY = y - L.cellW * 0.35;
    a.fingerSpin = 0;
  };

  // Dev autoplay: a human-paced bot (350-560 ms after emerge), never bonks decoys.
  const botStep = (s: WhackSim, r: RuntimeFlags, a: HoleAnim, L: BoardLayout) => {
    'worklet';
    if (s.frozen) {
      simUnfreeze(s);
      r.easeT = 0;
      return;
    }
    for (let h = 0; h < 9; h++) {
      const e = s.hEv[h];
      if (e < 0) continue;
      if (s.hSplat[h] === SPLAT_DOWN) {
        if (r.botEv[h] !== -2) {
          r.botEv[h] = -2;
          r.botAt[h] = s.t + 520;
        } else if (s.t >= r.botAt[h]) {
          simSwipe(s, h);
          r.botEv[h] = -1;
        }
        continue;
      }
      if (s.hPh[h] !== P_UP) continue;
      const k = s.evKind[e];
      if (k === K_ANGLER || k === K_PUFFER) continue;
      if (r.botEv[h] !== e) {
        r.botEv[h] = e;
        r.botAt[h] = s.evEmerge[e] + 240 + (mixSeed(e + 1, s.seed) % 260);
        r.botHits[h] = 0;
      }
      if (s.t >= r.botAt[h]) {
        tapHole(s, a, r, L, h, L.cx[h] + 6, L.my[h] - L.spriteH[h] * 0.5);
        r.botHits[h] += 1;
        r.botAt[h] = s.t + (k === K_BRUISER ? 210 : k === K_HELMET ? 190 : 100000);
      }
    }
  };

  const clock = useGameClock({
    config: { slots: 9, freezeBudget: 0.02 },
    onFrame: (_alpha, fxDt, c) => {
      'worklet';
      const s = sim.value;
      const r = rt.value;
      const a = an.value;
      const L = geo.value;
      if (r.running && !s.ended) {
        let f = 1;
        if (r.easeT < 600) {
          const q = r.easeT / 600;
          f = 0.5 + 0.5 * q * q;
          r.easeT += fxDt;
        }
        r.wallMs += c.paused ? 0 : fxDt > 0 ? fxDt : 0;
        r.acc += fxDt * f;
        const whole = Math.floor(r.acc);
        r.acc -= whole;
        if (whole > 0) simAdvance(s, whole);
        if (s.frozen) r.acc = 0;
        if (r.bot) botStep(s, r, a, L);
      }
      if (s.ended && !r.endSeen) {
        r.endSeen = true;
        // FINISH: every live target ducks in reading order on a 60 ms stagger.
        let k = 0;
        for (let h = 0; h < 9; h++) {
          if (s.hPh[h] === P_UP || s.hPh[h] === P_TELL) {
            s.hPh[h] = P_ESCAPE;
            a.lastPh[h] = P_ESCAPE;
            a.phaseAt[h] = a.local[h] + k * 60;
            k += 1;
          }
        }
      }
      drainTo(s);
      const locals: number[] = [];
      for (let i = 0; i < 9; i++) locals.push(slotDt(c, i));
      computeRender(rs.value, a, s, L, boxes.value, fxDt, locals, r.reducedMotion);
      tick.value = tick.value + 1;
      bridge.flush();
    },
  });

  const gesture = useMemo(() => Gesture.Manual()
    .onTouchesDown((e) => {
      'worklet';
      const s = sim.value;
      const r = rt.value;
      if (!r.running || s.ended) return;
      const a = an.value;
      const L = geo.value;
      const up: number[] = [];
      for (let i = 0; i < 9; i++) up.push(s.hPh[i] === P_UP || s.hPh[i] === P_TELL ? 1 : 0);
      for (let k = 0; k < e.changedTouches.length; k++) {
        const t = e.changedTouches[k];
        const h = hitTest(L, t.x, t.y, up);
        if (h >= 0 && s.hSplat[h] === SPLAT_DOWN) {
          r.swipeHole = h;
          r.swipeX0 = t.x;
          if (s.frozen) {
            simUnfreeze(s);
            r.easeT = 0;
          }
          continue;
        }
        if (h >= 0) tapHole(s, a, r, L, h, t.x, t.y);
        else if (s.frozen) {
          simUnfreeze(s);
          r.easeT = 0;
        }
      }
      drainTo(s);
      bridge.flush();
    })
    .onTouchesMove((e) => {
      'worklet';
      const r = rt.value;
      if (r.swipeHole < 0) return;
      const s = sim.value;
      const L = geo.value;
      for (let k = 0; k < e.changedTouches.length; k++) {
        const t = e.changedTouches[k];
        if (Math.abs(t.x - r.swipeX0) >= L.rimW[r.swipeHole] * 0.6) {
          simSwipe(s, r.swipeHole);
          r.swipeHole = -1;
          drainTo(s);
          bridge.flush();
          return;
        }
      }
    })
    .onTouchesUp(() => {
      'worklet';
      rt.value.swipeHole = -1;
    }), [sim, rt, an, geo, bridge]);

  return useMemo<WhackRuntime>(() => ({
    sim, rs, an, tick, rt, clock, gesture,
    start: (s: WhackSim, bot: boolean) => {
      runOnUI((next: WhackSim, b: boolean) => {
        'worklet';
        sim.value = next;
        const r = rt.value;
        r.running = true;
        r.acc = 0;
        r.easeT = 600;
        r.endSeen = false;
        r.bot = b;
        r.wallMs = 0;
        for (let i = 0; i < 9; i++) {
          r.botEv[i] = -1;
          r.botAt[i] = 0;
        }
        const a = an.value;
        for (let i = 0; i < 9; i++) {
          a.lastEv[i] = -1;
          a.lastPh[i] = 0;
          a.lastHitT[i] = -99999;
          a.hitAt[i] = -99999;
          a.helmPopAt[i] = -99999;
        }
      })(s, bot);
    },
    setRunning: (on: boolean, easeIn = false) => {
      runOnUI((v: boolean, ease: boolean) => {
        'worklet';
        rt.value.running = v;
        if (ease) rt.value.easeT = 0;
      })(on, easeIn);
    },
    bank: () => {
      runOnUI(() => {
        'worklet';
        simBank(sim.value);
      })();
    },
    mirror: () => new Promise<SimMirror>((resolve) => {
      mirrorWaiters.current.push(resolve);
      if (mirrorWaiters.current.length > 1) return;
      runOnUI(() => {
        'worklet';
        const s = sim.value;
        runOnJS(onMirror)({ score: s.score, t: s.t, taps: s.taps.slice(), streak: s.streak, frozen: s.frozen, ended: s.ended, wallMs: rt.value.wallMs });
      })();
    }),
    final: () => new Promise((resolve) => {
      finalWaiters.current.push(resolve);
      if (finalWaiters.current.length > 1) return;
      runOnUI(() => {
        'worklet';
        const s = sim.value;
        runOnJS(onFinal)({ result: simResult(s), taps: s.taps.slice(), wallMs: rt.value.wallMs });
      })();
    }),
  }), [sim, rs, an, tick, rt, clock, gesture, onMirror, onFinal]);
}
