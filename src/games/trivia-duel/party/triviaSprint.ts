/**
 * triviaSprint.ts: the Line Party "Trivia Sprint" round (sim `trivia_sprint`
 * v3, design rev 7 section 7.2), a pure, integer-only simulation shared with
 * the server (Node sidecar bundle, PHP port TriviaSprintSim, golden vectors).
 *
 * 15 bars on the room loop's beat grid = 26,470 board-ms. Three questions of
 * 5 bars each: read 3 beats, answer 14 beats, reveal 3 beats. Every phone
 * builds the same questions from the server's seed; each player sees the
 * tiles in their own order (tileOrder, display only: the log always carries
 * the canonical choice as code 10 + index), so a neighbour's screen gives
 * nothing away.
 *
 * Speed points use LOCAL board-ms from your own question reveal, so latency
 * never decides points: a correct answer inside the 4-beat floor (1,764 ms)
 * scores 500, then it decays linearly to 200 at window close. Streak bonus
 * only (+100 / +200 / +300 for 2 / 3 / 4+ correct in a row). No First Fin,
 * no 50/50 Chomp. A lock is final; taps before the 120 ms bump guard or on a
 * spent question are ignored, never punished.
 *
 * Content is the verified opening-year fact table (True or Tall Tale, "which
 * opened first" pairs and 3-way Which Opened First), so the server needs no
 * authored pool.
 *
 * Rules for this file: integers only, no Math.random, no Date, no floats in
 * state. Math.floor only on non-negative values (equals PHP intdiv).
 */

export const TRIVIA_SPRINT_VERSION = 3;
export const QUESTIONS = 3;
export const EIGHTH_UMS = 220590;
export function grid(k: number): number {
  return Math.floor((k * EIGHTH_UMS) / 1000);
}
/** Per question, in eighths: read 6 (3 beats), answer 28 (14 beats), reveal 6 (3 beats) = 5 bars. */
export const READ_EIGHTHS = 6;
export const ANSWER_EIGHTHS = 28;
export const REVEAL_EIGHTHS = 6;
export const Q_EIGHTHS = READ_EIGHTHS + ANSWER_EIGHTHS + REVEAL_EIGHTHS;
export const ROUND_MS = grid(QUESTIONS * Q_EIGHTHS);
/** Inside the 4-beat floor every correct answer scores the full 500. */
export const FLOOR_MS = grid(8);
export const GUARD_MS = 120;
export const SPEED_MAX = 500;
export const SPEED_MIN = 200;
export const STREAK_BONUS = [0, 0, 100, 200, 300] as const;
/** Answer codes in the log: 10 + canonical choice index. */
export const ANSWER_CODE = 10;
export const MAX_TAPS = 60;

/** Verified facts (mirrors engine/facts.ts: id, short label, opening year). */
export const SPRINT_FACTS: readonly [string, string, number][] = [
  ['dl-park', 'Disneyland', 1955],
  ['dl-matterhorn', 'Matterhorn Bobsleds', 1959],
  ['ush-tour', 'the Universal Studio Tour', 1964],
  ['dl-pirates', 'Pirates of the Caribbean', 1967],
  ['dl-mansion', 'Disneyland’s Haunted Mansion', 1969],
  ['mk-space', 'Magic Kingdom’s Space Mountain', 1975],
  ['dl-space', 'Disneyland’s Space Mountain', 1977],
  ['ak-park', 'Disney’s Animal Kingdom', 1998],
  ['dca-park', 'Disney California Adventure', 2001],
];

export type SprintKind = 'truetale' | 'pair' | 'opened';

export interface SprintQuestion {
  id: number;
  kind: SprintKind;
  /** Fact indices shown (truetale: 1, pair: 2, opened: 3), in display order. */
  facts: number[];
  /** truetale: year shift (0 = TRUE). */
  shift: number;
  choices: number;
  correct: number;
  /** Board-ms the prompt appears (read 3 beats). */
  showAt: number;
  /** Board-ms the tiles open: your own reveal, the zero of speed points. */
  unlockAt: number;
  /** Board-ms answers close (14 beats later); the reveal plays until the next showAt. */
  closeAt: number;
}

