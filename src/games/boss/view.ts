/**
 * The sim -> UI thread bridge. The sim runs on JS (pure, integer, replayable);
 * after every change it publishes this flat snapshot into one SharedValue, and
 * the Skia arena derives every telegraph, limb pose, sucker ring and fin from
 * it plus the bout clock on the UI thread (60 fps, no React renders in play).
 *
 * Also the fixed portrait layout (design v7 4.2): HUD band 0-12%, boss stage
 * 12-48% (body centre at 30%), reach band 38-62%, thumb zone in the bottom 40%
 * (target row 150 pt above the safe area, the float 24 pt above it).
 */
import type { Bout } from './sim/encounter';
import { P_ATTACK, P_DOWN, P_OPEN } from './sim/encounter';
import type { BossId } from './sim/constants';

export interface BossView {
  on: boolean;
  boss: number;
  bout: number;
  q: number;
  phase: number;
  variant: number;
  // current attack
  aOn: boolean;
  aNo: number;
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
  feintSafe: boolean;
  decoys: number[];
  call: boolean;
  /** foam bubble (bout-level) */
  bubLane: number;
  bubT0: number;
  bubT1: number;
  bubPopped: boolean;
  // opening (Pin and Pop / Break / ally / standalone Final Pop)
  oOn: boolean;
  oId: number;
  oKind: number;
  oStart: number;
  oEnd: number;
  rings: number[];
  lanes: number[];
  used: number[];
  finalIdx: number;
  slamDone: boolean;
  slamArmed: boolean;
  // player state
  lockUntil: number;
  greyUntil: number[];
  gauge: number;
  breaks: number;
  chain: number;
  grit: number;
  gritMax: number;
  stars: number;
  look: number;
  popMs: number;
  padDownAt: number;
  downOn: boolean;
  downStart: number;
  downOpen: number;
  downEnd: number;
  downTaps: number;
  endT: number;
}

export const BOSS_INDEX: Record<BossId, number> = { kraken: 0, robo_shark: 1, ghost_squid: 2 };

export function emptyView(): BossView {
  return {
    on: false, boss: 0, bout: 0, q: 116, phase: 0, variant: 1, aOn: false, aNo: 0, aKind: 0, aStart: 0, aT: 0, aW: 1,
    aG: 1, steps: [], step: 0, lane0: 0, swaps: [], show: [], showStart: -1, perm: [0, 1, 2], shuffleAt: -1,
    feintLane: -1, feintT0: -1, feintT1: -1, feintSafe: false, decoys: [], call: false, bubLane: -1, bubT0: -1, bubT1: -1,
    bubPopped: false, oOn: false, oId: 0, oKind: 0, oStart: 0, oEnd: 0, rings: [], lanes: [], used: [], finalIdx: -1,
    slamDone: false, slamArmed: false, lockUntil: 0, greyUntil: [0, 0, 0], gauge: 0, breaks: 0, chain: 0, grit: 3,
    gritMax: 3, stars: 0, look: 4, popMs: 110, padDownAt: -1, downOn: false, downStart: 0, downOpen: 0, downEnd: 0,
    downTaps: 0, endT: -1,
  };
}

