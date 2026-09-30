/**
 * Question deck for a match (design 9). Pure: given an authored pool, the
 * verified fact table, a seed and a seen list, it builds the exact question
 * for each round, so a ghost or a server grade can rebuild the same set.
 *
 * Formats in v1: Choice-4, True or Tall Tale (2 tiles), pair "which opened
 * first" (2 tiles, generated), Closest Number (slider, generated), Which
 * Opened First (3 tiles, generated). Math and pattern filler is dropped.
 */
import { createRng, mixSeed, rngFloat, rngInt, rngShuffle, type Rng } from '../../../gamekit/core/rng';
import { CLOSEST_TOL, TEXT_LIMITS, type Difficulty, type QuestionFormat, type RoundSpec } from './config';
import { OPENING_FACTS, type OpeningFact } from './facts';
import { priorStats, type QuestionStats } from './finAI';

/** Shape of an authored question (matches services/lineplay TriviaQuestion). */
export interface PoolQuestion {
  readonly id: string;
  readonly rideId?: number;
  readonly parkId?: number;
  readonly question: string;
  readonly choices: readonly string[];
  readonly correctIndex: number;
  readonly difficulty: Difficulty;
  readonly fact?: string;
  readonly source?: string;
  readonly tpsArticleUrl?: string;
}

export interface SliderSpec {
  min: number;
  max: number;
  step: number;
  unit: string;
  truth: number;
  tol: number;
}

export interface DuelQuestion {
  id: string;
  format: QuestionFormat;
  prompt: string;
  choices: string[];
  /** Local key: only present in offline/practice/ghost modes. */
  correctIndex: number;
  difficulty: Difficulty;
  category: string;
  fact?: string;
  source?: string;
  tpsArticleUrl?: string;
  slider?: SliderSpec;
  stats: QuestionStats;
}

/** Pattern and math filler from the old pool (design 9.1: dropped). */
const FILLER_ID = /^gen-(1[3-9]|2\d|3[0-6])$/;
export function isFiller(q: PoolQuestion): boolean {
  return FILLER_ID.test(q.id) && !q.source;
}

export function usablePool(pool: readonly PoolQuestion[], limit: number = TEXT_LIMITS.queue): PoolQuestion[] {
  const seen = new Set<string>();
  const out: PoolQuestion[] = [];
  for (const q of pool) {
    if (seen.has(q.id) || isFiller(q)) continue;
    if (q.question.length > limit + 20) continue;
    if (q.choices.length < 2 || q.correctIndex < 0 || q.correctIndex >= q.choices.length) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

function shuffledChoices(r: Rng, choices: readonly string[], correctIndex: number): { choices: string[]; correctIndex: number } {
  const order = choices.map((_, i) => i);
  rngShuffle(r, order);
  return { choices: order.map((i) => choices[i]), correctIndex: order.indexOf(correctIndex) };
}

function categoryFor(q: PoolQuestion): string {
  if (/\b(19|20)\d\d\b/.test(q.question) || /year/i.test(q.question)) return 'Park History';
  if (q.rideId != null || /ride|coaster|track|mountain|mansion|pirates/i.test(q.question)) return 'Ride History';
  return 'Queue Smarts';
}

function idSeed(seed: number, id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return mixSeed(seed >>> 0, h);
}

function fromPool(seed: number, q: PoolQuestion): DuelQuestion {
  const s = shuffledChoices(createRng(idSeed(seed, q.id)), q.choices, q.correctIndex);
  return {
    id: q.id,
    format: 'choice4',
    prompt: q.question,
    choices: s.choices,
    correctIndex: s.correctIndex,
    difficulty: q.difficulty,
    category: categoryFor(q),
    fact: q.fact,
    source: q.source,
    tpsArticleUrl: q.tpsArticleUrl,
    stats: priorStats(q.difficulty),
  };
}

function factsFor(parkId: number | undefined): OpeningFact[] {
  const local = OPENING_FACTS.filter((f) => parkId != null && f.parkId === parkId);
  return local.length >= 3 ? local : OPENING_FACTS.slice();
}

function pickFacts(r: Rng, facts: OpeningFact[], n: number, minGap: number): OpeningFact[] | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const bag = rngShuffle(r, facts.slice()).slice(0, n);
    bag.sort((a, b) => a.year - b.year);
    let ok = true;
    for (let i = 1; i < bag.length; i++) if (bag[i].year - bag[i - 1].year < minGap) ok = false;
    if (ok) return bag;
  }
  return null;
}

