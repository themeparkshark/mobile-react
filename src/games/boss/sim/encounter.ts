/**
 * Boss Brawl encounter sim (SIM_VERSION 8): pure, integer-only, deterministic.
 *
 *   const b = createBout({ boss, seed, bout: 0, carry, walk, offset, variant, novice });
 *   input(b, { t, k: IN_TARGET, a: lane });   // taps, stamped in bout simT
 *   advance(b, simT);                         // timeouts, openings, the end
 *   b.events                                  // presentation events, in order
 *   scoreBout(b)                              // integer points, one floor
 *
 * Two verbs (design v7 4.1): tap a lane (counter at the impact, POP the lit
 * sucker on the pinned limb, pop the foam bubble, get up) and hold the float
 * (Easy Slam). The boss can hurt you: a real tell landing costs a Grit fin;
 * 0 fins is a Knockdown (8 taps in 1.5 s to get up), a 2nd Knockdown or a
 * failed get-up is a TKO.
 *
 * Time only moves forward through `advance` and `input`, and every transition
 * happens at its own scheduled integer time (never at a frame time), so the
 * same input log gives the same bout on the phone, in node and in the server
 * replay (sim-runner, {game: 'boss', sim_version: 8}). No floats, Math.random,
 * Date or easing in here.
 *
 * Beat-absorbed freezes (Break, Final Pop, KO): sim time is music time. The
 * sim leaves the freeze as a gap and starts the next thing on the next step,
 * so every later onset stays on the music grid; the client freezes only its
 * cosmetic clock (rig, particles, camera) for the same ms.
 */
import { mixSeed, createRng, type Rng } from '../../../gamekit/core/rng';
import {
  ANCHOR_STARS_MAX, ATTACKS, BONUS_ATTACK_CAP, BOON_FIN, BOON_LOOK, BOON_NONE, BOON_POLISH, BOON_TIDE, BREAK_FREEZE,
  BREAK_MAX, BREAK_Q, BREAK_RING_Q, BUFFER_MS, CLOSE_GRACE_MS, COMBINED_CAP, COYOTE_MS, DEBOUNCE_MS, DIZZY_MS, FINAL_FREEZE,
  FINAL_Q, GAIN, GAUGE_MAX, GETUP_MIN_GAP, GETUP_MS, GETUP_TAPS, GRIT, GRIT_EXTRA, GUARD_SWAT_MS, GUARD_TAPS,
  GUARD_WARN_TAPS, GUARD_WINDOW_MS, IN_ALLY, IN_BOON, IN_END, IN_GETUP, IN_PAD_DOWN, IN_PAD_UP, IN_PAUSE, IN_RESCUE,
  IN_RESUME, IN_SURGE, IN_TARGET, KO_FREEZE, LEAD_Q, LOOK_Q, LOOK_WALK_Q, LOSS, MULT, NOVICE_GRIT_FLOOR, OFFSET_CLAMP,
  OPENING_Q, READ_GRACE_MS, PERFECT_EARLY, PERFECT_LATE, POP_LONG_MS, POP_MS, POP_PERFECT_MS, PTS, PUNISH_MS, RECOVER_Q, RINGS, STEP,
  UNIT, comboPct, decayChain, type BossId,
} from './constants';
import {
  VARIANT_A0, boonOffer, freshRoundFlags, laneAt, planAttack, popLanes, type Attack, type RoundFlags,
} from './patterns';
import { rngU32 } from '../../../gamekit/core/rng';

