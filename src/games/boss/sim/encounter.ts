/**
 * Boss Brawl v4 encounter sim: pure, integer-only, deterministic.
 *
 *   const b = createBout({ boss, seed, bout: 0, carry, walk, tide, offset });
 *   input(b, { t, k: IN_TARGET, a: lane });   // taps, stamped in bout simT
 *   advance(b, simT);                         // timeouts, openings, the end
 *   b.events                                  // presentation events, in order
 *   scoreBout(b)                              // integer points, one floor
 *
 * Time only moves forward through `advance` and `input`, and every transition
 * happens at its own scheduled integer time (never at a frame time), so the
 * same input log gives the same bout on the phone, in node and in the server
 * replay (PHP port, WS6). No floats, Math.random, Date or easing in here.
 */
import { mixSeed, createRng, type Rng } from '../../../gamekit/core/rng';
import {
  ATTACKS, BONUS_ATTACK_CAP, BREAK_FREEZE, BREAK_MAX, BREAK_Q, BREAK_RING_Q, BUFFER_MS, CLOSE_GRACE_MS, COYOTE_MS, DIZZY_MS,
  FINISHER_FREEZE, FINISHER_GAUGE_MIN, FINISHER_GOOD_MS, FINISHER_HOLD_MS, FINISHER_PERFECT_MS, FINISHER_Q, GAIN,
  GAUGE_MAX, GUARD_SWAT_MS, GUARD_TAPS, GUARD_WINDOW_MS, HEAVY_WINDOW_MS, IN_ALLY, IN_END, IN_PAD_DOWN, IN_PAD_UP,
  IN_PAUSE, IN_RESCUE, IN_RESUME, IN_SURGE, IN_TARGET, KO_FREEZE, LEAD_Q, LOSS, MULT, OFFSET_CLAMP, OPENING_Q,
  PERFECT_EARLY, PERFECT_LATE, PTS, PUNISH_MS, QUARTER, RECOVER_Q, RING_CRIT_MS, RINGS, UNIT, comboPct, type BossId,
} from './constants';
import { freshRoundFlags, laneAt, planAttack, type Attack, type RoundFlags } from './patterns';

// Presentation events (b.events). a/b/v meanings noted per code.
export const E_FEINT = 1; //         a lane
export const E_TELL = 2; //          a lane, b step
export const E_SHOW = 3; //          a icon (3+ decoy), b index
export const E_SHUFFLE = 4;
export const E_HAZARD = 5; //        a lane
export const E_POP = 6; //           a lane
export const E_GREY = 7; //          a lane (feint tapped; safe or greyed)
export const E_EARLY = 8; //         a lane (too early, soft tick)
export const E_LOCK = 9; //          a lane (Robo node locked, untimed)
export const E_PERFECT = 10; //      a lane, b error ms (signed), v points
export const E_GOOD = 11; //         a lane, b error ms, v points
export const E_PUNISH = 12; //       a lane, b reason (0 wrong, 1 late, 2 decoy)
export const E_SAFE_MISS = 13; //    a lane
export const E_OPEN = 14; //         a kind (0 normal, 1 break, 2 ally), b ring count
export const E_HIT = 15; //          a slot, b combo pct, v points
export const E_CRIT = 16; //         a slot, b combo pct, v points
export const E_CLANK = 17; //        a guard count
export const E_GUARD_COUNTER = 18;
export const E_HEAVY = 19; //        v points
export const E_HEAVY_MISS = 20; //   v points
export const E_CLOSE = 21; //        a kind
export const E_BREAK = 22; //        a break number (1..3), v points
export const E_BREAK_END = 23;
export const E_FINISHER = 24; //     finisher starts
export const E_FINISH = 25; //       a grade (2 perfect, 1 good, 0 miss), b error, v points
export const E_END = 26; //          a reason (0 attacks done, 1 finisher, 2 paintball)
export const E_TIER = 27; //         a combo pct
export const E_GAUGE_HOT = 28;
export const E_ALLY_ARRIVE = 29;
export const E_SURGE = 30;
export const E_COMBO_RESET = 31; //  a chain lost

