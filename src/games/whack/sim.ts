/**
 * sim.ts: the Bonk Rush resolver (design 4, 5). One pure state machine runs
 * on the UI thread during play and in node / the server replay afterwards.
 *
 *   const s = createSim(timeline, carry);
 *   simAdvance(s, ms);      // whole game-time ms, 1 ms ticks, event exact
 *   simTap(s, hole);        // resolves at s.t, logs [t, hole, flags]
 *   simSwipe(s, hole);      // clears a landed splat
 *   simResult(s);
 *
 * Game time is an integer ms counter that only moves through simAdvance. The
 * runtime scales wall time into it (slow-mo, resume ease-in, global freezes),
 * which never changes an outcome: the tap log is stamped in game time, so the
 * replay (replayBurst) reproduces the run exactly.
 *
 * Walk-safe rules live here too: Auto Look-Up freezes the clock before any
 * target can escape a disengaged player, idle never decays anything, a single
 * whiff costs nothing, and movement is not an input at all.
 */

import { mixSeed } from '../../gamekit/core/rng';
import type { Timeline } from './timeline';
import { A_CANDY, A_FADE, A_INK, A_SCAN } from './timeline';
import {
  ANGLER_LOCK_MS, BRUISER_HP, BUTTER_WINDOW_MS, COIN_ANGLER, COIN_BRUISER, COIN_BUTTER, COIN_BY_GRADE, COIN_ESCAPE,
  COIN_GOLDEN, EARLY_GRACE_MS, ENGAGED_MS, FEVER_MS, GOOD_FRAC, G_CRIT, G_GOOD, G_LATE, G_QUICK, HELMET_EXT_MS,
  K_ANGLER, K_BRUISER, K_FINN, K_GOLDEN, K_HELMET, K_PUFFER, K_SPRINTER, K_TENTACLE, K_TWIN, LOOKUP_FRAC,
  LOOKUP_IDLE_MS, MAX_TAPS, METER_ANGLER, METER_BUTTER, METER_BY_GRADE, METER_CRIT, METER_DOUBLE, METER_GOLDEN,
  METER_SPRINTER, MULT_CAP, PTS_ANGLER, PTS_BOSS_DEFEAT, PTS_BRUISER_HIT, PTS_BRUISER_KO, PTS_COIN_BUBBLE, PTS_CRIT,
  PTS_DOUBLE, PTS_FINN, PTS_GOLDEN, PTS_HELMET_POP, PTS_LAP_PER_SEC, PTS_PUFFER_POKE, PTS_SPRINTER, PTS_TENTACLE,
  QUICK_FRAC, REBONK_IGNORE_MS, TIER_AT, TIER_MULT, TWIN_WINDOW_MS,
} from './waves';

// Hole phases
export const P_EMPTY = 0;
export const P_TELL = 1;
export const P_UP = 2;
export const P_BONKED = 3;
export const P_ESCAPE = 4;

// Splat states per hole
export const SPLAT_NONE = 0;
export const SPLAT_TELL = 1;
export const SPLAT_DOWN = 2;

// Tap flags
export const TAP_RESUME = 1;
export const TAP_SWIPE = 2;

// Sim events (to the runtime through the event ring): [kind, a, b, c, t]
export const E_TELL = 1; //          hole, kind, eventId
export const E_EMERGE = 2; //        hole, kind, eventId
export const E_HIT = 3; //           hole, grade + 10 * kind, points
export const E_WHIFF = 4; //         hole
export const E_BUTTER = 5; //        hole
export const E_DECOY = 6; //         hole, kind, points
export const E_ESCAPE = 7; //        hole, kind, engaged(0/1)
export const E_HELMET = 8; //        hole, points
export const E_DOUBLE = 9; //        hole, otherHole, points
export const E_TIER = 10; //         tier
export const E_BREAK = 11; //        streakBefore
export const E_FEVER = 12; //        1 start / 0 end
export const E_FREEZE = 13; //       hole that triggered
export const E_RESUME = 14;
export const E_BOSS_DMG = 15; //     dmg, hpLeft
export const E_BOSS_DOWN = 16; //    bonus
export const E_ATTACK = 17; //       type, hole, row/hole2
export const E_SPLAT = 18; //        hole, type
export const E_SPLAT_CLEAR = 19; //  hole
export const E_BLOCKED = 20; //      hole
export const E_WIN = 21;
export const E_END = 22;
export const E_BRUISER = 23; //      hole, hpLeft, points
export const E_COIN_BUBBLE = 24; //  hole, points
export const E_PUFF = 25; //         hole (inflate started)