// Presentation events (b.events). a/b/v meanings noted per code.
export const E_FAKE = 1; //          a lane, b safe(1)
export const E_TELL = 2; //          a lane, b step
export const E_SHOW = 3; //          a icon (3+ decoy), b index
export const E_SHUFFLE = 4;
export const E_BUBBLE = 5; //        a lane (foam bubble rides in)
export const E_BUBBLE_POP = 6; //    a lane, v points
export const E_GREY = 7; //          a lane (first fake tapped: greyed, safe)
export const E_EARLY = 8; //         a lane (too early, soft tick)
export const E_LOCK = 9; //          a lane (Robo node locked, untimed)
export const E_PERFECT = 10; //      a lane, b error ms (signed), v points
export const E_GOOD = 11; //         a lane, b error ms, v points
export const E_PUNISH = 12; //       a lane, b reason (0 wrong, 1 late, 2 decoy)
export const E_SAFE_MISS = 13; //    a lane, b reason
export const E_OPEN = 14; //         a kind (0 pin, 1 break, 2 ally, 3 final), b slot count
export const E_HIT = 15; //          a slot, b lane, v points
export const E_POP = 16; //          a slot, b lane, v points
export const E_CLANK = 17; //        a stray count, b reason (0 unlit lane, 1 second tap in a slot, 2 boss guarded)
export const E_GUARD_COUNTER = 18; // DIZZY
export const E_SLAM = 19; //         v points (Easy Slam)
export const E_SLAM_CANCEL = 20;
export const E_CLOSE = 21; //        a kind
export const E_BREAK = 22; //        a break number (1..3), v points
export const E_BREAK_END = 23;
export const E_FINAL_READY = 24; //  a lane, b ring time
export const E_FINAL = 25; //        a grade (3 perfect pop, 2 pop, 1 hit, 0 miss), b lane, v points
export const E_END = 26; //          a reason (0 attacks done, 1 Final Pop, 2 paintball, 3 got up, 4 TKO)
export const E_TIER = 27; //         a combo pct
export const E_GAUGE_HOT = 28;
export const E_ALLY_ARRIVE = 29;
export const E_SURGE = 30;
export const E_COMBO_RESET = 31; //  a chain lost
export const E_POP_PERFECT = 32; //  a slot, b lane, v points
export const E_GUARD_WARN = 33;
export const E_GRIT = 35; //         a fins left, b fins max
export const E_KNOCKDOWN = 36; //    a knockdowns this round
export const E_GETUP_TAP = 37; //    a taps so far
export const E_GETUP = 38;
export const E_TKO = 39;
export const E_STAR = 40; //         a anchor stars lit
export const E_STAR_OUT = 41; //     a anchor stars lit
export const E_SKILL_STAR = 42; //   v points
export const E_FAKE_TAP = 43; //     a lane (a fake bitten: SPLASHED, no Grit)
export const E_BOON = 45; //         a boon id
export const E_DECAY = 46; //        a chain before, b chain after (bout start, design 5.2)

export const END_ATTACKS = 0;
export const END_FINAL = 1;
export const END_PAINTBALL = 2;
export const END_GOT_UP = 3;
export const END_TKO = 4;

/** Opening kinds. */
export const O_PIN = 0;
export const O_BREAK = 1;
export const O_ALLY = 2;
export const O_FINAL = 3;

export interface SimEvent { code: number; t: number; a: number; b: number; v: number }

export interface Carry {
  chain: number;
  maxChain: number;
  gauge: number;
  breaks: number;
  bonusAttacks: number;
  flags: RoundFlags;
  knockdowns: number;
  tko: boolean;
  /** Anchor Stars lit for the Final Pop (bout 3). */
  stars: number;
  finalDone: boolean;
  skillStar: boolean;
}

export function freshCarry(): Carry {
  return {
    chain: 0, maxChain: 0, gauge: 0, breaks: 0, bonusAttacks: 0, flags: freshRoundFlags(), knockdowns: 0, tko: false,
    stars: 0, finalDone: false, skillStar: false,
  };
}

export interface BoutConfig {
  boss: BossId;
  seed: number;
  bout: number;
  carry?: Carry;
  walk?: boolean;
  offset?: number;
  variant?: number;
  /** Solo players never get ally openings; the team layer sets this (parked). */
  team?: boolean;
  /** One of the player's first 3 rounds vs this boss: Grit cannot drop below 1 in bout 1. */
  novice?: boolean;
}

export interface Opening {
  id: number;
  kind: number;
  start: number;
  end: number;
  /** Ring close time per slot. */
  rings: number[];
  /** Lit lane per slot (Break: the lane whose ring closes; the other two are lit too). */
  lanes: number[];
  /** 0 open, 1 hit, 2 pop, 3 perfect pop, 4 slammed, 5 missed (final). */
  used: number[];
  mult: number;
  /** Index of the Final Pop slot, -1 when none. */
  finalIdx: number;
  slamDone: boolean;
  crits: number;
}

export interface InputEvent { t: number; k: number; a?: number }

export interface BoutStats {
  perfect: number; good: number; popPerfect: number; pop: number; hit: number; slam: number; clank: number; punish: number;
  guard: number; breaks: number; hazards: number; allyCrits: number; final: number; fakes: number; knockdown: number;
  getup: number; counterErr: number[]; popErr: number[];
  /** Best chain run inside this bout (counted from 0 at the bout start, design 5.2). */
  bestChain: number;
  /** Current run inside this bout. */
  run: number;
}