export interface SimEvent { code: number; t: number; a: number; b: number; v: number }

export interface Carry {
  chain: number;
  maxChain: number;
  gauge: number;
  breaks: number;
  bonusAttacks: number;
  flags: RoundFlags;
}

export function freshCarry(): Carry {
  return { chain: 0, maxChain: 0, gauge: 0, breaks: 0, bonusAttacks: 0, flags: freshRoundFlags() };
}

export interface BoutConfig {
  boss: BossId;
  seed: number;
  bout: number;
  carry?: Carry;
  walk?: boolean;
  tide?: boolean;
  offset?: number;
  variant?: number;
  /** Solo players never get ally openings; the team layer sets this. */
  team?: boolean;
}

export interface Opening {
  id: number;
  kind: number;
  start: number;
  end: number;
  rings: number[];
  used: number[];
  mult: number;
  heavyDone: boolean;
  crits: number;
}

export interface Finisher { start: number; ring: number; done: boolean }

export interface InputEvent { t: number; k: number; a?: number }

export interface BoutStats {
  perfect: number; good: number; crit: number; hit: number; heavy: number; punish: number; clank: number;
  guard: number; breaks: number; hazards: number; allyCrits: number; finisher: number; counterErr: number[];
}

export interface Bout {
  cfg: Required<Omit<BoutConfig, 'carry'>>;
  q: number;
  t: number;
  phase: number;
  rng: Rng;
  carry: Carry;
  attacksTotal: number;
  attacksDone: number;
  attack: Attack | null;
  step: number;
  opening: Opening | null;
  openingSeq: number;
  lastCloseAt: number;
  lockUntil: number;
  nextAt: number;
  greyUntil: number[];
  guardTaps: number[];
  padDownAt: number;
  padOpening: number;
  finisher: Finisher | null;
  pendingAlly: number;
  pauses: number;
  sum: number;
  stats: BoutStats;
  events: SimEvent[];
  endT: number;
  log: InputEvent[];
  gaugeHot: boolean;
}

/** Scoring units per point (points x combo pct x mult pct). */
export const UNIT_POINTS = UNIT;

export const P_LEAD = 0;
export const P_ATTACK = 1;
export const P_OPEN = 2;
export const P_FINISHER = 3;
export const P_DONE = 4;

function clampOffset(o: number): number {
  return o > OFFSET_CLAMP ? OFFSET_CLAMP : o < -OFFSET_CLAMP ? -OFFSET_CLAMP : Math.trunc(o);
}

/** Next quarter-beat grid point at or after t. */
export function ceilQ(t: number, q: number): number {
  return Math.floor((t + q - 1) / q) * q;
}

export function boutSeed(seed: number, bout: number): number {
  return mixSeed(seed >>> 0, (bout + 1) >>> 0);
}

function cloneCarry(c: Carry): Carry {
  return { ...c, flags: { ...c.flags } };
}

export function createBout(cfg: BoutConfig): Bout {
  const bout = cfg.bout;
  const carry = cloneCarry(cfg.carry ?? freshCarry());
  const q = QUARTER[cfg.boss][bout];
  const b: Bout = {
    cfg: {
      boss: cfg.boss, seed: cfg.seed >>> 0, bout, walk: !!cfg.walk, tide: !!cfg.tide,
      offset: clampOffset(cfg.offset ?? 0), variant: cfg.variant ?? 0, team: !!cfg.team,
    },
    q, t: 0, phase: P_LEAD, rng: createRng(boutSeed(cfg.seed, bout)), carry,
    attacksTotal: ATTACKS[bout] + (bout === 2 ? Math.min(BONUS_ATTACK_CAP, carry.bonusAttacks) : 0),
    attacksDone: 0, attack: null, step: 0, opening: null, openingSeq: 0, lastCloseAt: -1e9, lockUntil: 0,
    nextAt: LEAD_Q * q, greyUntil: [0, 0, 0], guardTaps: [], padDownAt: -1, padOpening: -1, finisher: null,
    pendingAlly: 0, pauses: 0, sum: 0,
    stats: { perfect: 0, good: 0, crit: 0, hit: 0, heavy: 0, punish: 0, clank: 0, guard: 0, breaks: 0, hazards: 0,
      allyCrits: 0, finisher: -1, counterErr: [] },
    events: [], endT: -1, log: [], gaugeHot: carry.gauge >= 800,
  };
  if (b.cfg.tide) addGauge(b, GAIN.tide, 0);
  return b;
}

