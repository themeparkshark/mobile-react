/**
 * Match plan, round resolution and ghost records (design 4, 5, 10.5).
 *
 * The UI drives timing; this module decides points. Everything is a pure
 * function of (seed, questions, recorded inputs), so the same record graded
 * on the phone, in a ghost replay and on the server gives the same totals.
 */
import { createRng, mixSeed, rngFloat } from '../../../gamekit/core/rng';
import {
  BUZZ, DAILY_LADDER, POINTS, QUEUE_ROUNDS, RIDE_QUESTIONS, RIDE_ROUND, READ_LOCK, SUDDEN_DEATH, TEMPLATES,
  type DuelMode, type FinRank, type RoundSpec, type SpeedTier,
} from './config';
import { buildDeck, factKeysOf, materializeQuestion, type DuelQuestion, type PoolQuestion } from './content';
import { finAnswer, finClosestGuess, finStake, type FinAnswer } from './finAI';
import {
  applyFinal, applyStreak, buzzOrder, buzzPoints, closestPoints, createStreak, creditedSpeed, deadHeatPoints, graceMs, quickPoints,
  readLockMs, relaxedTiming, ridePoints, speedTier, stealPoints, type SpeedMods, type StreakEvent, type StreakState,
} from './scoring';

export interface PlannedRound {
  index: number;
  spec: RoundSpec;
  question: DuelQuestion;
  windowMs: number;
  horizonMs: number;
  graceMs: number;
  readLockMs: number;
  /** 0-250ms seeded unlock jitter (5.1). */
  jitterMs: number;
}

export interface MatchPlan {
  mode: DuelMode;
  seed: number;
  template: number;
  rank: FinRank;
  /** C9 Relaxed mode: calmer read-lock, windows, grace and horizon. */
  relaxed?: boolean;
  rounds: PlannedRound[];
  /**
   * C11: the second Final card (a different category). Whoever trails after
   * round 4 picks between rounds[final] and this; the played one is recorded.
   */
  finalAlt?: PlannedRound;
}

export function unlockJitter(seed: number, round: number): number {
  return mixSeed(seed >>> 0, (round + 0x2a) >>> 0) % (READ_LOCK.jitterMax + 1);
}

export function planRound(spec: RoundSpec, q: DuelQuestion, index: number, seed: number, family: 'ride' | 'queue', relaxed = false): PlannedRound {
  const slider = q.format === 'closest';
  const windowMs = slider && spec.sliderWindowMs ? spec.sliderWindowMs : spec.windowMs;
  const horizonMs = slider && spec.sliderHorizonMs ? spec.sliderHorizonMs : spec.horizonMs;
  let timing = {
    windowMs,
    horizonMs: Math.min(horizonMs, windowMs),
    graceMs: slider ? graceMs('slider') : graceMs(q.choices),
    readLockMs: readLockMs(q.prompt.length, family),
  };
  if (relaxed) timing = relaxedTiming(timing);
  return { index, spec, question: q, ...timing, jitterMs: unlockJitter(seed, index) };
}

export function roundSpecsFor(mode: DuelMode, seed: number): { specs: RoundSpec[]; template: number } {
  if (mode === 'ride') return { specs: Array.from({ length: RIDE_QUESTIONS }, () => RIDE_ROUND), template: -1 };
  if (mode === 'daily') {
    return {
      specs: DAILY_LADDER.map((d, i) => ({ ...(i === 4 ? QUEUE_ROUNDS.q4 : QUEUE_ROUNDS.q1), type: 'quick' as const, difficulty: d, formats: ['choice4', 'truetale'] as const })),
      template: -1,
    };
  }
  const template = (seed >>> 0) % TEMPLATES.length;
  return { specs: TEMPLATES[template].map((k) => QUEUE_ROUNDS[k]), template };
}