export interface Down { start: number; open: number; end: number; taps: number; last: number }

/** The bout's foam bubble: blocks its buoy until tapped once (design 6.4). */
export interface Bubble { lane: number; t0: number; t1: number; popped: boolean }

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
  strays: number[];
  warned: boolean;
  padDownAt: number;
  padOpening: number;
  pendingAlly: number;
  pauses: number;
  sum: number;
  stats: BoutStats;
  events: SimEvent[];
  endT: number;
  endReason: number;
  log: InputEvent[];
  gaugeHot: boolean;
  grit: number;
  gritMax: number;
  boon: number;
  /** Look-ahead in steps before each slot's ring close. */
  look: number;
  popMs: number;
  /** Attack index in bout 2 that carries the foam bubble (-1 none). */
  bubbleNo: number;
  down: Down | null;
  bubble: Bubble | null;
  lastTap: number[];
  lastLane: number;
}

export const UNIT_POINTS = UNIT;

export const P_LEAD = 0;
export const P_ATTACK = 1;
export const P_OPEN = 2;
export const P_DOWN = 3;
export const P_DONE = 4;
/** Kept for older call sites: the standalone Final Pop is an O_FINAL opening. */
export const P_FINISHER = -1;

/** Flop before the get-up window opens (taps ignored while the shark lands). */
export const DOWN_FLOP_MS = 400;

function clampOffset(o: number): number {
  return o > OFFSET_CLAMP ? OFFSET_CLAMP : o < -OFFSET_CLAMP ? -OFFSET_CLAMP : Math.trunc(o);
}

/** Next step-grid point at or after t. */
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
  const q = STEP[cfg.boss][bout];
  const walk = !!cfg.walk;
  const rng = createRng(boutSeed(cfg.seed, bout));
  // The bout's one foam bubble rides on one of bout 2's plain slams (attack 1 or 3), Kraken only.
  const bubbleNo = cfg.boss === 'kraken' && bout === 1 ? 1 + 2 * (rngU32(rng) % 2) : -1;
  // Combo decay (design 5.2): every bout after the first starts one tier lower.
  const chainIn = carry.chain;
  if (bout > 0) carry.chain = decayChain(carry.chain);
  const b: Bout = {
    cfg: {
      boss: cfg.boss, seed: cfg.seed >>> 0, bout, walk, offset: clampOffset(cfg.offset ?? 0), variant: cfg.variant ?? 0,
      team: !!cfg.team, novice: !!cfg.novice,
    },
    q, t: 0, phase: P_LEAD, rng, carry,
    attacksTotal: ATTACKS[bout] + (bout === 2 ? Math.min(BONUS_ATTACK_CAP, carry.bonusAttacks) : 0),
    attacksDone: 0, attack: null, step: 0, opening: null, openingSeq: 0, lastCloseAt: -1e9, lockUntil: 0,
    nextAt: LEAD_Q * q, greyUntil: [0, 0, 0], strays: [], warned: false, padDownAt: -1, padOpening: -1,
    pendingAlly: 0, pauses: 0, sum: 0,
    stats: {
      perfect: 0, good: 0, popPerfect: 0, pop: 0, hit: 0, slam: 0, clank: 0, punish: 0, guard: 0, breaks: 0, hazards: 0,
      allyCrits: 0, final: -1, fakes: 0, knockdown: 0, getup: 0, counterErr: [], popErr: [], bestChain: 0, run: 0,
    },
    events: [], endT: -1, endReason: -1, log: [], gaugeHot: carry.gauge >= 800,
    grit: GRIT, gritMax: GRIT, boon: BOON_NONE, look: walk ? LOOK_WALK_Q : LOOK_Q, popMs: POP_MS, bubbleNo,
    down: null, bubble: null, lastTap: [-1e9, -1e9, -1e9], lastLane: -1,
  };
  if (bout > 0 && chainIn > 0) emit(b, E_DECAY, 0, chainIn, carry.chain);
  return b;
}

function emit(b: Bout, code: number, t: number, a = 0, bb = 0, v = 0): void {
  b.events.push({ code, t, a, b: bb, v });
}

/** Points in pct x pct units; the combined combo x mult is capped at 250% (design 5.2). */
function score(b: Bout, base: number, pct: number, mult: number): number {
  const m = pct * mult;
  const units = base * (m > COMBINED_CAP ? COMBINED_CAP : m);
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
  const st = b.stats;
  st.run += 1;
  if (st.run > st.bestChain) st.bestChain = st.run;
  const after = comboPct(c.chain);
  if (after !== before) emit(b, E_TIER, t, after);
}