function emit(b: Bout, code: number, t: number, a = 0, bb = 0, v = 0): void {
  b.events.push({ code, t, a, b: bb, v });
}

function score(b: Bout, base: number, pct: number, mult: number): number {
  const units = base * pct * mult;
  b.sum += units;
  return units;
}

function addGauge(b: Bout, amount: number, t: number): void {
  const c = b.carry;
  const cap = c.breaks >= BREAK_MAX ? GAUGE_MAX - 10 : GAUGE_MAX;
  c.gauge = Math.max(0, Math.min(cap, c.gauge + amount));
  const hot = c.gauge >= 800;
  if (hot && !b.gaugeHot) emit(b, E_GAUGE_HOT, t);
  b.gaugeHot = hot;
}

function chainUp(b: Bout, t: number): void {
  const c = b.carry;
  const before = comboPct(c.chain);
  c.chain += 1;
  if (c.chain > c.maxChain) c.maxChain = c.chain;
  const after = comboPct(c.chain);
  if (after !== before) emit(b, E_TIER, t, after);
}

function chainReset(b: Bout, t: number): void {
  if (b.carry.chain > 0) emit(b, E_COMBO_RESET, t, b.carry.chain);
  b.carry.chain = 0;
}

function breakReady(b: Bout): boolean {
  return b.carry.gauge >= GAUGE_MAX && b.carry.breaks < BREAK_MAX;
}

// ---- scheduling -----------------------------------------------------------

/** Time of the next scheduled transition in the current phase. */
function nextTransition(b: Bout): number {
  switch (b.phase) {
    case P_LEAD: return b.nextAt;
    case P_ATTACK: {
      const a = b.attack!;
      return a.steps[b.step].I + COYOTE_MS + 1;
    }
    case P_OPEN: return b.opening!.end;
    case P_FINISHER: return b.finisher!.ring + FINISHER_GOOD_MS + 1;
    default: return Number.MAX_SAFE_INTEGER;
  }
}

function recoverThen(b: Bout, from: number): void {
  b.phase = P_LEAD;
  b.nextAt = ceilQ(from + RECOVER_Q[b.cfg.bout] * b.q, b.q);
}

function startAttack(b: Bout, at: number): void {
  const a = planAttack({
    boss: b.cfg.boss, bout: b.cfg.bout, no: b.attacksDone, at, q: b.q, walk: b.cfg.walk,
    variant: b.cfg.variant, rng: b.rng, flags: b.carry.flags,
  });
  b.attack = a;
  b.step = 0;
  b.phase = P_ATTACK;
  if (a.feintLane >= 0) emit(b, E_FEINT, a.feintT0, a.feintLane, a.feintSafe ? 1 : 0);
  for (let i = 0; i < a.show.length; i++) emit(b, E_SHOW, a.showStart + i * 4 * b.q, a.show[i], i);
  if (a.shuffleAt >= 0) emit(b, E_SHUFFLE, a.shuffleAt);
  if (a.hazardLane >= 0) emit(b, E_HAZARD, a.hazardT0, a.hazardLane);
  emit(b, E_TELL, a.T, laneAt(a, 0, a.T), 0);
  for (let i = 0; i < a.swaps.length; i += 2) emit(b, E_TELL, a.swaps[i], a.swaps[i + 1], 0);
  for (let k = 1; k < a.steps.length; k++) {
    if (a.steps[k].I !== a.steps[k - 1].I) emit(b, E_TELL, Math.max(a.T, a.steps[k].I - a.W), a.steps[k].lane, k);
  }
}