export function planMatch(mode: DuelMode, seed: number, pool: readonly PoolQuestion[], opts: { parkId?: number; seen?: readonly string[]; rank?: FinRank; relaxed?: boolean } = {}): MatchPlan {
  const { specs, template } = roundSpecsFor(mode, seed);
  const deck = buildDeck(pool, specs, { seed, parkId: opts.parkId, seen: opts.seen, ride: mode === 'ride' });
  const family = mode === 'ride' ? 'ride' : 'queue';
  const rounds = specs.map((spec, i) => planRound(spec, deck[i], i, seed, family, !!opts.relaxed));
  const fi = specs.findIndex((sp) => sp.type === 'final');
  let finalAlt: PlannedRound | undefined;
  if (fi >= 0 && (mode === 'queue' || mode === 'practice')) {
    const alt = altFinalQuestion(pool, specs[fi], deck, seed, opts);
    if (alt) finalAlt = planRound(specs[fi], alt, fi, seed, family, !!opts.relaxed);
  }
  return { mode, seed: seed >>> 0, template, rank: opts.rank ?? 'deckhand', relaxed: !!opts.relaxed, rounds, finalAlt };
}

/** A second Final question in a different category that shares no fact with the deck. */
function altFinalQuestion(pool: readonly PoolQuestion[], spec: RoundSpec, deck: readonly DuelQuestion[], seed: number, opts: { parkId?: number; seen?: readonly string[] }): DuelQuestion | null {
  const final = deck[deck.length - 1];
  const used = new Set(deck.map((q) => q.id));
  const facts = new Set(deck.flatMap((q) => factKeysOf(q)));
  // Authored items first; a generated history item when the authored hard pool is one category.
  const tries: RoundSpec[] = [spec, spec, spec, { ...spec, formats: ['opened'] }, { ...spec, formats: ['opened'] }, { ...spec, formats: ['pair'] }];
  for (let k = 0; k < tries.length; k++) {
    const [q] = buildDeck(pool, [tries[k]], { seed: mixSeed(seed, 0xca7 + k), parkId: opts.parkId, seen: [...(opts.seen ?? []), ...used, ...[...facts].map((f) => `fact:${f}`)] });
    if (!q || used.has(q.id) || q.category === final.category) continue;
    if (factKeysOf(q).some((f) => facts.has(f))) continue;
    return q;
  }
  return null;
}

/**
 * C11: who picks the Final category. The player behind after round 4 picks;
 * on a tie, the side with the slower average lock picks (then you).
 */
export function finalPicker(tally: MatchTally): 'me' | 'opp' {
  if (tally.me.score !== tally.opp.score) return tally.me.score < tally.opp.score ? 'me' : 'opp';
  const avg = (s: SideTally) => {
    const ts = s.log.map((r) => r.lockMs).filter((t) => t >= 0);
    return ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : Infinity;
  };
  return avg(tally.opp) > avg(tally.me) ? 'opp' : 'me';
}

/**
 * Fin's category pick when he trails: the category where your recorded
 * accuracy is lowest (unknown categories count as 0.5), ties to the left card.
 */
export function finCategoryPick(cats: readonly string[], stats: Readonly<Record<string, readonly [number, number]>>): number {
  let best = 0;
  let bestAcc = Infinity;
  cats.forEach((c, i) => {
    const st = stats[c];
    const acc = st && st[0] > 0 ? st[1] / st[0] : 0.5;
    if (acc < bestAcc) { bestAcc = acc; best = i; }
  });
  return best;
}

/** Rebuild the exact plan of a recorded run (ghost duel, server replay). */
export function planFromIds(mode: DuelMode, seed: number, qids: readonly string[], pool: readonly PoolQuestion[], rank: FinRank = 'deckhand', relaxed = false): MatchPlan | null {
  const { specs, template } = roundSpecsFor(mode, seed);
  if (qids.length < specs.length) return null;
  const family = mode === 'ride' ? 'ride' : 'queue';
  const rounds: PlannedRound[] = [];
  for (let i = 0; i < specs.length; i++) {
    const q = materializeQuestion(qids[i], pool, seed);
    if (!q) return null;
    rounds.push(planRound(specs[i], q, i, seed, family, relaxed));
  }
  return { mode, seed: seed >>> 0, template, rank, relaxed, rounds };
}

export function suddenDeathRound(plan: MatchPlan, pool: readonly PoolQuestion[], seen: readonly string[]): PlannedRound {
  const used = plan.rounds.map((r) => r.question.id);
  const deck = buildDeck(pool, [SUDDEN_DEATH], { seed: mixSeed(plan.seed, 0x5dd), seen: [...seen, ...used] });
  return planRound(SUDDEN_DEATH, deck[0], plan.rounds.length, plan.seed, 'queue', !!plan.relaxed);
}