function chainReset(b: Bout, t: number): void {
  if (b.carry.chain > 0) emit(b, E_COMBO_RESET, t, b.carry.chain);
  b.carry.chain = 0;
  b.stats.run = 0;
}

function breakReady(b: Bout): boolean {
  return b.carry.gauge >= GAUGE_MAX && b.carry.breaks < BREAK_MAX;
}

/** Guard Counter is off in bout 1 and on A0 rounds (design 4.8). */
function guardOn(b: Bout): boolean {
  return b.cfg.bout > 0 && b.cfg.variant !== VARIANT_A0;
}

// ---- scheduling -----------------------------------------------------------

function slamAt(o: Opening): number {
  const last = o.finalIdx >= 0 ? o.finalIdx - 1 : o.rings.length - 1;
  return last >= 0 ? o.rings[last] : -1;
}

function slamArmed(b: Bout, o: Opening): boolean {
  return b.padOpening === o.id && b.padDownAt >= 0 && !o.slamDone && o.kind !== O_FINAL && slamAt(o) >= 0;
}

/** Time of the next scheduled transition in the current phase. */
function nextTransition(b: Bout): number {
  switch (b.phase) {
    case P_LEAD: return b.nextAt;
    case P_ATTACK: {
      const a = b.attack!;
      return a.steps[b.step].I + COYOTE_MS + 1;
    }
    case P_OPEN: {
      const o = b.opening!;
      if (slamArmed(b, o)) {
        const s = slamAt(o);
        if (s < o.end) return s;
      }
      return o.end;
    }
    case P_DOWN: return b.down!.end;
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
    variant: b.cfg.variant, rng: b.rng, flags: b.carry.flags, bubble: b.attacksDone === b.bubbleNo,
  });
  b.attack = a;
  b.step = 0;
  b.phase = P_ATTACK;
  if (a.feintLane >= 0) emit(b, E_FAKE, a.feintT0, a.feintLane, a.feintSafe ? 1 : 0);
  for (let i = 0; i < a.show.length; i++) emit(b, E_SHOW, a.showStart + i * 4 * b.q, a.show[i], i);
  if (a.shuffleAt >= 0) emit(b, E_SHUFFLE, a.shuffleAt);
  if (a.hazardLane >= 0) {
    b.bubble = { lane: a.hazardLane, t0: a.hazardT0, t1: a.hazardT1, popped: false };
    emit(b, E_BUBBLE, a.hazardT0, a.hazardLane);
  }
  emit(b, E_TELL, a.T, laneAt(a, 0, a.T), 0);
  for (let i = 0; i < a.swaps.length; i += 2) emit(b, E_TELL, a.swaps[i], a.swaps[i + 1], 0);
  for (let k = 1; k < a.steps.length; k++) {
    if (a.steps[k].I !== a.steps[k - 1].I) emit(b, E_TELL, Math.max(a.T, a.steps[k].I - a.W), a.steps[k].lane, k);
  }
}

function endBout(b: Bout, t: number, reason: number): void {
  b.phase = P_DONE;
  b.endT = t;
  b.endReason = reason;
  b.attack = null;
  b.opening = null;
  b.down = null;
  emit(b, E_END, t, reason);
}

function isLastAttack(b: Bout): boolean {
  return b.cfg.bout === 2 && b.attacksDone >= b.attacksTotal && !b.carry.finalDone;
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
  if (b.cfg.bout === 2 && !b.carry.finalDone) {
    // The last attack was not converted: the winded boss still offers the Final Pop.
    openFinal(b, t);
    return;
  }
  endBout(b, t, END_ATTACKS);
}

function attackResolved(b: Bout): void {
  b.attacksDone += 1;
  b.attack = null;
}

function loseGrit(b: Bout, t: number): boolean {
  const floor = b.cfg.novice && b.cfg.bout === 0 ? NOVICE_GRIT_FLOOR : 0;
  if (b.grit > floor) b.grit -= 1;
  emit(b, E_GRIT, t, b.grit, b.gritMax);
  return b.grit <= 0;
}