export interface BurstCarry {
  /** Bonk Meter % carried from the previous Burst of the Run. */
  meter: number;
  /** Fever game-time ms still owed from the previous Burst. */
  feverLeft: number;
  streak: number;
}

export const NO_CARRY: BurstCarry = { meter: 0, feverLeft: 0, streak: 0 };

export interface WhackSim {
  // Timeline (struct of arrays; worklet friendly)
  n: number;
  evTell: number[];
  evEmerge: number[];
  evDuck: number[];
  evHole: number[];
  evKind: number[];
  evLink: number[];
  aN: number;
  aType: number[];
  aTell: number[];
  aLand: number[];
  aHole: number[];
  aHole2: number[];
  aRow: number[];
  aState: number[];
  len: number;
  ride: boolean;
  butterOn: boolean;
  feverOn: boolean;
  boss: boolean;
  seed: number;
  // Clock
  t: number;
  next: number;
  ended: boolean;
  frozen: boolean;
  // Holes
  hEv: number[];
  hPh: number[];
  hAt: number[];
  hExt: number[];
  hHelm: number[];
  hLock: number[];
  hHitT: number[];
  hGrade: number[];
  hSplat: number[];
  hSplatType: number[];
  hFade: number[];
  hPuffed: number[];
  // Scoring and meters
  score: number;
  streak: number;
  maxStreak: number;
  tier: number;
  meter: number;
  fever: boolean;
  feverLeft: number;
  coin: number;
  win: boolean;
  winAt: number;
  // Stats
  hits: number;
  legacyHits: number;
  quick: number;
  good: number;
  late: number;
  crits: number;
  goldens: number;
  decoyHits: number;
  whiffs: number;
  butters: number;
  escapes: number;
  engagedEscapes: number;
  freezes: number;
  doubles: number;
  // Input history
  lastTap: number;
  w0: number;
  w1: number;
  quickRun: number;
  blocked: number;
  // Boss
  bossHp: number;
  bossMax: number;
  bossDownAt: number;
  lap: boolean;
  bruiserHp: number;
  scanRow: number;
  scanUntil: number;
  // Logs
  taps: number[];
  tapCount: number;
  emit: boolean;
  ev: number[];
}

function fill(n: number, v: number): number[] {
  'worklet';
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(v);
  return a;
}