// -- Per-side inputs --------------------------------------------------------------

/** One side's recorded input for a round (also the ghost record row). */
export interface SideInput {
  /** Picked tile, or -1 for none/timeout. */
  choice: number;
  /** ms from unlock at lock (scored time), or -1. */
  lockMs: number;
  /** Closest Number guess. */
  guess?: number;
  /** Buzz rounds: ms from unlock when the bell was hit, or -1. */
  buzzMs?: number;
  /** Steal answer (buzz rounds, when the other side buzzed wrong). */
  stealChoice?: number;
  stealMs?: number;
  /** DEAD HEAT: ms from the blind-pick unlock to this side's pick. */
  answerMs?: number;
  /** Final: chosen stake (absolute points). */
  stake?: number;
  chomp?: boolean;
  holdForfeit?: boolean;
}

export const NO_INPUT: SideInput = { choice: -1, lockMs: -1 };

export interface SideResult {
  correct: boolean;
  /** Counts for the streak (Closest >= 0.8). */
  streakCorrect: boolean;
  points: number;
  speed: number;
  tier: SpeedTier;
  lockMs: number;
  stake: number;
  accuracy?: number;
  bullseye?: boolean;
  buzzedFirst?: boolean;
  stole?: boolean;
  /** Won (or lost) a DEAD HEAT blind pick. */
  deadHeatWon?: boolean;
  streak: StreakEvent | null;
}

export interface RoundResult {
  me: SideResult;
  opp: SideResult;
  /** Buzz rounds. */
  buzz?: { first: 'me' | 'opp' | 'none'; deadHeat: boolean; firstCorrect: boolean; steal: boolean; open: boolean };
  /** The answer that flipped or clinched the lead (server marks `decisive`). */
  decisive: boolean;
}

export interface SideTally {
  score: number;
  correct: number;
  answered: number;
  fastestMs: number;
  bestTier: SpeedTier;
  streak: StreakState;
  log: SideInput[];
}

export interface MatchTally {
  me: SideTally;
  opp: SideTally;
  round: number;
}

export function createTally(carryStreak = 0, carryShield = false): MatchTally {
  const side = (s: number, sh: boolean): SideTally => ({ score: 0, correct: 0, answered: 0, fastestMs: -1, bestTier: 'none', streak: createStreak(s, sh), log: [] });
  return { me: side(carryStreak, carryShield), opp: side(0, false), round: 0 };
}

const TIER_RANK: Record<SpeedTier, number> = { none: 0, nice: 1, great: 2, lightning: 3 };

function blankResult(): SideResult {
  return { correct: false, streakCorrect: false, points: 0, speed: 0, tier: 'none', lockMs: -1, stake: 0, streak: null };
}

function scoreQuickSide(mode: DuelMode, r: PlannedRound, input: SideInput, tally: SideTally): SideResult {
  const q = r.question;
  const res = blankResult();
  res.lockMs = input.lockMs;
  const mods: SpeedMods = { chomp: input.chomp, holdForfeit: input.holdForfeit };
  const answered = input.lockMs >= 0;
  if (q.format === 'closest' && q.slider) {
    if (!answered || input.guess == null) return res;
    const nextStreak = tally.streak.streak + 1;
    const c = closestPoints(input.guess, q.slider.truth, q.slider.tol, input.lockMs, r.horizonMs, nextStreak, mods);
    res.correct = c.correct;
    res.streakCorrect = c.correct;
    res.points = c.points;
    res.accuracy = c.accuracy;
    res.bullseye = c.bullseye;
    res.speed = creditedSpeed(input.lockMs, r.graceMs, r.horizonMs, mods);
    res.tier = c.correct ? speedTier(res.speed) : 'none';
    return res;
  }
  const correct = answered && input.choice === q.correctIndex;
  res.correct = correct;
  res.streakCorrect = correct;
  if (!correct) return res;
  if (mode === 'ride') {
    res.points = ridePoints(true, input.lockMs, r.graceMs, mods, r.horizonMs);
    res.speed = res.points - POINTS.base;
    res.tier = speedTier(Math.round((res.speed / POINTS.rideSpeedMax) * 100));
    return res;
  }
  res.speed = creditedSpeed(input.lockMs, r.graceMs, r.horizonMs, mods);
  res.points = quickPoints(true, input.lockMs, r.graceMs, r.horizonMs, tally.streak.streak + 1, mods);
  res.tier = speedTier(res.speed);
  return res;
}