function knockdown(b: Bout, t: number): void {
  const c = b.carry;
  c.knockdowns += 1;
  b.stats.knockdown += 1;
  b.attack = null;
  b.opening = null;
  emit(b, E_KNOCKDOWN, t, c.knockdowns);
  if (c.knockdowns >= 2) {
    c.tko = true;
    emit(b, E_TKO, t);
    endBout(b, t + PUNISH_MS, END_TKO);
    return;
  }
  b.phase = P_DOWN;
  b.down = { start: t, open: t + DOWN_FLOP_MS, end: t + DOWN_FLOP_MS + GETUP_MS, taps: 0, last: -1e9 };
}

function punish(b: Bout, t: number, lane: number, reason: number): void {
  const a = b.attack!;
  if (a.safe) {
    // First appearance of a new idea never punishes or costs Grit.
    emit(b, E_SAFE_MISS, t, lane, reason);
    attackResolved(b);
    recoverThen(b, t);
    return;
  }
  b.stats.punish += 1;
  chainReset(b, t);
  addGauge(b, -LOSS.punish, t);
  if (reason === 1) {
    // An unanswered attack drains to the last full 200 segment.
    b.carry.gauge = Math.floor(b.carry.gauge / 200) * 200;
    b.gaugeHot = b.carry.gauge >= 800;
  }
  emit(b, E_PUNISH, t, lane, reason);
  if (b.cfg.bout === 2 && b.carry.stars > 0) {
    b.carry.stars -= 1;
    emit(b, E_STAR_OUT, t, b.carry.stars);
  }
  attackResolved(b);
  if (loseGrit(b, t)) {
    knockdown(b, t);
    return;
  }
  b.lockUntil = t + PUNISH_MS;
  recoverThen(b, t + PUNISH_MS);
}

/** A fake bitten (Kraken wink, Ghost decoy): SPLASHED and combo reset, never Grit. */
function fakeBite(b: Bout, t: number, lane: number): void {
  b.stats.fakes += 1;
  chainReset(b, t);
  b.lockUntil = t + PUNISH_MS;
  emit(b, E_FAKE_TAP, t, lane);
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
  const lanes = popLanes(b.rng, rings.length, -1);
  let end = I + OPENING_Q[bout] * q;
  let finalIdx = -1;
  if (isLastAttack(b)) {
    // The last opening of the round carries one extra slot: the Final Pop (2-beat approach).
    const fr = rings[rings.length - 1] + FINAL_Q * q;
    finalIdx = rings.length;
    rings.push(fr);
    lanes.push(popLanes(b.rng, 1, lanes[lanes.length - 1])[0]);
    end = Math.max(end, fr + 2 * q);
  }
  pushOpening(b, O_PIN, I, end, rings, lanes, MULT.normal, finalIdx);
}

function pushOpening(b: Bout, kind: number, start: number, end: number, rings: number[], lanes: number[], mult: number, finalIdx: number): void {
  b.openingSeq += 1;
  b.opening = {
    id: b.openingSeq, kind, start, end, rings, lanes, used: rings.map(() => 0), mult, finalIdx, slamDone: false, crits: 0,
  };
  b.phase = P_OPEN;
  emit(b, E_OPEN, start, kind, rings.length);
  if (finalIdx >= 0) emit(b, E_FINAL_READY, start, lanes[finalIdx], rings[finalIdx]);
}

function openFinal(b: Bout, t: number): void {
  const q = b.q;
  const ring = t + FINAL_Q * q;
  const lane = popLanes(b.rng, 1, -1)[0];
  pushOpening(b, O_FINAL, t, ring + 2 * q, [ring], [lane], MULT.normal, 0);
}

function openAlly(b: Bout, t: number): void {
  const q = b.q;
  emit(b, E_ALLY_ARRIVE, t);
  const rings = [t + 2 * q, t + 6 * q];
  pushOpening(b, O_ALLY, t, t + 8 * q, rings, popLanes(b.rng, 2, -1), MULT.ally, -1);
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
  // Beat-absorbed freeze: the Break opening starts on the first step after the freeze.
  const d0 = ceilQ(t + BREAK_FREEZE[Math.min(n, 3) - 1], q);
  const rings: number[] = [];
  const lanes: number[] = [];
  const first = rngU32(b.rng) % 3;
  for (let k = 1; k <= BREAK_Q / BREAK_RING_Q; k++) {
    rings.push(d0 + k * BREAK_RING_Q * q);
    lanes.push((first + k - 1) % 3);
  }
  if (b.attack) attackResolved(b);
  pushOpening(b, O_BREAK, d0, d0 + BREAK_Q * q, rings, lanes, MULT.break, -1);
}