export function createSim(tl: Timeline, carry: BurstCarry = NO_CARRY, emit = true): WhackSim {
  const e = tl.events;
  const a = tl.attacks;
  return {
    n: e.length,
    evTell: e.map((x) => x.tellAt),
    evEmerge: e.map((x) => x.emergeAt),
    evDuck: e.map((x) => x.duckAt),
    evHole: e.map((x) => x.hole),
    evKind: e.map((x) => x.kind),
    evLink: e.map((x) => x.linkId),
    aN: a.length,
    aType: a.map((x) => x.type),
    aTell: a.map((x) => x.tellAt),
    aLand: a.map((x) => x.landAt),
    aHole: a.map((x) => x.hole),
    aHole2: a.map((x) => x.hole2),
    aRow: a.map((x) => x.row),
    aState: a.map(() => 0),
    len: tl.lengthMs,
    ride: tl.ride,
    butterOn: tl.butterfingers,
    feverOn: tl.fever,
    boss: tl.boss,
    seed: tl.burstSeed,
    t: 0,
    next: 0,
    ended: false,
    frozen: false,
    hEv: fill(9, -1),
    hPh: fill(9, P_EMPTY),
    hAt: fill(9, 0),
    hExt: fill(9, 0),
    hHelm: fill(9, 0),
    hLock: fill(9, 0),
    hHitT: fill(9, -99999),
    hGrade: fill(9, 0),
    hSplat: fill(9, SPLAT_NONE),
    hSplatType: fill(9, 0),
    hFade: fill(9, 0),
    hPuffed: fill(9, 0),
    score: 0,
    streak: Math.max(0, carry.streak | 0),
    maxStreak: Math.max(0, carry.streak | 0),
    tier: tierFor(Math.max(0, carry.streak | 0)),
    meter: tl.fever ? Math.max(tl.meterStart, Math.min(100, carry.meter)) : 0,
    fever: tl.fever && carry.feverLeft > 0,
    feverLeft: tl.fever ? Math.max(0, carry.feverLeft | 0) : 0,
    coin: 0,
    win: false,
    winAt: -1,
    hits: 0,
    legacyHits: 0,
    quick: 0,
    good: 0,
    late: 0,
    crits: 0,
    goldens: 0,
    decoyHits: 0,
    whiffs: 0,
    butters: 0,
    escapes: 0,
    engagedEscapes: 0,
    freezes: 0,
    doubles: 0,
    lastTap: 0,
    w0: -99999,
    w1: -99999,
    quickRun: 0,
    blocked: 0,
    bossHp: tl.bossHp,
    bossMax: tl.bossHp,
    bossDownAt: -1,
    lap: false,
    bruiserHp: BRUISER_HP,
    scanRow: -1,
    scanUntil: 0,
    taps: [],
    tapCount: 0,
    emit,
    ev: [],
  };
}

function push(s: WhackSim, kind: number, a: number, b: number, c: number): void {
  'worklet';
  if (!s.emit) return;
  s.ev.push(kind, a, b, c, s.t);
}

export function tierFor(streak: number): number {
  'worklet';
  let t = 0;
  for (let i = 0; i < TIER_AT.length; i++) if (streak >= TIER_AT[i]) t = i;
  return t;
}

export function multiplier(s: WhackSim): number {
  'worklet';
  const m = TIER_MULT[s.tier] * (s.fever ? 2 : 1);
  return m > MULT_CAP ? MULT_CAP : m;
}

function upOf(s: WhackSim, h: number): number {
  'worklet';
  const e = s.hEv[h];
  return s.evDuck[e] - s.evEmerge[e] + s.hExt[h];
}

function isDecoyKind(k: number): boolean {
  'worklet';
  return k === K_ANGLER || k === K_PUFFER;
}

function streakBreak(s: WhackSim): void {
  'worklet';
  if (s.streak > 0) {
    push(s, E_BREAK, s.streak, 0, 0);
    s.streak = 0;
    s.tier = 0;
  }
  s.quickRun = 0;
}

function streakHit(s: WhackSim): void {
  'worklet';
  s.streak += 1;
  if (s.streak > s.maxStreak) s.maxStreak = s.streak;
  const t = tierFor(s.streak);
  if (t > s.tier) {
    s.tier = t;
    push(s, E_TIER, t, 0, 0);
  }
}

function addMeter(s: WhackSim, pct: number): void {
  'worklet';
  if (!s.feverOn) return;
  if (s.fever && pct > 0) return; // the meter can't refill during fever
  s.meter += pct;
  if (s.meter < 0) s.meter = 0;
  if (s.meter >= 100 && !s.fever) {
    s.meter = 0;
    s.fever = true;
    s.feverLeft = FEVER_MS;
    push(s, E_FEVER, 1, 0, 0);
  }
}

function addCoin(s: WhackSim, pct: number): void {
  'worklet';
  if (!s.ride || s.win) return;
  s.coin += pct;
  if (s.coin < 0) s.coin = 0;
  if (s.coin >= 100) {
    s.coin = 100;
    s.win = true;
    s.winAt = s.t;
    s.ended = true;
    push(s, E_WIN, 0, 0, 0);
    push(s, E_END, 2, 0, 0);
  }
}