/**
 * Resolve one round for both sides and fold it into the tally. Returns the
 * per-side results (points already applied, streak events included).
 */
export function resolveRound(mode: DuelMode, r: PlannedRound, me: SideInput, opp: SideInput | null, tally: MatchTally): RoundResult {
  const before = tally.me.score - tally.opp.score;
  let meRes: SideResult;
  let oppRes: SideResult;
  let buzz: RoundResult['buzz'];

  if (r.spec.type === 'buzz' && opp) {
    const out = resolveBuzzSides(r, me, opp, tally);
    meRes = out.me;
    oppRes = out.opp;
    buzz = out.buzz;
  } else {
    meRes = scoreQuickSide(mode, r, me, tally.me);
    oppRes = opp ? scoreQuickSide(mode, r, opp, tally.opp) : blankResult();
  }

  if (r.spec.type === 'final') {
    meRes.stake = me.stake ?? 0;
    const meAfter = applyFinal(tally.me.score, meRes.correct, meRes.points, meRes.stake);
    meRes.points = meAfter - tally.me.score;
    if (opp) {
      oppRes.stake = opp.stake ?? 0;
      const oppAfter = applyFinal(tally.opp.score, oppRes.correct, oppRes.points, oppRes.stake);
      oppRes.points = oppAfter - tally.opp.score;
    }
  }

  fold(tally.me, me, meRes, buzz ? buzz.first !== 'opp' || buzz.open || buzz.steal || buzz.deadHeat : true);
  if (opp) fold(tally.opp, opp, oppRes, buzz ? buzz.first !== 'me' || buzz.open || buzz.steal || buzz.deadHeat : true);
  tally.round += 1;
  const after = tally.me.score - tally.opp.score;
  const decisive = !!opp && (Math.sign(before) !== Math.sign(after)) && after !== 0;
  return { me: meRes, opp: oppRes, buzz, decisive };
}

function fold(side: SideTally, input: SideInput, res: SideResult, participated: boolean): void {
  side.score = Math.max(0, side.score + res.points);
  side.log.push(input);
  if (!participated) return;
  side.answered += 1;
  if (res.correct) side.correct += 1;
  if (res.correct && res.lockMs >= 0 && (side.fastestMs < 0 || res.lockMs < side.fastestMs)) side.fastestMs = res.lockMs;
  if (TIER_RANK[res.tier] > TIER_RANK[side.bestTier]) side.bestTier = res.tier;
  res.streak = applyStreak(side.streak, res.streakCorrect);
}