function endBout(b: Bout, t: number, reason: number): void {
  b.phase = P_DONE;
  b.endT = t;
  b.attack = null;
  b.opening = null;
  emit(b, E_END, t, reason);
}

function onLead(b: Bout): void {
  const t = b.nextAt;
  if (b.pendingAlly > 0 && b.cfg.team) {
    b.pendingAlly = 0;
    openAlly(b, t);
    return;
  }
  if (b.attacksDone < b.attacksTotal) {
    startAttack(b, t);
    return;
  }
  const c = b.carry;
  if (b.cfg.bout === 2 && !b.finisher && (c.breaks >= 1 || c.gauge >= FINISHER_GAUGE_MIN)) {
    b.finisher = { start: t, ring: t + FINISHER_Q * b.q, done: false };
    b.phase = P_FINISHER;
    emit(b, E_FINISHER, t);
    return;
  }
  endBout(b, t + (b.cfg.bout === 2 ? KO_FREEZE : 0), 0);
}

function attackResolved(b: Bout): void {
  b.attacksDone += 1;
  b.attack = null;
}

function punish(b: Bout, t: number, lane: number, reason: number): void {
  const a = b.attack!;
  if (a.safe) {
    // First appearance of a new idea never punishes.
    emit(b, E_SAFE_MISS, t, lane, reason);
    attackResolved(b);
    recoverThen(b, t);
    return;
  }
  b.stats.punish += 1;
  chainReset(b, t);
  addGauge(b, -LOSS.punish, t);
  if (reason === 1) {
    // Sekiro drain: an unanswered attack drains to the last full 20-point segment.
    b.carry.gauge = Math.floor(b.carry.gauge / 200) * 200;
    b.gaugeHot = b.carry.gauge >= 800;
  }
  emit(b, E_PUNISH, t, lane, reason);
  b.lockUntil = t + PUNISH_MS;
  attackResolved(b);
  recoverThen(b, t + PUNISH_MS);
}

function openOpening(b: Bout, I: number, perfect: boolean): void {
  const bout = b.cfg.bout;
  const q = b.q;
  if (breakReady(b)) {
    startBreak(b, I);
    return;
  }
  const rings: number[] = [];
  if (perfect) rings.push(I + 2 * q);
  for (let k = 1; k <= RINGS[bout]; k++) rings.push(I + k * 4 * q);
  pushOpening(b, 0, I, I + OPENING_Q[bout] * q, rings, MULT.normal);
}

function pushOpening(b: Bout, kind: number, start: number, end: number, rings: number[], mult: number): void {
  b.openingSeq += 1;
  b.opening = { id: b.openingSeq, kind, start, end, rings, used: rings.map(() => 0), mult, heavyDone: false, crits: 0 };
  b.phase = P_OPEN;
  emit(b, E_OPEN, start, kind, rings.length);
}

function openAlly(b: Bout, t: number): void {
  const q = b.q;
  emit(b, E_ALLY_ARRIVE, t);
  pushOpening(b, 2, t, t + 8 * q, [t + 2 * q, t + 6 * q], MULT.ally);
}