function addScore(s: WhackSim, pts: number): void {
  'worklet';
  s.score += pts;
  if (s.score < 0) s.score = 0;
}

function bossDamage(s: WhackSim, dmg: number): void {
  'worklet';
  if (!s.boss || s.bossHp <= 0 || dmg <= 0) return;
  s.bossHp -= dmg;
  if (s.bossHp < 0) s.bossHp = 0;
  push(s, E_BOSS_DMG, dmg, s.bossHp, 0);
  if (s.bossHp === 0) {
    s.bossDownAt = s.t;
    s.lap = true;
    const bonus = PTS_BOSS_DEFEAT + PTS_LAP_PER_SEC * Math.floor((s.len - s.t) / 1000);
    addScore(s, bonus);
    for (let h = 0; h < 9; h++) {
      if (s.hSplat[h] !== SPLAT_NONE) {
        s.hSplat[h] = SPLAT_NONE;
        push(s, E_SPLAT_CLEAR, h, 0, 0);
      }
    }
    for (let i = 0; i < s.aN; i++) if (s.aState[i] < 2) s.aState[i] = 4;
    push(s, E_BOSS_DOWN, bonus, 0, 0);
  }
}

function cancelNextCandy(s: WhackSim): void {
  'worklet';
  for (let i = 0; i < s.aN; i++) {
    if (s.aType[i] === A_CANDY && s.aState[i] < 2) {
      s.aState[i] = 4;
      const h = s.aHole[i];
      if (s.hSplat[h] === SPLAT_TELL) s.hSplat[h] = SPLAT_NONE;
      s.blocked += 1;
      push(s, E_BLOCKED, h, 0, 0);
      return;
    }
  }
}

function activate(s: WhackSim, i: number): void {
  'worklet';
  const h = s.evHole[i];
  const k = s.evKind[i];
  if (k === K_BRUISER && s.bruiserHp <= 0) return;
  if (s.hPh[h] === P_TELL || s.hPh[h] === P_UP) return; // defensive: timeline keeps holes apart
  s.hEv[h] = i;
  s.hPh[h] = P_TELL;
  s.hAt[h] = s.t;
  s.hExt[h] = 0;
  s.hHelm[h] = k === K_HELMET ? 1 : 0;
  s.hPuffed[h] = 0;
  s.hGrade[h] = 0;
  push(s, E_TELL, h, k, i);
}

function kindAt(s: WhackSim, h: number): number {
  'worklet';
  const k = s.evKind[s.hEv[h]];
  if (s.lap && k === K_TENTACLE) return K_FINN;
  return k;
}