function resolveBuzzSides(r: PlannedRound, me: SideInput, opp: SideInput, tally: MatchTally) {
  const q = r.question;
  const meRes = blankResult();
  const oppRes = blankResult();
  const mb = me.buzzMs ?? -1;
  const ob = opp.buzzMs ?? -1;
  const mods = (i: SideInput): SpeedMods => ({ chomp: i.chomp, holdForfeit: i.holdForfeit });
  if (mb < 0 && ob < 0) {
    // Open phase: tiles open to everyone, flat 50 for a correct pick.
    for (const [inp, res] of [[me, meRes], [opp, oppRes]] as const) {
      res.lockMs = inp.lockMs;
      res.correct = inp.lockMs >= 0 && inp.choice === q.correctIndex;
      res.streakCorrect = res.correct;
      res.points = res.correct ? POINTS.openPhaseFlat : 0;
    }
    return { me: meRes, opp: oppRes, buzz: { first: 'none' as const, deadHeat: false, firstCorrect: false, steal: false, open: true } };
  }
  let first: 'me' | 'opp';
  let deadHeat = false;
  if (mb >= 0 && ob >= 0) {
    const o = buzzOrder(mb, ob);
    first = o.first === 'a' ? 'me' : 'opp';
    deadHeat = o.deadHeat;
  } else first = mb >= 0 ? 'me' : 'opp';

  if (deadHeat) {
    // DEAD HEAT (5.3): both picked blind; correct beats wrong, then the faster pick.
    const side = (i: SideInput, b: number, t: SideTally) => ({
      correct: i.choice >= 0 && i.choice === q.correctIndex,
      answerMs: i.choice >= 0 ? i.answerMs ?? BUZZ.deadHeatDefaultAnswerMs : Number.MAX_SAFE_INTEGER,
      buzzMs: b,
      streakAfter: t.streak.streak + 1,
      shield: t.streak.shield,
      mods: mods(i),
    });
    const a = side(me, mb, tally.me);
    const b = side(opp, ob, tally.opp);
    const out = deadHeatPoints(a, b, r.graceMs);
    for (const [res, x, pts, won] of [[meRes, a, out.a, out.winner === 'a'], [oppRes, b, out.b, out.winner === 'b']] as const) {
      res.correct = x.correct;
      res.streakCorrect = x.correct;
      res.points = pts;
      res.lockMs = x.buzzMs;
      res.buzzedFirst = won;
      res.deadHeatWon = won;
      res.speed = won ? creditedSpeed(x.buzzMs, r.graceMs, BUZZ.horizonMs, x.mods) : 0;
      res.tier = won ? speedTier(res.speed) : 'none';
    }
    const firstCorrect = first === 'me' ? a.correct : b.correct;
    return { me: meRes, opp: oppRes, buzz: { first, deadHeat: true, firstCorrect, steal: false, open: false } };
  }

  const buzzer = first === 'me' ? me : opp;
  const other = first === 'me' ? opp : me;
  const bRes = first === 'me' ? meRes : oppRes;
  const oRes = first === 'me' ? oppRes : meRes;
  const bTally = first === 'me' ? tally.me : tally.opp;
  const bt = first === 'me' ? mb : ob;
  bRes.buzzedFirst = true;
  bRes.lockMs = bt;
  const firstCorrect = buzzer.choice === q.correctIndex;
  bRes.correct = firstCorrect;
  bRes.streakCorrect = firstCorrect;
  bRes.points = buzzPoints(firstCorrect, bt, r.graceMs, bTally.streak.streak + 1, bTally.streak.shield, mods(buzzer));
  bRes.speed = firstCorrect ? creditedSpeed(bt, r.graceMs, BUZZ.horizonMs, mods(buzzer)) : 0;
  bRes.tier = firstCorrect ? speedTier(bRes.speed) : 'none';
  let steal = false;
  if (!firstCorrect && other.stealChoice != null && other.stealChoice >= 0 && (other.stealMs ?? -1) >= 0) {
    steal = true;
    oRes.stole = other.stealChoice === q.correctIndex;
    oRes.correct = !!oRes.stole;
    oRes.streakCorrect = oRes.correct;
    oRes.lockMs = other.stealMs!;
    oRes.points = stealPoints(oRes.correct, other.stealMs!, mods(other));
    oRes.speed = oRes.correct ? oRes.points - POINTS.stealBase : 0;
    oRes.tier = oRes.correct ? speedTier(oRes.speed) : 'none';
  }
  return { me: meRes, opp: oppRes, buzz: { first, deadHeat: false, firstCorrect, steal, open: false } };
}

// -- Fin as the opponent ---------------------------------------------------------