function startBreak(b: Bout, t: number): void {
  const c = b.carry;
  c.breaks += 1;
  b.stats.breaks += 1;
  const n = c.breaks;
  const lump = score(b, PTS.breakLump, 100, 100);
  emit(b, E_BREAK, t, n, 0, lump);
  if (c.bonusAttacks < BONUS_ATTACK_CAP) {
    c.bonusAttacks += 1;
    if (b.cfg.bout === 2) b.attacksTotal += 1;
  }
  c.gauge = 0;
  b.gaugeHot = false;
  const q = b.q;
  const d0 = ceilQ(t + BREAK_FREEZE[Math.min(n, 3) - 1], q);
  const rings: number[] = [];
  for (let k = 1; k <= BREAK_Q / BREAK_RING_Q; k++) rings.push(d0 + k * BREAK_RING_Q * q);
  if (b.attack) attackResolved(b);
  pushOpening(b, 1, d0, d0 + BREAK_Q * q, rings, MULT.break);
}

function closeOpening(b: Bout, t: number): void {
  const o = b.opening!;
  emit(b, o.kind === 1 ? E_BREAK_END : E_CLOSE, t, o.kind);
  if (o.kind === 2 && o.crits > 0) b.stats.allyCrits += 1;
  b.opening = null;
  b.lastCloseAt = t;
  recoverThen(b, t);
}

function finisherMiss(b: Bout, t: number): void {
  const f = b.finisher!;
  f.done = true;
  b.stats.finisher = 0;
  emit(b, E_FINISH, t, 0, 0, 0);
  endBout(b, t + KO_FREEZE, 1);
}

/** Process every scheduled transition up to and including time `to`. */
export function advance(b: Bout, to: number): void {
  let guard = 0;
  while (b.phase !== P_DONE && guard++ < 10000) {
    const tt = nextTransition(b);
    if (tt > to) break;
    b.t = Math.max(b.t, tt);
    if (b.phase === P_LEAD) onLead(b);
    else if (b.phase === P_ATTACK) {
      const a = b.attack!;
      punish(b, tt, laneAt(a, b.step, tt), 1);
    } else if (b.phase === P_OPEN) closeOpening(b, tt);
    else if (b.phase === P_FINISHER) finisherMiss(b, tt);
  }
  if (to > b.t) b.t = to;
}

// ---- input ----------------------------------------------------------------

function counterPress(b: Bout, t: number, lane: number): void {
  const a = b.attack!;
  if (t < a.T) {
    // Feint prefix or Robo show phase: tapping the feint lane greys it; anything else is early.
    if (a.feintLane >= 0 && t >= a.feintT0 && t < a.feintT1 && lane === a.feintLane) {
      b.greyUntil[lane] = t + 4 * b.q;
      emit(b, E_GREY, t, lane, a.feintSafe ? 1 : 0);
      return;
    }
    emit(b, E_EARLY, t, lane);
    return;
  }
  if (a.hazardLane === lane && !a.hazardPopped && t >= a.hazardT0 && t < a.hazardT1) {
    a.hazardPopped = true;
    b.stats.hazards += 1;
    const v = score(b, PTS.hazard, 100, 100);
    addGauge(b, GAIN.hazard, t);
    emit(b, E_POP, t, lane, 0, v);
    return;
  }
  const step = a.steps[b.step];
  const want = laneAt(a, b.step, t);
  if (lane !== want) {
    punish(b, t, want, a.decoys.indexOf(lane) >= 0 ? 2 : 0);
    return;
  }
  if (!step.graded) {
    emit(b, E_LOCK, t, lane, b.step);
    b.step += 1;
    return;
  }
  const tj = t - b.cfg.offset;
  const err = tj - step.I;
  if (err < -(a.G + BUFFER_MS)) {
    emit(b, E_EARLY, t, lane);
    return;
  }
  const perfect = err >= -PERFECT_EARLY && err <= PERFECT_LATE;
  if (!perfect && err > COYOTE_MS) {
    punish(b, t, want, 1);
    return;
  }
  b.stats.counterErr.push(err);
  let v: number;
  if (perfect) {
    b.stats.perfect += 1;
    v = score(b, PTS.perfect, 100, 100);
    addGauge(b, GAIN.perfect, t);
    emit(b, E_PERFECT, t, lane, err, v);
  } else {
    b.stats.good += 1;
    v = score(b, PTS.good, 100, 100);
    addGauge(b, GAIN.good, t);
    emit(b, E_GOOD, t, lane, err, v);
  }
  chainUp(b, t);
  if (b.step + 1 < a.steps.length) {
    b.step += 1;
    return;
  }
  const I = step.I;
  attackResolved(b);
  openOpening(b, I, perfect);
}