/** One game-time millisecond. */
function tick(s: WhackSim): void {
  'worklet';
  const t = s.t;
  while (s.next < s.n && s.evTell[s.next] <= t) {
    activate(s, s.next);
    s.next += 1;
  }
  for (let h = 0; h < 9; h++) {
    const ph = s.hPh[h];
    if (ph === P_TELL) {
      if (t >= s.evEmerge[s.hEv[h]]) {
        s.hPh[h] = P_UP;
        s.hAt[h] = t;
        push(s, E_EMERGE, h, kindAt(s, h), s.hEv[h]);
      }
    } else if (ph === P_UP) {
      const e = s.hEv[h];
      const k = kindAt(s, h);
      if (k === K_PUFFER && s.hPuffed[h] === 0 && t - s.evEmerge[e] >= Math.floor(upOf(s, h) * 0.5)) {
        s.hPuffed[h] = 1;
        push(s, E_PUFF, h, 0, 0);
      }
      if (t >= s.evDuck[e] + s.hExt[h]) {
        s.hPh[h] = P_ESCAPE;
        s.hAt[h] = t;
        s.escapes += 1;
        let engaged = 0;
        const counts = k === K_FINN || k === K_HELMET || k === K_TWIN || k === K_TENTACLE || k === K_BRUISER;
        if (counts && s.hSplat[h] !== SPLAT_DOWN && t - s.lastTap <= ENGAGED_MS) {
          engaged = 1;
          s.engagedEscapes += 1;
          streakBreak(s);
          addCoin(s, COIN_ESCAPE);
        }
        push(s, E_ESCAPE, h, k, engaged);
      }
    } else if ((ph === P_BONKED || ph === P_ESCAPE) && t - s.hAt[h] >= 700) {
      s.hPh[h] = P_EMPTY;
    }
  }
  // Fever runs on game time only (it pauses in breathers and look-ups).
  if (s.fever) {
    s.feverLeft -= 1;
    if (s.feverLeft <= 0) {
      s.feverLeft = 0;
      s.fever = false;
      push(s, E_FEVER, 0, 0, 0);
    }
  }
  // Attacks: telegraph, then land.
  for (let i = 0; i < s.aN; i++) {
    const st = s.aState[i];
    if (st === 0 && t >= s.aTell[i]) {
      s.aState[i] = 1;
      const type = s.aType[i];
      if (type === A_INK || type === A_CANDY) {
        if (s.hSplat[s.aHole[i]] === SPLAT_NONE) {
          s.hSplat[s.aHole[i]] = SPLAT_TELL;
          s.hSplatType[s.aHole[i]] = type;
        }
      }
      push(s, E_ATTACK, type, s.aHole[i], type === A_SCAN ? s.aRow[i] : s.aHole2[i]);
    } else if (st === 1 && t >= s.aLand[i]) {
      s.aState[i] = 3;
      const type = s.aType[i];
      const h = s.aHole[i];
      if (type === A_INK || type === A_CANDY) {
        s.hSplat[h] = SPLAT_DOWN;
        s.hSplatType[h] = type;
        s.aState[i] = 2;
        push(s, E_SPLAT, h, type, 0);
      } else if (type === A_FADE) {
        s.hFade[h] = t + 2500;
        if (s.aHole2[i] >= 0) s.hFade[s.aHole2[i]] = t + 2500;
      } else if (type === A_SCAN) {
        s.scanRow = s.aRow[i];
        s.scanUntil = t + 900;
      }
    }
  }
  // Auto Look-Up: freeze before any target can escape a disengaged player.
  if (t - s.lastTap >= LOOKUP_IDLE_MS) {
    for (let h = 0; h < 9; h++) {
      if (s.hPh[h] !== P_UP || s.hSplat[h] === SPLAT_DOWN) continue;
      if (isDecoyKind(kindAt(s, h))) continue;
      const e = s.hEv[h];
      if (t >= s.evEmerge[e] + Math.ceil(upOf(s, h) * LOOKUP_FRAC)) {
        s.frozen = true;
        s.freezes += 1;
        push(s, E_FREEZE, h, 0, 0);
        break;
      }
    }
  }
  if (!s.frozen && t >= s.len) {
    s.ended = true;
    push(s, E_END, 0, 0, 0);
  }
}

/** Advance game time by up to `ms` whole milliseconds. Returns ms consumed (stops on freeze or end). */
export function simAdvance(s: WhackSim, ms: number): number {
  'worklet';
  let used = 0;
  while (used < ms && !s.frozen && !s.ended) {
    s.t += 1;
    used += 1;
    tick(s);
  }
  return used;
}

/** Advance to an absolute game time (replay). */
export function simAdvanceTo(s: WhackSim, gt: number): void {
  'worklet';
  if (gt > s.t) simAdvance(s, gt - s.t);
}

function whiff(s: WhackSim, h: number): void {
  'worklet';
  s.whiffs += 1;
  const t = s.t;
  if (s.butterOn && t - s.w0 <= BUTTER_WINDOW_MS) {
    s.butters += 1;
    s.w0 = -99999;
    s.w1 = -99999;
    streakBreak(s);
    addMeter(s, METER_BUTTER);
    addCoin(s, COIN_BUTTER);
    push(s, E_BUTTER, h, 0, 0);
    return;
  }
  s.w0 = s.w1;
  s.w1 = t;
  push(s, E_WHIFF, h, 0, 0);
}