function closeOpening(b: Bout, t: number): void {
  const o = b.opening!;
  if (o.finalIdx >= 0 && o.used[o.finalIdx] === 0) {
    // Final Pop missed: the boss shrugs, the round ends.
    o.used[o.finalIdx] = 5;
    b.carry.finalDone = true;
    b.stats.final = 0;
    emit(b, E_FINAL, t, 0, o.lanes[o.finalIdx], 0);
    endBout(b, t + KO_FREEZE, END_FINAL);
    return;
  }
  emit(b, o.kind === O_BREAK ? E_BREAK_END : E_CLOSE, t, o.kind);
  if (o.kind === O_ALLY && o.crits > 0) b.stats.allyCrits += 1;
  b.opening = null;
  b.lastCloseAt = t;
  if (b.padOpening === o.id) b.padOpening = -1;
  recoverThen(b, t);
}

function fireSlam(b: Bout, t: number): void {
  const o = b.opening!;
  o.slamDone = true;
  for (let j = 0; j < o.used.length; j++) if (o.used[j] === 0 && j !== o.finalIdx) o.used[j] = 4;
  b.stats.slam += 1;
  const pct = comboPct(b.carry.chain);
  const v = score(b, PTS.slam, pct, o.mult);
  emit(b, E_SLAM, t, 0, pct, v);
  chainUp(b, t);
  if (o.kind !== O_BREAK) addGauge(b, GAIN.slam, t);
  b.padOpening = -1;
  if (o.kind !== O_BREAK && o.finalIdx < 0 && breakReady(b)) {
    emit(b, E_CLOSE, t, o.kind);
    b.opening = null;
    startBreak(b, t);
  }
}

function getupFail(b: Bout, t: number): void {
  b.carry.tko = true;
  emit(b, E_TKO, t);
  endBout(b, t, END_TKO);
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
    } else if (b.phase === P_OPEN) {
      const o = b.opening!;
      if (slamArmed(b, o) && slamAt(o) === tt && tt < o.end) fireSlam(b, tt);
      else closeOpening(b, tt);
    } else if (b.phase === P_DOWN) getupFail(b, tt);
  }
  if (to > b.t) b.t = to;
}

// ---- input ----------------------------------------------------------------

function strayTap(b: Bout, t: number, reason: number): void {
  b.stats.clank += 1;
  if (reason !== 2) chainReset(b, t);
  const taps = b.strays.filter((x) => t - x < GUARD_WINDOW_MS);
  taps.push(t);
  b.strays = taps;
  emit(b, E_CLANK, t, taps.length, reason);
  if (!guardOn(b)) return;
  if (taps.length >= GUARD_WARN_TAPS && !b.warned) {
    b.warned = true;
    emit(b, E_GUARD_WARN, t);
  }
  if (taps.length >= GUARD_TAPS) {
    b.strays = [];
    b.warned = false;
    b.stats.guard += 1;
    chainReset(b, t);
    addGauge(b, -LOSS.guard, t);
    b.lockUntil = t + GUARD_SWAT_MS + DIZZY_MS;
    emit(b, E_GUARD_COUNTER, t);
  }
}

