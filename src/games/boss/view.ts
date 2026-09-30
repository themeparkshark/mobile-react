/**
 * The sim -> UI thread bridge. The sim runs on JS (pure, integer, replayable);
 * after every change it publishes this flat snapshot into one SharedValue, and
 * the Skia arena derives every telegraph, ring and pose from it plus the bout
 * clock on the UI thread (60 fps, no React renders during play).
 *
 * Also the fixed thumb-zone layout (design 3.2): targets at 20 / 50 / 80 %
 * width, the STRIKE float under them, all in the bottom 40% of the field.
 */
import type { Bout } from './sim/encounter';
import { P_ATTACK, P_FINISHER, P_OPEN } from './sim/encounter';
import type { BossId } from './sim/constants';

export interface BossView {
  on: boolean;
  boss: number;
  bout: number;
  q: number;
  phase: number;
  // current attack
  aOn: boolean;
  aKind: number;
  aStart: number;
  aT: number;
  aW: number;
  aG: number;
  /** flat [lane, I, graded(0/1)] per step */
  steps: number[];
  step: number;
  lane0: number;
  swaps: number[];
  show: number[];
  showStart: number;
  perm: number[];
  shuffleAt: number;
  feintLane: number;
  feintT0: number;
  feintT1: number;
  hazardLane: number;
  hazardT0: number;
  hazardT1: number;
  hazardPopped: boolean;
  decoys: number[];
  // opening / break / ally
  oOn: boolean;
  oKind: number;
  oStart: number;
  oEnd: number;
  rings: number[];
  used: number[];
  heavyDone: boolean;
  // player state
  lockUntil: number;
  greyUntil: number[];
  gauge: number;
  breaks: number;
  chain: number;
  finOn: boolean;
  finStart: number;
  finRing: number;
  finDone: boolean;
  padDownAt: number;
  endT: number;
}

export const BOSS_INDEX: Record<BossId, number> = { kraken: 0, robo_shark: 1, ghost_squid: 2 };

export function emptyView(): BossView {
  return {
    on: false, boss: 0, bout: 0, q: 116, phase: 0, aOn: false, aKind: 0, aStart: 0, aT: 0, aW: 1, aG: 1, steps: [],
    step: 0, lane0: 0, swaps: [], show: [], showStart: -1, perm: [0, 1, 2], shuffleAt: -1, feintLane: -1,
    feintT0: -1, feintT1: -1, hazardLane: -1, hazardT0: -1, hazardT1: -1, hazardPopped: false, decoys: [],
    oOn: false, oKind: 0, oStart: 0, oEnd: 0, rings: [], used: [], heavyDone: false, lockUntil: 0,
    greyUntil: [0, 0, 0], gauge: 0, breaks: 0, chain: 0, finOn: false, finStart: 0, finRing: 0, finDone: false,
    padDownAt: -1, endT: -1,
  };
}

export function buildView(b: Bout): BossView {
  const a = b.attack;
  const o = b.opening;
  const f = b.finisher;
  const steps: number[] = [];
  if (a) a.steps.forEach((s) => steps.push(s.lane, s.I, s.graded ? 1 : 0));
  return {
    on: true, boss: BOSS_INDEX[b.cfg.boss], bout: b.cfg.bout, q: b.q, phase: b.phase,
    aOn: !!a && b.phase === P_ATTACK, aKind: a ? a.kind : 0, aStart: a ? a.start : 0, aT: a ? a.T : 0,
    aW: a ? a.W : 1, aG: a ? a.G : 1, steps, step: b.step, lane0: a ? (a.lane0 >= 0 ? a.lane0 : a.steps[0].lane) : 0,
    swaps: a ? [...a.swaps] : [], show: a ? [...a.show] : [], showStart: a ? a.showStart : -1,
    perm: a ? [...a.perm] : [0, 1, 2], shuffleAt: a ? a.shuffleAt : -1,
    feintLane: a ? a.feintLane : -1, feintT0: a ? a.feintT0 : -1, feintT1: a ? a.feintT1 : -1,
    hazardLane: a ? a.hazardLane : -1, hazardT0: a ? a.hazardT0 : -1, hazardT1: a ? a.hazardT1 : -1,
    hazardPopped: a ? a.hazardPopped : false, decoys: a ? [...a.decoys] : [],
    oOn: !!o && b.phase === P_OPEN, oKind: o ? o.kind : 0, oStart: o ? o.start : 0, oEnd: o ? o.end : 0,
    rings: o ? [...o.rings] : [], used: o ? [...o.used] : [], heavyDone: o ? o.heavyDone : false,
    lockUntil: b.lockUntil, greyUntil: [...b.greyUntil], gauge: b.carry.gauge, breaks: b.carry.breaks,
    chain: b.carry.chain, finOn: !!f && b.phase === P_FINISHER, finStart: f ? f.start : 0, finRing: f ? f.ring : 0,
    finDone: f ? f.done : false, padDownAt: b.padDownAt, endT: b.endT,
  };
}

// ---- layout ---------------------------------------------------------------

export interface ArenaLayout {
  W: number;
  H: number;
  laneX: [number, number, number];
  targetY: number;
  targetW: number;
  targetH: number;
  floatX: number;
  floatY: number;
  floatR: number;
  bossX: number;
  bossY: number;
  bossSize: number;
  waterY: number;
}

export function arenaLayout(W: number, H: number, bottomInset = 0): ArenaLayout {
  const floatR = Math.min(56, W * 0.145);
  const floatY = H - bottomInset - 20 - floatR * 0.62;
  const targetH = 96;
  // The shark stands ~1.9 R tall on the float: keep the target row clear above its head.
  const targetY = floatY - floatR * 2.35 - targetH / 2;
  const bossSize = Math.min(W * 0.66, H * 0.36, 300);
  return {
    W, H,
    laneX: [W * 0.2, W * 0.5, W * 0.8],
    targetY,
    targetW: Math.min(118, W / 3 - 10),
    targetH,
    floatX: W * 0.5,
    floatY,
    floatR,
    bossX: W * 0.5,
    bossY: Math.max(H * 0.3, 70 + bossSize * 0.42),
    bossSize,
    waterY: H * 0.34,
  };
}

/** Which input region a touch at (x, y) hits: 0..2 targets, 3 float, -1 none. */
export function hitRegion(L: ArenaLayout, x: number, y: number): number {
  'worklet';
  const dx = x - L.floatX;
  const dy = y - L.floatY;
  const fr = L.floatR + 16;
  if (dx * dx + dy * dy <= fr * fr) return 3;
  if (Math.abs(y - L.targetY) <= L.targetH / 2 + 12) {
    for (let i = 0; i < 3; i++) if (Math.abs(x - L.laneX[i]) <= L.targetW / 2 + 8) return i;
  }
  // Generous fallback in the thumb zone: the lower band below the targets is all float.
  if (y > L.targetY + L.targetH / 2 + 12 && Math.abs(dx) < L.W * 0.3) return 3;
  return -1;
}

/** Current lane of the attacking step (ghost lanes move) on the UI thread. */
export function viewLane(v: BossView, t: number): number {
  'worklet';
  if (!v.aOn || v.steps.length === 0) return -1;
  const k = v.step;
  if (k > 0 || v.swaps.length === 0) return v.steps[k * 3];
  let lane = v.lane0;
  for (let i = 0; i < v.swaps.length; i += 2) if (t >= v.swaps[i]) lane = v.swaps[i + 1];
  return lane;
}