/** Fin's full input for a round, sampled from his calibrated model. */
export function finInput(plan: MatchPlan, r: PlannedRound, tally: MatchTally, meBuzzWrongChoice = -1): { input: SideInput; answer: FinAnswer } {
  const q = r.question;
  const ans = finAnswer(plan.seed, r.index, plan.rank, {
    correctIndex: Math.max(0, q.correctIndex),
    choiceCount: Math.max(1, q.choices.length),
    windowMs: r.windowMs,
    graceMs: r.graceMs,
    stats: q.stats,
  });
  const input: SideInput = { choice: ans.choice, lockMs: ans.lockMs };
  if (q.format === 'closest' && q.slider) {
    input.guess = finClosestGuess(plan.seed, r.index, plan.rank, q.slider.truth, q.slider.tol, q.stats.p, q.slider.min, q.slider.max);
    input.choice = -1;
  }
  if (r.spec.type === 'buzz') {
    input.buzzMs = ans.buzzMs <= BUZZ.buzzWindowMs ? ans.buzzMs : -1;
    // His blind pick in a DEAD HEAT: the tiles were already face-up, so he picks
    // at a fraction of his calibrated lock time (same accuracy roll, no bluffs).
    const ar = createRng(mixSeed(plan.seed, 0xdea7 + r.index));
    input.answerMs = Math.round(Math.min(BUZZ.answerMs - 300, Math.max(450, ans.lockMs * (0.32 + 0.16 * rngFloat(ar)))));
    if (meBuzzWrongChoice >= 0) {
      // You buzzed wrong first: he steals with his pick, never the crumbled tile.
      const rr = createRng(mixSeed(plan.seed, 0x57ea1 + r.index));
      let pick = ans.choice;
      if (pick === meBuzzWrongChoice) {
        const others = q.choices.map((_, i) => i).filter((i) => i !== meBuzzWrongChoice && i !== q.correctIndex);
        pick = rngFloat(rr) < q.stats.p || !others.length ? q.correctIndex : others[Math.floor(rngFloat(rr) * others.length)];
      }
      input.stealChoice = pick;
      input.stealMs = Math.round(Math.min(BUZZ.answerMs - 400, 700 + rngFloat(rr) * 1600));
    }
  }
  if (r.spec.type === 'final') input.stake = finStake(plan.seed, plan.rank, tally.opp.score, tally.me.score);
  return { input, answer: ans };
}

// -- Ghost records (10.5): under 1KB, replayed on the identical seed. -------------

export interface GhostRecord {
  v: 1;
  seed: number;
  mode: DuelMode;
  name: string;
  /** Shark colour id for the ghost portrait (never a real player's location). */
  look: string;
  score: number;
  correct: number;
  at: number;
  qids: string[];
  rows: SideInput[];
}

export function makeGhost(plan: MatchPlan, tally: MatchTally, name: string, look: string, at: number): GhostRecord {
  return {
    v: 1,
    seed: plan.seed,
    mode: plan.mode,
    name,
    look,
    score: tally.me.score,
    correct: tally.me.correct,
    at,
    qids: plan.rounds.map((r) => r.question.id),
    rows: tally.me.log.map((row) => JSON.parse(JSON.stringify(row)) as SideInput),
  };
}

/** Compact wire form: `g1.` + base64-free JSON with short keys. */
export function encodeGhost(g: GhostRecord): string {
  const rows = g.rows.map((r) => [r.choice, r.lockMs, r.guess ?? null, r.buzzMs ?? null, r.stealChoice ?? null, r.stealMs ?? null, r.stake ?? null, r.chomp ? 1 : 0, r.holdForfeit ? 1 : 0, r.answerMs ?? null]);
  return `g1.${JSON.stringify([g.seed, g.mode, g.name, g.look, g.score, g.correct, g.at, g.qids, rows])}`;
}

export function decodeGhost(s: string): GhostRecord | null {
  if (!s.startsWith('g1.')) return null;
  try {
    const [seed, mode, name, look, score, correct, at, qids, rows] = JSON.parse(s.slice(3));
    return {
      v: 1, seed, mode, name, look, score, correct, at, qids,
      rows: (rows as unknown[][]).map((r) => {
        const row: SideInput = { choice: r[0] as number, lockMs: r[1] as number };
        if (r[2] != null) row.guess = r[2] as number;
        if (r[3] != null) row.buzzMs = r[3] as number;
        if (r[4] != null) row.stealChoice = r[4] as number;
        if (r[5] != null) row.stealMs = r[5] as number;
        if (r[6] != null) row.stake = r[6] as number;
        if (r[7]) row.chomp = true;
        if (r[8]) row.holdForfeit = true;
        if (r[9] != null) row.answerMs = r[9] as number;
        return row;
      }),
    };
  } catch {
    return null;
  }
}

/** Grade a full recorded run solo (server-side replay of a ghost, 10.5). */
export function gradeRun(plan: MatchPlan, rows: readonly SideInput[]): MatchTally {
  const t = createTally();
  plan.rounds.forEach((r, i) => resolveRound(plan.mode, r, rows[i] ?? NO_INPUT, null, t));
  return t;
}

/** Ghost input for a round; its recorded wager applies as the same absolute stake. */
export function ghostInput(g: GhostRecord, round: number): SideInput {
  return g.rows[round] ? { ...g.rows[round] } : { ...NO_INPUT };
}

export const _test = { scoreQuickSide };