/** True or Tall Tale: a verified statement, or the same fact with a twisted year. */
export function genTrueTale(r: Rng, facts: OpeningFact[]): DuelQuestion {
  const f = facts[rngInt(r, 0, facts.length - 1)];
  const truthful = rngFloat(r) < 0.5;
  const shift = truthful ? 0 : rngInt(r, 4, 12) * (rngFloat(r) < 0.5 ? -1 : 1);
  return trueTaleFrom(f, shift);
}

function trueTaleFrom(f: OpeningFact, shift: number): DuelQuestion {
  return {
    id: `tt~${f.id}~${shift}`,
    format: 'truetale',
    prompt: `${f.name} opened in ${f.year + shift}.`,
    choices: ['TRUE', 'TALL TALE'],
    correctIndex: shift === 0 ? 0 : 1,
    difficulty: 'easy',
    category: f.category,
    fact: `${f.name} opened in ${f.year}.`,
    source: f.source,
    stats: priorStats('easy'),
  };
}

export function genPair(r: Rng, facts: OpeningFact[]): DuelQuestion | null {
  const pick = pickFacts(r, facts, 2, 2);
  if (!pick) return null;
  return pairFrom(pick[0], pick[1], rngFloat(r) < 0.5);
}

function pairFrom(older: OpeningFact, newer: OpeningFact, flip: boolean): DuelQuestion {
  return {
    id: `pair~${older.id}~${newer.id}~${flip ? 1 : 0}`,
    format: 'pair',
    prompt: 'Which one opened first?',
    choices: flip ? [newer.name, older.name] : [older.name, newer.name],
    correctIndex: flip ? 1 : 0,
    difficulty: 'medium',
    category: older.category,
    fact: `${older.name} opened in ${older.year}, ${newer.name} in ${newer.year}.`,
    source: older.source,
    stats: priorStats('medium'),
  };
}

export function genOpenedFirst(r: Rng, facts: OpeningFact[]): DuelQuestion | null {
  const pick = pickFacts(r, facts, 3, 2);
  if (!pick) return null;
  return openedFrom(pick, rngShuffle(r, [0, 1, 2]));
}

function openedFrom(pick: OpeningFact[], order: number[]): DuelQuestion {
  return {
    id: `open3~${pick.map((f) => f.id).join('~')}~${order.join('')}`,
    format: 'opened',
    prompt: 'Which of these opened first?',
    choices: order.map((i) => pick[i].name),
    correctIndex: order.indexOf(0),
    difficulty: 'medium',
    category: pick[0].category,
    fact: `${pick[0].name} opened in ${pick[0].year}.`,
    source: pick[0].source,
    stats: priorStats('medium'),
  };
}

export function genClosest(r: Rng, facts: OpeningFact[]): DuelQuestion {
  const f = facts[rngInt(r, 0, facts.length - 1)];
  return closestFrom(f, rngInt(r, -CLOSEST_TOL.year, CLOSEST_TOL.year));
}

function closestFrom(f: OpeningFact, offset: number): DuelQuestion {
  const tol = CLOSEST_TOL.year;
  const span = 3 * tol;
  return {
    id: `near~${f.id}~${offset}`,
    format: 'closest',
    prompt: `What year did ${f.name} open?`,
    choices: [],
    correctIndex: -1,
    difficulty: 'medium',
    category: f.category,
    fact: `${f.name} opened in ${f.year}.`,
    source: f.source,
    slider: { min: f.year - span + offset, max: f.year + span + offset, step: 1, unit: '', truth: f.year, tol },
    stats: priorStats('medium'),
  };
}