function guardTap(b: Bout, t: number): void {
  b.stats.clank += 1;
  const taps = b.guardTaps.filter((x) => t - x < GUARD_WINDOW_MS);
  taps.push(t);
  b.guardTaps = taps;
  emit(b, E_CLANK, t, taps.length);
  if (taps.length >= GUARD_TAPS) {
    b.guardTaps = [];
    b.stats.guard += 1;
    chainReset(b, t);
    addGauge(b, -LOSS.guard, t);
    b.lockUntil = t + GUARD_SWAT_MS + DIZZY_MS;
    emit(b, E_GUARD_COUNTER, t);
  }
}

function slotOf(o: Opening, t: number): number {
  for (let j = 0; j < o.rings.length; j++) {
    const hi = j + 1 < o.rings.length ? Math.floor((o.rings[j] + o.rings[j + 1]) / 2) : o.end;
    if (t < hi) return j;
  }
  return o.rings.length - 1;
}

function padDown(b: Bout, t: number): void {
  if (t < b.lockUntil) return;
  if (b.phase === P_FINISHER) {
    b.padDownAt = t;
    return;
  }
  const o = b.opening;
  if (b.phase === P_OPEN && o && t < o.start) return; // counter landed early; opening not open yet
  if (b.phase === P_OPEN && o && t >= o.start && t < o.end) {
    b.padDownAt = t;
    b.padOpening = o.id;
    if (o.heavyDone) return;
    const j = slotOf(o, t);
    if (o.used[j] !== 0) {
      if (o.kind === 1) return; // Break: extra taps are just ignored
      guardTap(b, t);
      return;
    }
    const tj = t - b.cfg.offset;
    const crit = Math.abs(tj - o.rings[j]) <= RING_CRIT_MS;
    const pct = comboPct(b.carry.chain);
    if (crit) {
      o.used[j] = 2;
      o.crits += 1;
      b.stats.crit += 1;
      const v = score(b, PTS.crit, pct, o.mult);
      emit(b, E_CRIT, t, j, pct, v);
      chainUp(b, t);
      if (o.kind !== 1) addGauge(b, GAIN.crit, t);
    } else {
      o.used[j] = 1;
      b.stats.hit += 1;
      const v = score(b, PTS.hit, pct, o.mult);
      emit(b, E_HIT, t, j, pct, v);
      if (o.kind !== 1) addGauge(b, GAIN.hit, t);
    }
    if (o.kind !== 1 && breakReady(b)) {
      emit(b, E_CLOSE, t, o.kind);
      b.opening = null;
      startBreak(b, t);
    }
    return;
  }
  if (t - b.lastCloseAt < CLOSE_GRACE_MS && t >= b.lastCloseAt) return;
  b.padDownAt = t;
  b.padOpening = -1;
  guardTap(b, t);
}