function gradeFor(s: WhackSim, h: number): number {
  'worklet';
  const e = s.hEv[h];
  const into = s.t - s.evEmerge[e];
  const u = upOf(s, h);
  if (s.lap) return G_QUICK;
  if (s.scanRow >= 0 && s.t < s.scanUntil && Math.floor(h / 3) === s.scanRow) return G_QUICK;
  if (into <= u * QUICK_FRAC) return G_QUICK;
  if (into < u * GOOD_FRAC) return G_GOOD;
  return G_LATE;
}

function bonk(s: WhackSim, h: number): void {
  'worklet';
  const e = s.hEv[h];
  const k = kindAt(s, h);
  const t = s.t;
  const m = multiplier(s);

  // Decoys: anglers (coin bubbles in fever) and spiky puffers.
  if (k === K_ANGLER || (k === K_PUFFER && s.hPuffed[h] === 1 && t - s.evEmerge[e] >= Math.floor(upOf(s, h) * 0.5) + 300)) {
    s.hPh[h] = P_BONKED;
    s.hAt[h] = t;
    s.hHitT[h] = t;
    if (k === K_ANGLER && s.fever) {
      addScore(s, PTS_COIN_BUBBLE);
      push(s, E_COIN_BUBBLE, h, PTS_COIN_BUBBLE, 0);
      return;
    }
    s.decoyHits += 1;
    addScore(s, PTS_ANGLER);
    streakBreak(s);
    addMeter(s, METER_ANGLER);
    addCoin(s, COIN_ANGLER);
    s.hLock[h] = t + ANGLER_LOCK_MS;
    push(s, E_DECOY, h, k, PTS_ANGLER);
    return;
  }

  if (k === K_HELMET && s.hHelm[h] === 1) {
    s.hHelm[h] = 0;
    s.hExt[h] += HELMET_EXT_MS;
    const pts = Math.round(PTS_HELMET_POP * m);
    addScore(s, pts);
    s.hHitT[h] = t;
    push(s, E_HELMET, h, pts, 0);
    return;
  }

  if (k === K_BRUISER) {
    s.bruiserHp -= 1;
    s.hits += 1;
    s.legacyHits += 1;
    const pts = Math.round(PTS_BRUISER_HIT * m) + (s.bruiserHp <= 0 ? PTS_BRUISER_KO : 0);
    addScore(s, pts);
    streakHit(s);
    s.hHitT[h] = t;
    if (s.bruiserHp <= 0) {
      s.hPh[h] = P_BONKED;
      s.hAt[h] = t;
    }
    push(s, E_BRUISER, h, s.bruiserHp, pts);
    addCoin(s, COIN_BRUISER);
    return;
  }

  s.hPh[h] = P_BONKED;
  s.hAt[h] = t;
  s.hHitT[h] = t;
  s.hits += 1;
  s.legacyHits += 1;
  streakHit(s);
  const m2 = multiplier(s);

  if (k === K_GOLDEN) {
    s.goldens += 1;
    s.legacyHits += 1; // v1 proof: golden counts double
    s.hGrade[h] = G_QUICK;
    addScore(s, PTS_GOLDEN);
    push(s, E_HIT, h, G_QUICK + 10 * k, PTS_GOLDEN);
    addMeter(s, METER_GOLDEN);
    bossDamage(s, 4);
    s.quickRun = 0;
    addCoin(s, COIN_GOLDEN);
    return;
  }
  if (k === K_SPRINTER) {
    const pts = Math.round(PTS_SPRINTER * m2);
    s.hGrade[h] = G_QUICK;
    s.quick += 1;
    addScore(s, pts);
    push(s, E_HIT, h, G_QUICK + 10 * k, pts);
    addMeter(s, METER_SPRINTER);
    addCoin(s, COIN_BY_GRADE[G_QUICK]);
    return;
  }
  if (k === K_PUFFER) {
    const pts = Math.round(PTS_PUFFER_POKE * m2);
    s.hGrade[h] = G_GOOD;
    addScore(s, pts);
    push(s, E_HIT, h, G_GOOD + 10 * k, pts);
    addMeter(s, METER_BY_GRADE[G_GOOD]);
    return;
  }

  // Finn-class: Finn, helmet (second hit), twin, tentacle.
  const g = gradeFor(s, h);
  const scanned = s.scanRow >= 0 && t < s.scanUntil && Math.floor(h / 3) === s.scanRow && !s.lap;
  let pts = Math.round((k === K_TENTACLE ? PTS_TENTACLE : PTS_FINN[g]) * m2);
  let grade = g;
  let dmg = k === K_TENTACLE ? (g === G_QUICK ? 2 : 1) : 0;
  if (g === G_QUICK) s.quick += 1;
  else if (g === G_GOOD) s.good += 1;
  else s.late += 1;
  if (g === G_QUICK && k === K_FINN && !scanned && mixSeed(s.seed, e + 1) % 10 === 0) {
    grade = G_CRIT;
    s.crits += 1;
    pts += PTS_CRIT;
    dmg += 1;
    addMeter(s, METER_CRIT);
  }
  s.hGrade[h] = grade;
  addScore(s, pts);
  push(s, E_HIT, h, grade + 10 * k, pts);
  if (!scanned) addMeter(s, METER_BY_GRADE[g]);
  addCoin(s, COIN_BY_GRADE[g]);

  if (k === K_TWIN) {
    const link = s.evLink[e];
    for (let o = 0; o < 9; o++) {
      if (o === h || s.hEv[o] < 0 || s.hPh[o] !== P_BONKED) continue;
      if (s.evLink[s.hEv[o]] !== link || s.evKind[s.hEv[o]] !== K_TWIN) continue;
      if (t - s.hHitT[o] <= TWIN_WINDOW_MS) {
        s.doubles += 1;
        addScore(s, PTS_DOUBLE);
        addMeter(s, METER_DOUBLE);
        dmg += 2;
        push(s, E_DOUBLE, h, o, PTS_DOUBLE);
      }
      break;
    }
  }
  bossDamage(s, dmg);

  if (g === G_QUICK) {
    s.quickRun += 1;
    if (s.quickRun >= 3) {
      s.quickRun = 0;
      cancelNextCandy(s);
    }
  } else {
    s.quickRun = 0;
  }
}