const FACT_BY_ID = new Map(OPENING_FACTS.map((f) => [f.id, f]));

/**
 * Rebuild a question from its id alone (ghost replays, server grading): every
 * generated id carries its parameters, and authored choice order is keyed by
 * (seed, id).
 */
export function materializeQuestion(id: string, pool: readonly PoolQuestion[], seed: number): DuelQuestion | null {
  const parts = id.split('~');
  const fact = (k: string) => FACT_BY_ID.get(k);
  switch (parts[0]) {
    case 'tt': { const f = fact(parts[1]); return f ? trueTaleFrom(f, Number(parts[2])) : null; }
    case 'pair': { const a = fact(parts[1]); const b = fact(parts[2]); return a && b ? pairFrom(a, b, parts[3] === '1') : null; }
    case 'open3': {
      const fs = [fact(parts[1]), fact(parts[2]), fact(parts[3])];
      if (fs.some((f) => !f)) return null;
      return openedFrom(fs as OpeningFact[], parts[4].split('').map(Number));
    }
    case 'near': { const f = fact(parts[1]); return f ? closestFrom(f, Number(parts[2])) : null; }
    default: {
      const q = pool.find((p) => p.id === id);
      return q ? fromPool(seed, q) : null;
    }
  }
}

export interface DeckOptions {
  seed: number;
  parkId?: number;
  /** Ids to avoid (offline LRU / server seen list). */
  seen?: readonly string[];
  /** Ride challenge content limit. */
  ride?: boolean;
}

const DIFF_ORDER: Record<Difficulty, Difficulty[]> = {
  easy: ['easy', 'medium', 'hard'],
  medium: ['medium', 'easy', 'hard'],
  hard: ['hard', 'medium', 'easy'],
};

/**
 * Build one question per round spec. Authored items are preferred at the
 * round's difficulty (unseen first); generated formats fill their slots.
 */
export function buildDeck(pool: readonly PoolQuestion[], rounds: readonly RoundSpec[], opts: DeckOptions): DuelQuestion[] {
  const r = createRng(mixSeed(opts.seed >>> 0, 0x71c1a));
  const usable = usablePool(pool, opts.ride ? TEXT_LIMITS.ride : TEXT_LIMITS.queue);
  const seen = new Set(opts.seen ?? []);
  const used = new Set<string>();
  const facts = factsFor(opts.parkId);
  const out: DuelQuestion[] = [];

  const takeAuthored = (difficulty: Difficulty): DuelQuestion | null => {
    for (const pass of [0, 1]) {
      for (const d of DIFF_ORDER[difficulty]) {
        const cand = usable.filter((q) => q.difficulty === d && !used.has(q.id) && (pass === 1 || !seen.has(q.id)));
        if (cand.length) {
          const q = cand[rngInt(r, 0, cand.length - 1)];
          used.add(q.id);
          return fromPool(opts.seed, q);
        }
      }
    }
    return null;
  };

  for (const spec of rounds) {
    const fmt = spec.formats[rngInt(r, 0, spec.formats.length - 1)];
    let q: DuelQuestion | null = null;
    if (fmt === 'truetale') q = genTrueTale(r, facts);
    else if (fmt === 'pair') q = genPair(r, facts);
    else if (fmt === 'opened') q = genOpenedFirst(r, facts);
    else if (fmt === 'closest') q = genClosest(r, facts);
    if (q && used.has(q.id)) q = null;
    if (!q) q = takeAuthored(spec.difficulty);
    if (!q) q = genTrueTale(r, facts);
    used.add(q.id);
    out.push(q);
  }
  return out;
}

/** 4.4 daily seed: hash(park, park-local date). */
export function dailySeed(parkId: number, isoDate: string): number {
  let h = 0x811c9dc5;
  const s = `${parkId}:${isoDate}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