function padUp(b: Bout, t: number): void {
  const down = b.padDownAt;
  b.padDownAt = -1;
  if (down < 0) return;
  const held = t - down;
  if (b.phase === P_FINISHER && b.finisher && !b.finisher.done) {
    if (held < FINISHER_HOLD_MS) return;
    const f = b.finisher;
    const err = t - b.cfg.offset - f.ring;
    const abs = Math.abs(err);
    if (abs > FINISHER_GOOD_MS) {
      if (err < 0) return; // released way early: hold again
      finisherMiss(b, t);
      return;
    }
    f.done = true;
    const perfect = abs <= FINISHER_PERFECT_MS;
    const v = score(b, perfect ? PTS.finisherPerfect : PTS.finisherGood, 100, 100);
    b.stats.finisher = perfect ? 2 : 1;
    emit(b, E_FINISH, t, perfect ? 2 : 1, err, v);
    endBout(b, t + FINISHER_FREEZE + KO_FREEZE, 1);
    return;
  }
  const o = b.opening;
  if (b.phase !== P_OPEN || !o || o.kind === 1 || o.id !== b.padOpening || o.heavyDone) return;
  if (held < 4 * b.q || t >= o.end) return;
  o.heavyDone = true;
  for (let j = 0; j < o.used.length; j++) if (o.used[j] === 0) o.used[j] = 1;
  const last = o.rings[o.rings.length - 1];
  const pct = comboPct(b.carry.chain);
  if (Math.abs(t - b.cfg.offset - last) <= HEAVY_WINDOW_MS) {
    b.stats.heavy += 1;
    const v = score(b, PTS.heavy, pct, o.mult);
    emit(b, E_HEAVY, t, 0, pct, v);
    chainUp(b, t);
    addGauge(b, GAIN.heavy, t);
    if (breakReady(b)) {
      emit(b, E_CLOSE, t, o.kind);
      b.opening = null;
      startBreak(b, t);
    }
  } else {
    b.stats.hit += 1;
    const v = score(b, PTS.hit, pct, o.mult);
    emit(b, E_HEAVY_MISS, t, 0, pct, v);
    addGauge(b, GAIN.hit, t);
  }
}

/** Apply one logged input. Inputs must arrive in non-decreasing t. */
export function input(b: Bout, ev: InputEvent): void {
  const t = Math.max(Math.trunc(ev.t), b.t);
  b.log.push({ t, k: ev.k, ...(ev.a !== undefined ? { a: ev.a } : {}) });
  advance(b, t);
  if (b.phase === P_DONE) return;
  switch (ev.k) {
    case IN_TARGET: {
      const lane = ev.a ?? -1;
      if (lane < 0 || lane > 2 || t < b.lockUntil || t < b.greyUntil[lane]) return;
      if (b.phase === P_ATTACK) counterPress(b, t, lane);
      return;
    }
    case IN_PAD_DOWN: padDown(b, t); return;
    case IN_PAD_UP: padUp(b, t); return;
    case IN_PAUSE:
      b.pauses += 1;
      // A third pause in a bout paintballs it: it ends here and its damage counts.
      if (b.pauses >= 3) endBout(b, t, 2);
      return;
    case IN_RESUME: return;
    case IN_END: endBout(b, t, 2); return;
    case IN_ALLY: if (b.cfg.team) b.pendingAlly = 1; return;
    case IN_SURGE:
      emit(b, E_SURGE, t);
      addGauge(b, GAIN.surge, t);
      return;
    case IN_RESCUE: addGauge(b, GAIN.rescue, t); return;
    default:
  }
}

/** Run a whole bout from a log (the server replay does exactly this). */
export function replayBout(cfg: BoutConfig, log: readonly InputEvent[], simMs?: number): Bout {
  const b = createBout(cfg);
  for (const ev of log) input(b, ev);
  advance(b, simMs ?? Number.MAX_SAFE_INTEGER - 1);
  return b;
}

/** Integer points for a bout: one floor, rate in basis points (10000 = 1.0). */
export function scoreBout(b: Bout, rateBp = 10000): number {
  return Math.floor((b.sum * rateBp) / (UNIT * 10000));
}

/** Carry for the next bout (combo, gauge, Breaks, bonus attacks, first-instance flags). */
export function carryOut(b: Bout): Carry {
  return cloneCarry(b.carry);
}

/** Median signed counter error (ms) for the results readout ("You were 42 ms early"). */
export function medianError(errs: readonly number[]): number {
  if (errs.length === 0) return 0;
  const s = [...errs].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