/** A touch-down on `hole` at the current game time. */
export function simTap(s: WhackSim, h: number): void {
  'worklet';
  if (s.ended || s.tapCount >= MAX_TAPS || h < 0 || h > 8) return;
  let flags = 0;
  if (s.frozen) {
    s.frozen = false;
    flags |= 1;
    push(s, E_RESUME, h, 0, 0);
  }
  s.taps.push(s.t, h, flags);
  s.tapCount += 1;
  s.lastTap = s.t;
  if (s.hSplat[h] === SPLAT_DOWN) return; // hidden under a splat: swipe it
  if (s.t < s.hLock[h]) return;
  const ph = s.hPh[h];
  if (ph === P_TELL) {
    if (s.t >= s.evEmerge[s.hEv[h]] - EARLY_GRACE_MS) bonk(s, h);
    else whiff(s, h);
    return;
  }
  if (ph === P_UP) {
    bonk(s, h);
    return;
  }
  if (ph === P_BONKED && s.t - s.hHitT[h] < REBONK_IGNORE_MS) return; // a double tap on a bonked target is free
  whiff(s, h);
}

/** A swipe across `hole`: clears a landed splat. Resumes a frozen board like a tap. */
export function simSwipe(s: WhackSim, h: number): void {
  'worklet';
  if (s.ended || s.tapCount >= MAX_TAPS || h < 0 || h > 8) return;
  let flags = TAP_SWIPE;
  if (s.frozen) {
    s.frozen = false;
    flags |= TAP_RESUME;
    push(s, E_RESUME, h, 0, 0);
  }
  s.taps.push(s.t, h, flags);
  s.tapCount += 1;
  s.lastTap = s.t;
  if (s.hSplat[h] === SPLAT_DOWN) {
    s.hSplat[h] = SPLAT_NONE;
    push(s, E_SPLAT_CLEAR, h, 0, 0);
  }
}