/** [board-ms since GO, 10 + canonical choice] */
export type SprintTap = [number, number];

export interface SprintResult {
  score: number;
  hits: number;
  maxStreak: number;
  /** per question: canonical choice or -1 */
  picks: number[];
  /** per question: lock ms from your own reveal, or -1 */
  reactions: number[];
  /** per question: speed points + streak bonus */
  points: number[];
  /** sum of streak bonuses */
  streakBonus: number;
}

/** mulberry32 (identical to bonkRace.rng and the PHP Mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

function pickDistinct(next: () => number, n: number, minGap: number): number[] {
  // Draw n distinct fact indices whose years are at least minGap apart.
  for (let attempt = 0; attempt < 50; attempt++) {
    const out: number[] = [];
    let guard = 0;
    while (out.length < n && guard < 40) {
      guard++;
      const k = next() % SPRINT_FACTS.length;
      let ok = true;
      for (const o of out) if (o === k || Math.abs(SPRINT_FACTS[o][2] - SPRINT_FACTS[k][2]) < minGap) ok = false;
      if (ok) out.push(k);
    }
    if (out.length === n) return out;
  }
  return [0, 4, 8].slice(0, n);
}

export function buildQuestions(seed: number): SprintQuestion[] {
  const next = rng(seed);
  const qs: SprintQuestion[] = [];
  const used: number[] = [];
  for (let i = 0; i < QUESTIONS; i++) {
    const kind: SprintKind = i === 0 ? 'truetale' : i === 1 ? 'pair' : 'opened';
    const showAt = grid(i * Q_EIGHTHS);
    const unlockAt = grid(i * Q_EIGHTHS + READ_EIGHTHS);
    const closeAt = grid(i * Q_EIGHTHS + READ_EIGHTHS + ANSWER_EIGHTHS);
    if (kind === 'truetale') {
      let f = next() % SPRINT_FACTS.length;
      while (used.indexOf(f) >= 0) f = (f + 1) % SPRINT_FACTS.length;
      used.push(f);
      const truthful = next() % 2 === 0;
      const mag = 4 + (next() % 9);
      const shift = truthful ? 0 : next() % 2 === 0 ? -mag : mag;
      qs.push({ id: i, kind, facts: [f], shift, choices: 2, correct: shift === 0 ? 0 : 1, showAt, unlockAt, closeAt });
    } else {
      const n = kind === 'pair' ? 2 : 3;
      const set = pickDistinct(next, n, 2);
      // Display order: a seeded rotation of the drawn set.
      const rot = next() % n;
      const order: number[] = [];
      for (let k = 0; k < n; k++) order.push(set[(k + rot) % n]);
      let best = 0;
      for (let k = 1; k < n; k++) if (SPRINT_FACTS[order[k]][2] < SPRINT_FACTS[order[best]][2]) best = k;
      qs.push({ id: i, kind, facts: order, shift: 0, choices: n, correct: best, showAt, unlockAt, closeAt });
    }
  }
  return qs;
}

export function questionText(q: SprintQuestion): { prompt: string; choices: string[] } {
  if (q.kind === 'truetale') {
    const f = SPRINT_FACTS[q.facts[0]];
    return { prompt: `${f[1]} opened in ${f[2] + q.shift}.`, choices: ['TRUE', 'TALL TALE'] };
  }
  return { prompt: q.kind === 'pair' ? 'Which one opened first?' : 'Which of these opened first?', choices: q.facts.map((k) => SPRINT_FACTS[k][1]) };
}

export function validTaps(taps: unknown): taps is SprintTap[] {
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return false;
  let last = 0;
  for (const tap of taps) {
    if (!Array.isArray(tap) || tap.length !== 2) return false;
    const [t, c] = tap;
    if (!Number.isInteger(t) || !Number.isInteger(c)) return false;
    if (t < 0 || t >= ROUND_MS || c < ANSWER_CODE || c > ANSWER_CODE + 3 || t < last) return false;
    last = t;
  }
  return true;
}

/** Speed points for a correct lock `dt` ms after your own reveal: 500 inside the floor, then linear to 200 at close. */
export function sprintSpeed(dt: number, windowMs: number): number {
  if (dt <= FLOOR_MS) return SPEED_MAX;
  if (dt >= windowMs) return SPEED_MIN;
  return SPEED_MAX - Math.floor(((SPEED_MAX - SPEED_MIN) * (dt - FLOOR_MS)) / (windowMs - FLOOR_MS));
}