export function buildView(b: Bout): BossView {
  const a = b.attack;
  const o = b.opening;
  const steps: number[] = [];
  if (a) a.steps.forEach((s) => steps.push(s.lane, s.I, s.graded ? 1 : 0));
  const u = b.bubble;
  const d = b.down;
  return {
    on: true, boss: BOSS_INDEX[b.cfg.boss], bout: b.cfg.bout, q: b.q, phase: b.phase, variant: b.cfg.variant,
    aOn: !!a && b.phase === P_ATTACK, aNo: a ? a.no : 0, aKind: a ? a.kind : 0, aStart: a ? a.start : 0, aT: a ? a.T : 0,
    aW: a ? a.W : 1, aG: a ? a.G : 1, steps, step: b.step, lane0: a ? (a.lane0 >= 0 ? a.lane0 : a.steps[0].lane) : 0,
    swaps: a ? [...a.swaps] : [], show: a ? [...a.show] : [], showStart: a ? a.showStart : -1,
    perm: a ? [...a.perm] : [0, 1, 2], shuffleAt: a ? a.shuffleAt : -1,
    feintLane: a ? a.feintLane : -1, feintT0: a ? a.feintT0 : -1, feintT1: a ? a.feintT1 : -1,
    feintSafe: a ? a.feintSafe : false, decoys: a ? [...a.decoys] : [], call: a ? a.call : false,
    bubLane: u ? u.lane : -1, bubT0: u ? u.t0 : -1, bubT1: u ? u.t1 : -1, bubPopped: u ? u.popped : false,
    oOn: !!o && b.phase === P_OPEN, oId: o ? o.id : 0, oKind: o ? o.kind : 0, oStart: o ? o.start : 0, oEnd: o ? o.end : 0,
    rings: o ? [...o.rings] : [], lanes: o ? [...o.lanes] : [], used: o ? [...o.used] : [], finalIdx: o ? o.finalIdx : -1,
    slamDone: o ? o.slamDone : false, slamArmed: !!o && b.padOpening === o.id && b.padDownAt >= 0 && !o.slamDone,
    lockUntil: b.lockUntil, greyUntil: [...b.greyUntil], gauge: b.carry.gauge, breaks: b.carry.breaks,
    chain: b.carry.chain, grit: b.grit, gritMax: b.gritMax, stars: b.carry.stars, look: b.look, popMs: b.popMs,
    padDownAt: b.padDownAt, downOn: !!d && b.phase === P_DOWN, downStart: d ? d.start : 0, downOpen: d ? d.open : 0,
    downEnd: d ? d.end : 0, downTaps: d ? d.taps : 0, endT: b.endT,
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
  /** The water lip the Kraken rises from (in front of its lower body). */
  lipY: number;
  /** Horizon line of the cove (sky/sea), behind the boss. */
  horizonY: number;
  /** Thumb zone top (bottom 40%): every input sits below this. */
  thumbTop: number;
}

export function arenaLayout(W: number, H: number, bottomInset = 0): ArenaLayout {
  const floatR = Math.min(60, W * 0.155);
  const floatY = H - bottomInset - 24 - floatR * 0.55;
  const targetH = 88;
  // Row 150 pt above the safe area (design 4.2), clear of the shark standing on the float.
  const targetY = Math.min(H - bottomInset - 150 - targetH / 2 + 20, floatY - floatR * 2.2 - targetH / 2);
  const bossSize = Math.min(W * 0.66, H * 0.36, 300);
  const bossY = Math.max(H * 0.33, 84 + bossSize * 0.42);
  return {
    W, H,
    laneX: [W * 0.2, W * 0.5, W * 0.8],
    targetY,
    targetW: Math.min(104, W / 3 - 16),
    targetH,
    floatX: W * 0.5,
    floatY,
    floatR,
    bossX: W * 0.5,
    bossY,
    bossSize,
    lipY: bossY + bossSize * 0.3,
    horizonY: bossY + bossSize * 0.05,
    thumbTop: H * 0.6,
  };
}

export const REGION_NONE = -1;
export const REGION_FLOAT = 3;
export const REGION_THUMB = 4;

/**
 * Which input region a touch at (x, y) hits: 0..2 lanes, 3 float, 4 elsewhere
 * in the thumb zone (get-up taps, catch), -1 none. Walk-safe: lanes are
 * judged by the nearest centre within a generous band, so a bump between two
 * buoys goes to the closer one and the whole row height is forgiving.
 */
export function hitRegion(L: ArenaLayout, x: number, y: number): number {
  'worklet';
  const dx = x - L.floatX;
  const dy = y - L.floatY;
  const fr = L.floatR + 18;
  if (dx * dx + dy * dy <= fr * fr) return REGION_FLOAT;
  const rowTop = L.targetY - L.targetH / 2 - 26;
  const rowBot = L.targetY + L.targetH / 2 + 14;
  if (y >= rowTop && y <= rowBot) {
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < 3; i++) {
      const d = Math.abs(x - L.laneX[i]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (bd <= L.W * 0.17) return best;
  }
  // The band below the row is all float (a thumb resting low still holds the slam).
  if (y > rowBot && Math.abs(dx) < L.W * 0.3) return REGION_FLOAT;
  if (y >= L.thumbTop - 30) return REGION_THUMB;
  return REGION_NONE;
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

/** Which side of the boss a limb striking `lane` grows from (+1 right, -1 left). */
export function rootSide(lane: number, no: number): number {
  'worklet';
  if (lane === 0) return 1;
  if (lane === 2) return -1;
  return no % 2 === 0 ? -1 : 1;
}