function counterPress(b: Bout, t: number, lane: number): void {
  const a = b.attack!;
  if (t < a.T) {
    // Fake prefix or Robo show phase: biting the fake; anything else is early.
    if (a.feintLane >= 0 && t >= a.feintT0 && t < a.feintT1 && lane === a.feintLane) {
      if (a.feintSafe) {
        b.greyUntil[lane] = t + 4 * b.q;
        emit(b, E_GREY, t, lane, 1);
      } else fakeBite(b, t, lane);
      return;
    }
    emit(b, E_EARLY, t, lane);
    return;
  }
  if (bubbleOn(b, t, lane)) {
    popBubble(b, t, lane);
    return;
  }
  const step = a.steps[b.step];
  if (t < a.T + READ_GRACE_MS && b.step === 0) {
    emit(b, E_EARLY, t, lane);
    return;
  }
  const want = laneAt(a, b.step, t);
  if (lane !== want) {
    if (a.decoys.indexOf(lane) >= 0) fakeBite(b, t, lane);
    // A wrong lane only lands the tell inside the counter window; earlier it is a soft early tick
    // (a walking bump in the wind-up never costs a fin).
    else if (step.graded && t - b.cfg.offset < step.I - a.G - BUFFER_MS) emit(b, E_EARLY, t, lane);
    else punish(b, t, want, 0);
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
    if (b.cfg.bout === 2 && b.carry.stars < ANCHOR_STARS_MAX) {
      b.carry.stars += 1;
      emit(b, E_STAR, t, b.carry.stars);
    }
    if (a.call && b.step === a.steps.length - 1) {
      b.carry.skillStar = true;
      emit(b, E_SKILL_STAR, t, 0, 0, score(b, PTS.skillStar, 100, 100));
    }
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

function bubbleOn(b: Bout, t: number, lane: number): boolean {
  const u = b.bubble;
  return !!u && !u.popped && u.lane === lane && t >= u.t0 && t < u.t1;
}

function popBubble(b: Bout, t: number, lane: number): void {
  b.bubble!.popped = true;
  if (b.attack && b.attack.hazardLane === lane) b.attack.hazardPopped = true;
  b.stats.hazards += 1;
  const v = score(b, PTS.hazard, 100, 100);
  addGauge(b, GAIN.hazard, t);
  emit(b, E_BUBBLE_POP, t, lane, 0, v);
}

function slotOf(o: Opening, t: number): number {
  for (let j = 0; j < o.rings.length; j++) {
    const hi = j + 1 < o.rings.length ? Math.floor((o.rings[j] + o.rings[j + 1]) / 2) : o.end;
    if (t < hi) return j;
  }
  return o.rings.length - 1;
}

function popTap(b: Bout, o: Opening, t: number, lane: number): void {
  if (t < o.start) return;
  // The bubble (if still afloat) blocks its buoy until popped.
  if (bubbleOn(b, t, lane)) {
    popBubble(b, t, lane);
    return;
  }
  // Lane taps while the float is held for an Easy Slam are ignored.
  if (slamArmed(b, o)) return;
  const j = slotOf(o, t);
  const isBreak = o.kind === O_BREAK;
  if (o.used[j] !== 0) {
    if (isBreak) return; // Break: extra taps are just ignored
    strayTap(b, t, 1);
    return;
  }
  const lit = o.lanes[j] === lane;
  if (!lit && !isBreak) {
    strayTap(b, t, 0);
    return;
  }
  const tj = t - b.cfg.offset;
  const err = tj - o.rings[j];
  const abs = err < 0 ? -err : err;
  const pct = comboPct(b.carry.chain);
  if (j === o.finalIdx) {
    finalPop(b, o, t, lane, abs);
    return;
  }
  if (lit && abs <= POP_PERFECT_MS) {
    o.used[j] = 3;
    o.crits += 1;
    b.stats.popPerfect += 1;
    b.stats.popErr.push(err);
    const v = score(b, PTS.popPerfect, pct, o.mult);
    emit(b, E_POP_PERFECT, t, j, lane, v);
    chainUp(b, t);
    if (!isBreak) addGauge(b, GAIN.popPerfect, t);
  } else if (lit && abs <= b.popMs) {
    o.used[j] = 2;
    o.crits += 1;
    b.stats.pop += 1;
    b.stats.popErr.push(err);
    const v = score(b, PTS.pop, pct, o.mult);
    emit(b, E_POP, t, j, lane, v);
    chainUp(b, t);
    if (!isBreak) addGauge(b, GAIN.pop, t);
  } else {
    o.used[j] = 1;
    b.stats.hit += 1;
    const v = score(b, PTS.hit, pct, o.mult);
    emit(b, E_HIT, t, j, lane, v);
    if (!isBreak) addGauge(b, GAIN.hit, t);
  }
  if (!isBreak && o.finalIdx < 0 && breakReady(b)) {
    emit(b, E_CLOSE, t, o.kind);
    b.opening = null;
    startBreak(b, t);
  }
}

function finalPop(b: Bout, o: Opening, t: number, lane: number, abs: number): void {
  const c = b.carry;
  const grade = abs <= POP_PERFECT_MS ? 3 : abs <= b.popMs ? 2 : 1;
  const base = grade === 3 ? PTS.finalPerfect : grade === 2 ? PTS.finalPop : PTS.finalHit;
  o.used[o.finalIdx] = grade === 3 ? 3 : grade === 2 ? 2 : 1;
  c.finalDone = true;
  b.stats.final = grade;
  const v = score(b, base, 100 + 25 * c.stars, 100);
  emit(b, E_FINAL, t, grade, lane, v);
  if (grade >= 2) chainUp(b, t);
  endBout(b, t + (grade >= 2 ? FINAL_FREEZE : 0) + KO_FREEZE, END_FINAL);
}

function laneTap(b: Bout, t: number, lane: number): void {
  if (t - b.lastTap[lane] < DEBOUNCE_MS) return; // one bump, not two taps
  b.lastTap[lane] = t;
  if (b.phase === P_ATTACK) {
    counterPress(b, t, lane);
    return;
  }
  if (b.phase === P_OPEN) {
    popTap(b, b.opening!, t, lane);
    return;
  }
  if (b.phase === P_LEAD) {
    // Between attacks the boss is guarded; taps in the close grace never count.
    if (t - b.lastCloseAt < CLOSE_GRACE_MS && t >= b.lastCloseAt) return;
    if (b.attacksDone === 0) return;
    strayTap(b, t, 2);
  }
}

function padDown(b: Bout, t: number): void {
  const o = b.opening;
  if (b.phase !== P_OPEN || !o || t < o.start || o.slamDone || o.kind === O_FINAL) return;
  b.padDownAt = t;
  // Easy Slam arms only when the float goes down before the first ring closes.
  const first = o.rings[0];
  if (t - b.cfg.offset <= first && o.used[0] === 0) b.padOpening = o.id;
}

function padUp(b: Bout, t: number): void {
  const down = b.padDownAt;
  b.padDownAt = -1;
  if (down < 0) return;
  const o = b.opening;
  if (o && b.padOpening === o.id && !o.slamDone) emit(b, E_SLAM_CANCEL, t);
  b.padOpening = -1;
}

function getupTap(b: Bout, t: number): void {
  const d = b.down!;
  if (t < d.open || t - d.last < GETUP_MIN_GAP) return;
  d.last = t;
  d.taps += 1;
  emit(b, E_GETUP_TAP, t, d.taps);
  if (d.taps >= GETUP_TAPS) {
    b.stats.getup += 1;
    emit(b, E_GETUP, t);
    endBout(b, t, END_GOT_UP);
  }
}

function applyBoon(b: Bout, t: number, id: number): void {
  if (b.boon !== BOON_NONE || t > 0 || b.cfg.bout === 0) return;
  const offer = boonOffer(b.cfg.seed, b.cfg.bout);
  if (offer[0] !== id && offer[1] !== id) return;
  b.boon = id;
  if (id === BOON_TIDE) addGauge(b, GAIN.tide, t);
  else if (id === BOON_FIN) {
    b.grit = GRIT_EXTRA;
    b.gritMax = GRIT_EXTRA;
  } else if (id === BOON_LOOK) {
    b.look = LOOK_WALK_Q;
    b.popMs = POP_LONG_MS;
  } else if (id === BOON_POLISH) {
    if (b.carry.stars < ANCHOR_STARS_MAX) b.carry.stars += 1;
  }
  emit(b, E_BOON, t, id);
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
      if (lane < 0 || lane > 2 || b.phase === P_DOWN || t < b.lockUntil || t < b.greyUntil[lane]) return;
      laneTap(b, t, lane);
      return;
    }
    case IN_GETUP:
      if (b.phase === P_DOWN) getupTap(b, t);
      return;
    case IN_PAD_DOWN: if (t >= b.lockUntil) padDown(b, t); return;
    case IN_PAD_UP: padUp(b, t); return;
    case IN_BOON: applyBoon(b, t, ev.a ?? -1); return;
    case IN_PAUSE:
      b.pauses += 1;
      // A third pause in a bout paintballs it: it ends here and its damage counts.
      if (b.pauses >= 3) endBout(b, t, END_PAINTBALL);
      return;
    case IN_RESUME: return;
    case IN_END: endBout(b, t, END_PAINTBALL); return;
    case IN_ALLY: if (b.cfg.team) b.pendingAlly = 1; return;
    case IN_SURGE:
      if (!b.cfg.team) return;
      emit(b, E_SURGE, t);
      addGauge(b, GAIN.surge, t);
      return;
    case IN_RESCUE: if (b.cfg.team) addGauge(b, GAIN.rescue, t); return;
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

/** Carry for the next bout (combo, gauge, Breaks, bonus attacks, Knockdowns, stars, first-instance flags). */
export function carryOut(b: Bout): Carry {
  return cloneCarry(b.carry);
}

/** Median signed error (ms) for the results readout ("You were 42 ms early"). */
export function medianError(errs: readonly number[]): number {
  if (errs.length === 0) return 0;
  const s = [...errs].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

/** Look-ahead lead (ms) before each slot's ring close for this bout. */
export function lookAheadMs(b: Bout): number {
  return b.look * b.q;
}