export function resolve(qs: SprintQuestion[], taps: SprintTap[]): SprintResult {
  const r: SprintResult = { score: 0, hits: 0, maxStreak: 0, picks: qs.map(() => -1), reactions: qs.map(() => -1), points: qs.map(() => 0), streakBonus: 0 };
  for (const [t, code] of taps) {
    const c = code - ANSWER_CODE;
    for (const q of qs) {
      if (t < q.unlockAt + GUARD_MS || t >= q.closeAt) continue;
      if (r.picks[q.id] >= 0 || c < 0 || c >= q.choices) break;
      r.picks[q.id] = c;
      r.reactions[q.id] = t - q.unlockAt;
      break;
    }
  }
  let streak = 0;
  for (const q of qs) {
    if (r.picks[q.id] === q.correct) {
      streak += 1;
      if (streak > r.maxStreak) r.maxStreak = streak;
      r.hits += 1;
      const bonus = STREAK_BONUS[Math.min(streak, STREAK_BONUS.length - 1)];
      const pts = sprintSpeed(r.reactions[q.id], q.closeAt - q.unlockAt) + bonus;
      r.streakBonus += bonus;
      r.points[q.id] = pts;
      r.score += pts;
    } else streak = 0;
  }
  return r;
}

/**
 * This player's tile order for one question (display only): a seeded
 * permutation of the canonical choices from the round seed, the question and
 * the player id, so side-by-side phones never show the same layout pattern.
 * order[slot] = canonical choice shown in that slot.
 */
export function tileOrder(seed: number, question: SprintQuestion, userId: number): number[] {
  const next = rng((seed + (question.id + 1) * 7919 + (userId % 1000003) * 104729) % 4294967296);
  const order: number[] = [];
  for (let i = 0; i < question.choices; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

export type SprintBotProfile = 'rookie' | 'regular' | 'ace';

/** House crew (Captain Fin and friends): accuracy % and lock-time spread per profile. */
export const SPRINT_BOTS: Record<SprintBotProfile, { acc: number; reactMin: number; reactSpread: number }> = {
  rookie: { acc: 58, reactMin: 1900, reactSpread: 3000 },
  regular: { acc: 72, reactMin: 1300, reactSpread: 2400 },
  ace: { acc: 86, reactMin: 900, reactSpread: 1600 },
};

export function botSeed(seed: number, seat: number): number {
  return (seed + (seat + 1) * 1000003) % 4294967296;
}

export function botTaps(qs: SprintQuestion[], seed: number, seat: number, profile: SprintBotProfile, fromMs = 0): SprintTap[] {
  const p = SPRINT_BOTS[profile] ?? SPRINT_BOTS.regular;
  const next = rng(botSeed(seed, seat));
  const taps: SprintTap[] = [];
  for (const q of qs) {
    const roll = next() % 100;
    const react = p.reactMin + (next() % p.reactSpread);
    const wrong = q.choices > 1 ? (q.correct + 1 + (next() % (q.choices - 1))) % q.choices : q.correct;
    if (q.unlockAt < fromMs) continue;
    const at = q.unlockAt + react;
    if (at >= q.closeAt) continue;
    taps.push([at, ANSWER_CODE + (roll < p.acc ? q.correct : wrong)]);
  }
  return taps;
}

export function ghostFill(qs: SprintQuestion[], seed: number, seat: number, own: SprintTap[], untilMs: number, profile: SprintBotProfile): SprintTap[] {
  const mine = own.filter(([t]) => t < untilMs);
  const merged = [...mine, ...botTaps(qs, seed, seat, profile, untilMs)];
  merged.sort((a, b) => a[0] - b[0]);
  return merged;
}

export function resultHash(r: SprintResult): string {
  const text = [r.score, r.hits, r.maxStreak, r.picks.join('.'), r.reactions.join('.'), r.points.join('.'), r.streakBonus].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
