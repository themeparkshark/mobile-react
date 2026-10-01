/**
 * Match plan, round resolution and ghost records (design 4, 5, 10.5).
 *
 * The UI drives timing; this module decides points. Everything is a pure
 * function of (seed, questions, recorded inputs), so the same record graded
 * on the phone, in a ghost replay and on the server gives the same totals.
 */
import { createRng, mixSeed, rngFloat } from '../../../gamekit/core/rng';
import {
  BUZZ, DAILY_LADDER, POINTS, QUEUE_ROUNDS, RIDE_QUESTIONS, RIDE_ROUND, READ_LOCK, SUDDEN_DEATH, TEMPLATES, UNLOCK_TEMPLATES, UNLOCKS,
  type DuelMode, type FinRank, type QueueRoundKey, type RoundSpec, type SpeedTier,
} from './config';
import { buildDeck, factKeysOf, materializeQuestion, usablePool, type DuelQuestion, type PoolQuestion } from './content';
import { finAnswer, finClosestGuess, finStake, type FinAnswer } from './finAI';
import {
  applyFinal, applyStreak, buzzFirst, buzzPoints, closestPoints, createStreak, creditedSpeed, graceMs, quickPoints,
  readLockMs, relaxedTiming, ridePoints, speedTier, stealPoints, streakMult, type SpeedMods, type StreakEvent, type StreakState,
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

/** 2.3 systems unlocked for this match. */
export interface MatchFeatures {
  chomp: boolean;
  bell: boolean;
  shield: boolean;
  final: boolean;
}

export interface MatchPlan {
  mode: DuelMode;
  seed: number;
  template: number;
  /** Round keys of the queue template actually played (ghost replays rebuild from these). */
  keys?: QueueRoundKey[];
  /** Lifetime queue match number this plan was built for (1-based; unlocks). */
  matchNo?: number;
  features: MatchFeatures;
  rank: FinRank;
  /** C9 Relaxed mode: calmer read-lock, windows, grace and horizon. */
  relaxed?: boolean;
  rounds: PlannedRound[];
  /**
   * 5.5: the second Final card (a different category). Whoever trails after
   * round 4 picks between rounds[final] and this; the played one is recorded.
   * Async modes (ghost, friend, Daily) never get one: the server's rotation sets the Final.
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

/** 2.3: what a player's Nth lifetime queue match unlocks (the ride challenge always has Chomp). */
export function featuresFor(mode: DuelMode, matchNo: number): MatchFeatures {
  if (mode === 'ride') return { chomp: true, bell: false, shield: false, final: false };
  if (mode === 'daily') return { chomp: true, bell: false, shield: true, final: false };
  const n = Math.max(1, Math.floor(matchNo));
  return {
    chomp: n >= UNLOCKS.chompFromMatch,
    bell: n >= UNLOCKS.bellFromMatch,
    shield: n >= UNLOCKS.shieldFromMatch,
    final: n >= UNLOCKS.finalFromMatch,
  };
}

/** Round keys for a queue match: QQQQ on match 1, QQBQ on match 2, then QQBQF / QBQQF by seed. */
export function templateKeys(seed: number, matchNo: number): { keys: QueueRoundKey[]; template: number } {
  if (matchNo <= 1) return { keys: UNLOCK_TEMPLATES[1].slice(), template: -1 };
  if (matchNo === 2) return { keys: UNLOCK_TEMPLATES[2].slice(), template: -2 };
  const template = (seed >>> 0) % TEMPLATES.length;
  return { keys: TEMPLATES[template].slice(), template };
}

export function roundSpecsFor(mode: DuelMode, seed: number, matchNo = 3, keys?: readonly QueueRoundKey[]): { specs: RoundSpec[]; template: number; keys?: QueueRoundKey[] } {
  if (mode === 'ride') return { specs: Array.from({ length: RIDE_QUESTIONS }, () => RIDE_ROUND), template: -1 };
  if (mode === 'daily') {
    return {
      specs: DAILY_LADDER.map((d, i) => ({ ...(i === 4 ? QUEUE_ROUNDS.q4 : QUEUE_ROUNDS.q1), type: 'quick' as const, difficulty: d, formats: ['choice4', 'truetale'] as const })),
      template: -1,
    };
  }
  if (keys && keys.length) return { specs: keys.map((k) => QUEUE_ROUNDS[k]), template: -3, keys: keys.slice() };
  const t = templateKeys(seed, matchNo);
  return { specs: t.keys.map((k) => QUEUE_ROUNDS[k]), template: t.template, keys: t.keys };
}

export interface PlanOptions {
  parkId?: number;
  seen?: readonly string[];
  rank?: FinRank;
  relaxed?: boolean;
  /** Lifetime queue match number (1-based) for unlocks; default 3 (everything on). */
  matchNo?: number;
  /** Async modes (ghost/friend/daily) never get a category pick. */
  async?: boolean;
}

export function planMatch(mode: DuelMode, seed: number, pool: readonly PoolQuestion[], opts: PlanOptions = {}): MatchPlan {
  const matchNo = opts.matchNo ?? 3;
  const { specs, template, keys } = roundSpecsFor(mode, seed, matchNo);
  const deck = buildDeck(pool, specs, { seed, parkId: opts.parkId, seen: opts.seen, ride: mode === 'ride' });
  const family = mode === 'ride' ? 'ride' : 'queue';
  const rounds = specs.map((spec, i) => planRound(spec, deck[i], i, seed, family, !!opts.relaxed));
  const fi = specs.findIndex((sp) => sp.type === 'final');
  let finalAlt: PlannedRound | undefined;
  if (fi >= 0 && !opts.async && (mode === 'queue' || mode === 'practice')) {
    const alt = altFinalQuestion(pool, specs[fi], deck, seed, opts);
    if (alt) finalAlt = planRound(specs[fi], alt, fi, seed, family, !!opts.relaxed);
  }
  return { mode, seed: seed >>> 0, template, keys, matchNo, features: featuresFor(mode, matchNo), rank: opts.rank ?? 'deckhand', relaxed: !!opts.relaxed, rounds, finalAlt };
}

/** A second Final question in a different category that shares no fact with the deck. */
function altFinalQuestion(pool: readonly PoolQuestion[], spec: RoundSpec, deck: readonly DuelQuestion[], seed: number, opts: { parkId?: number; seen?: readonly string[] }): DuelQuestion | null {
  const final = deck[deck.length - 1];
  const used = new Set(deck.map((q) => q.id));
  const facts = new Set(deck.flatMap((q) => factKeysOf(q)));
  const seenAge = new Map((opts.seen ?? []).map((id, i) => [id, i] as const));
  const ok = (q: DuelQuestion | null): q is DuelQuestion => !!q && !used.has(q.id) && q.category !== final.category && !factKeysOf(q).some((f) => facts.has(f));
  // 1) Authored, hardest first, unseen before least-recently seen.
  const r = createRng(mixSeed(seed, 0xca7));
  for (const d of ['hard', 'medium'] as const) {
    const cands = usablePool(pool)
      .filter((q) => q.difficulty === d)
      .map((q) => materializeQuestion(q.id, pool, seed))
      .filter(ok)
      .sort((a, b) => (seenAge.get(a.id) ?? -1) - (seenAge.get(b.id) ?? -1));
    if (cands.length) {
      const fresh = cands.filter((q) => !seenAge.has(q.id));
      const from = fresh.length ? fresh : cands.slice(0, 3);
      return from[Math.floor(rngFloat(r) * from.length)];
    }
  }
  // 2) A generated history item from facts the match hasn't used.
  const rest = [...(opts.seen ?? []), ...used, ...[...facts].map((f) => `fact:${f}`)];
  for (let k = 0; k < 4; k++) {
    const fmt = k < 2 ? 'opened' : 'pair';
    const [q] = buildDeck(pool, [{ ...spec, formats: [fmt] }], { seed: mixSeed(seed, 0xca8 + k), parkId: opts.parkId, seen: rest });
    if (ok(q)) return q;
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
export function planFromIds(mode: DuelMode, seed: number, qids: readonly string[], pool: readonly PoolQuestion[], rank: FinRank = 'deckhand', relaxed = false, keys?: readonly QueueRoundKey[]): MatchPlan | null {
  const { specs, template } = roundSpecsFor(mode, seed, 3, keys);
  if (qids.length < specs.length) return null;
  const family = mode === 'ride' ? 'ride' : 'queue';
  const rounds: PlannedRound[] = [];
  for (let i = 0; i < specs.length; i++) {
    const q = materializeQuestion(qids[i], pool, seed);
    if (!q) return null;
    rounds.push(planRound(specs[i], q, i, seed, family, relaxed));
  }
  const features = featuresFor(mode, 3);
  features.bell = specs.some((sp) => sp.type === 'buzz');
  features.final = specs.some((sp) => sp.type === 'final');
  return { mode, seed: seed >>> 0, template, keys: keys?.slice(), matchNo: 3, features, rank, relaxed, rounds };
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
  /** Bell rounds: ms from unlock when the bell was hit, or -1. */
  buzzMs?: number;
  /**
   * Bell rounds, the side that did not win the bell: its pick after its tiles
   * flipped (1.0s after the other buzz), and ms from that flip. It counts only
   * when the buzzer misses.
   */
  stealChoice?: number;
  stealMs?: number;
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
  /** Bell: this side buzzed and missed (the streak holds). */
  buzzMiss?: boolean;
  streak: StreakEvent | null;
}

export interface RoundResult {
  me: SideResult;
  opp: SideResult;
  /** Bell rounds. */
  buzz?: { first: 'me' | 'opp' | 'none'; firstCorrect: boolean; steal: boolean; open: boolean };
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

export function createTally(carryStreak = 0, carryShield = false, shieldOn = true): MatchTally {
  const side = (s: number, sh: boolean): SideTally => ({ score: 0, correct: 0, answered: 0, fastestMs: -1, bestTier: 'none', streak: createStreak(s, sh, shieldOn), log: [] });
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

  fold(tally.me, me, meRes, participation('me', buzz, meRes));
  if (opp) fold(tally.opp, opp, oppRes, participation('opp', buzz, oppRes));
  tally.round += 1;
  const after = tally.me.score - tally.opp.score;
  // Decisive = the answer that flips the lead, or breaks a tie in the Final (never the first points of a match).
  const decisive = !!opp && ((before < 0 && after > 0) || (before > 0 && after < 0) || (r.spec.type === 'final' && before === 0 && after !== 0));
  return { me: meRes, opp: oppRes, buzz, decisive };
}

type Participation = 'scored' | 'hold' | 'none';

/**
 * How a bell round touches a side's streak (5.3): the buzzer and an open-phase
 * pick are scored; a wrong buzz holds it; a steal counts only when it lands
 * (a failed steal, or a steal pick that never mattered, never touches it).
 */
function participation(side: 'me' | 'opp', buzz: RoundResult['buzz'], res: SideResult): Participation {
  if (!buzz) return 'scored';
  if (buzz.open) return 'scored';
  if (buzz.first === side) return res.correct ? 'scored' : 'hold';
  if (buzz.steal && res.stole) return 'scored';
  return 'none';
}

function fold(side: SideTally, input: SideInput, res: SideResult, part: Participation): void {
  side.score = Math.max(0, side.score + res.points);
  side.log.push(input);
  if (part === 'none') return;
  side.answered += 1;
  if (res.correct) side.correct += 1;
  if (res.correct && res.lockMs >= 0 && (side.fastestMs < 0 || res.lockMs < side.fastestMs)) side.fastestMs = res.lockMs;
  if (TIER_RANK[res.tier] > TIER_RANK[side.bestTier]) side.bestTier = res.tier;
  res.streak = applyStreak(side.streak, res.streakCorrect, part === 'hold');
}

function resolveBuzzSides(r: PlannedRound, me: SideInput, opp: SideInput, tally: MatchTally) {
  const q = r.question;
  const meRes = blankResult();
  const oppRes = blankResult();
  const mb = me.buzzMs ?? -1;
  const ob = opp.buzzMs ?? -1;
  const mods = (i: SideInput): SpeedMods => ({ chomp: i.chomp, holdForfeit: i.holdForfeit });
  if (mb < 0 && ob < 0) {
    // Open phase: nobody rang by 6s; tiles open to everyone for 4s, flat 50 (counts for the streak).
    for (const [inp, res] of [[me, meRes], [opp, oppRes]] as const) {
      res.lockMs = inp.lockMs;
      res.correct = inp.lockMs >= 0 && inp.choice === q.correctIndex;
      res.streakCorrect = res.correct;
      res.points = res.correct ? POINTS.openPhaseFlat : 0;
    }
    return { me: meRes, opp: oppRes, buzz: { first: 'none' as const, firstCorrect: false, steal: false, open: true } };
  }
  // The lower scored time wins the bell (no DEAD HEAT outside live rooms).
  const first: 'me' | 'opp' = mb >= 0 && ob >= 0 ? (buzzFirst(mb, ob) === 'a' ? 'me' : 'opp') : mb >= 0 ? 'me' : 'opp';
  const buzzer = first === 'me' ? me : opp;
  const other = first === 'me' ? opp : me;
  const bRes = first === 'me' ? meRes : oppRes;
  const oRes = first === 'me' ? oppRes : meRes;
  const bTally = first === 'me' ? tally.me : tally.opp;
  const bt = first === 'me' ? mb : ob;
  bRes.buzzedFirst = true;
  bRes.lockMs = bt;
  const firstCorrect = buzzer.choice >= 0 && buzzer.choice === q.correctIndex;
  bRes.correct = firstCorrect;
  bRes.streakCorrect = firstCorrect;
  bRes.buzzMiss = !firstCorrect;
  bRes.points = buzzPoints(firstCorrect, bt, bTally.streak.streak + 1, bTally.streak.shield, mods(buzzer));
  bRes.speed = firstCorrect ? creditedSpeed(bt, BUZZ.graceMs, BUZZ.horizonMs, mods(buzzer)) : 0;
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
  return { me: meRes, opp: oppRes, buzz: { first, firstCorrect, steal, open: false } };
}

// -- Fin as the opponent ---------------------------------------------------------

/**
 * Fin's full input for a round, sampled from his calibrated model. Bell
 * rounds carry everything a replay needs: his buzz (or -1), his pick, and his
 * steal pick timed from his own tile flip (used only if you buzz and miss).
 * He never sees your pick: the steal pick is his own answer.
 */
export function finInput(plan: MatchPlan, r: PlannedRound, tally: MatchTally): { input: SideInput; answer: FinAnswer } {
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
    input.buzzMs = ans.buzzMs >= 0 && ans.buzzMs < BUZZ.buzzWindowMs ? ans.buzzMs : -1;
    // His steal pick lands on his own flip clock (tiles flip 1.0s after your buzz).
    const rr = createRng(mixSeed(plan.seed, 0x57ea1 + r.index));
    input.stealChoice = ans.choice;
    input.stealMs = Math.round(Math.min(BUZZ.answerMs - 300, 650 + rngFloat(rr) * 1500));
    // If he never buzzes, his open-phase pick (from the open flip) is his lock.
    if (input.buzzMs < 0) input.lockMs = Math.round(Math.min(BUZZ.openPhaseMs - 400, 700 + rngFloat(rr) * 1800));
    else input.lockMs = input.buzzMs;
  }
  if (r.spec.type === 'final') {
    const m = streakMult(tally.opp.streak.streak + 1);
    input.stake = finStake(plan.seed, plan.rank, tally.opp.score, tally.me.score, m);
  }
  return { input, answer: ans };
}

/** ms from his buzz to his answer appearing (bell rounds; display timing only). */
export function finBellAnswerMs(plan: MatchPlan, r: PlannedRound): number {
  const q = r.question;
  return finAnswer(plan.seed, r.index, plan.rank, {
    correctIndex: Math.max(0, q.correctIndex), choiceCount: Math.max(1, q.choices.length), windowMs: r.windowMs, graceMs: r.graceMs, stats: q.stats,
  }).answerMs;
}

// -- Ghost records (10.5): under 1KB, replayed on the identical seed. -------------

export interface GhostRecord {
  v: 1 | 2;
  /** v2: round keys of the recorded template (matches 1-2 play shorter templates). */
  keys?: QueueRoundKey[];
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
    v: 2,
    keys: plan.keys?.slice(),
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

/** Compact wire form: `g2.` + JSON with short keys (g1 records still decode). */
export function encodeGhost(g: GhostRecord): string {
  const rows = g.rows.map((r) => [r.choice, r.lockMs, r.guess ?? null, r.buzzMs ?? null, r.stealChoice ?? null, r.stealMs ?? null, r.stake ?? null, r.chomp ? 1 : 0, r.holdForfeit ? 1 : 0]);
  return `g2.${JSON.stringify([g.seed, g.mode, g.name, g.look, g.score, g.correct, g.at, g.qids, rows, g.keys ?? null])}`;
}

export function decodeGhost(s: string): GhostRecord | null {
  const v = s.startsWith('g2.') ? 2 : s.startsWith('g1.') ? 1 : 0;
  if (!v) return null;
  try {
    const [seed, mode, name, look, score, correct, at, qids, rows, keys] = JSON.parse(s.slice(3));
    return {
      v: v as 1 | 2, keys: keys ?? undefined, seed, mode, name, look, score, correct, at, qids,
      rows: (rows as unknown[][]).map((r) => {
        const row: SideInput = { choice: r[0] as number, lockMs: r[1] as number };
        if (r[2] != null) row.guess = r[2] as number;
        if (r[3] != null) row.buzzMs = r[3] as number;
        if (r[4] != null) row.stealChoice = r[4] as number;
        if (r[5] != null) row.stealMs = r[5] as number;
        if (r[6] != null) row.stake = r[6] as number;
        if (r[7]) row.chomp = true;
        if (r[8]) row.holdForfeit = true;
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

/**
 * Ghost input for a round; its recorded wager applies as the same absolute
 * stake, capped at what the ghost holds in this replay (never a free stake).
 */
export function ghostInput(g: GhostRecord, round: number, ghostScoreNow?: number): SideInput {
  const row = g.rows[round] ? { ...g.rows[round] } : { ...NO_INPUT };
  if (row.stake != null && ghostScoreNow != null) row.stake = Math.max(0, Math.min(row.stake, ghostScoreNow));
  return row;
}

export const _test = { scoreQuickSide };