/** Resume from Auto Look-Up without a bonk (the READY pad / a tap outside the board). */
export function simUnfreeze(s: WhackSim): void {
  'worklet';
  if (!s.frozen || s.ended || s.tapCount >= MAX_TAPS) return;
  // Logged as a resume tap on hole -1 so the replay unfreezes at the same time.
  s.frozen = false;
  s.taps.push(s.t, -1, TAP_RESUME);
  s.tapCount += 1;
  s.lastTap = s.t;
  push(s, E_RESUME, -1, 0, 0);
}

/** Bank now (line call / BANK & EXIT during play): the Burst ends at the current game time. */
export function simBank(s: WhackSim): void {
  'worklet';
  if (s.ended) return;
  s.ended = true;
  push(s, E_END, 1, 0, 0);
}

export interface BurstResult {
  score: number;
  meter: number;
  win: boolean;
  hits: number;
  legacyHits: number;
  maxStreak: number;
  stars: number;
  freezes: number;
  quick: number;
  good: number;
  late: number;
  crits: number;
  goldens: number;
  decoyHits: number;
  whiffs: number;
  butters: number;
  escapes: number;
  engagedEscapes: number;
  doubles: number;
  blocked: number;
  coin: number;
  winAt: number;
  bossHp: number;
  bossDamage: number;
  bossDown: boolean;
  elapsedMs: number;
  carry: BurstCarry;
}

export function rideStars(s: { win: boolean; winAt: number }): number {
  'worklet';
  if (!s.win) return 0;
  if (s.winAt <= 18000) return 3;
  if (s.winAt <= 24000) return 2;
  return 1;
}

export function simResult(s: WhackSim): BurstResult {
  'worklet';
  return {
    score: s.score,
    meter: Math.round(s.ride ? s.coin : s.meter),
    win: s.win,
    hits: s.hits,
    legacyHits: s.legacyHits,
    maxStreak: s.maxStreak,
    stars: s.ride ? rideStars(s) : 0,
    freezes: s.freezes,
    quick: s.quick,
    good: s.good,
    late: s.late,
    crits: s.crits,
    goldens: s.goldens,
    decoyHits: s.decoyHits,
    whiffs: s.whiffs,
    butters: s.butters,
    escapes: s.escapes,
    engagedEscapes: s.engagedEscapes,
    doubles: s.doubles,
    blocked: s.blocked,
    coin: Math.round(s.coin),
    winAt: s.winAt,
    bossHp: s.bossHp,
    bossDamage: s.bossMax - s.bossHp,
    bossDown: s.bossMax > 0 && s.bossHp === 0,
    elapsedMs: s.t,
    carry: { meter: s.meter, feverLeft: s.feverLeft, streak: s.streak },
  };
}

/**
 * Server-style replay: rebuild the Burst from its timeline and feed the tap
 * log in game time. `endAt` is the logged elapsed game time (a banked Burst
 * ends early). Returns the recomputed result.
 */
export function replayBurst(tl: Timeline, carry: BurstCarry, taps: number[][], endAt?: number): BurstResult {
  const s = createSim(tl, carry, false);
  for (const tap of taps) {
    const [gt, hole, flags] = tap;
    simAdvanceTo(s, gt);
    if (s.ended) break;
    if (hole < 0) {
      if (s.t === gt) simUnfreeze(s);
      continue;
    }
    if (s.t !== gt) break; // cannot reach this stamp: forged or corrupt log
    if (flags & TAP_SWIPE) simSwipe(s, hole);
    else simTap(s, hole);
  }
  const end = endAt ?? tl.lengthMs;
  if (!s.ended) simAdvanceTo(s, end);
  if (!s.ended && s.t >= end && end < tl.lengthMs) simBank(s);
  return simResult(s);
}
